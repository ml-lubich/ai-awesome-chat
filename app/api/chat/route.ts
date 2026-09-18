/**
 * ─── Chat endpoint ──────────────────────────────────────────────────────
 *
 * Streams an agentic loop (model → tool calls → model → …) over OpenRouter
 * and emits SSE frames the client renders incrementally.
 *
 * Order: rate-limit gate → validate history → API key check → concurrency
 * slot → agent loop stream. Every request passes the limiter first — this
 * endpoint spends real money on every call.
 */

import { NextRequest } from "next/server"
import { chatConfig } from "@/chat.config"
import { buildToolSchemas, runTool, ToolMemo } from "@/lib/chat/tools"
import { buildSystemPrompt } from "@/lib/chat/prompt"
import { checkRateLimit, clientIp, buildCookie, acquireSlot, COOKIE_NAME } from "@/lib/chat/rate-limit"
import { FollowupStream } from "@/lib/chat/followups"
import {
    emptyStreamState,
    finalizeAssistantTurn,
    formatCascadeFailure,
    ingestCompletionChunk,
    type CascadeAttempt,
} from "@/lib/chat/stream"

export const runtime = "nodejs"
export const maxDuration = 60

interface ChatMessage {
    role: "user" | "assistant" | "system" | "tool"
    content: string
    tool_calls?: ToolCall[]
    tool_call_id?: string
}

interface ToolCall {
    id: string
    type: "function"
    function: { name: string; arguments: string }
}

export async function POST(req: NextRequest) {
    const gate = checkRateLimit(chatConfig.rateLimit, clientIp(req.headers), req.cookies.get(COOKIE_NAME)?.value)
    if (!gate.ok) {
        return json({ error: rateLimitMessage(gate.reason), retryAfter: gate.retryAfterSec }, 429, {
            "Retry-After": String(gate.retryAfterSec),
        })
    }

    const history = parseHistory(await readJson(req))
    if (history.length === 0) return json({ error: "Send a message." }, 400)

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return json({ error: "Chat is not configured." }, 503)

    const release = acquireSlot(chatConfig.rateLimit, clientIp(req.headers))
    if (!release) {
        return json({ error: "You already have a message in flight. Wait for it to finish." }, 429, { "Retry-After": "5" })
    }

    const stream = runAgent(history, apiKey, release)
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            Connection: "keep-alive",
            "Set-Cookie": buildCookie(chatConfig.rateLimit, gate.cookie),
            "X-RateLimit-Remaining": String(gate.remaining),
        },
    })
}

/* ── Agent loop ──────────────────────────────────────────────────────── */

function runAgent(history: ChatMessage[], apiKey: string, release: () => void): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()

    return new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            }

            const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(chatConfig) }, ...history]

            try {
                await runToolRounds(messages, apiKey, send)
            } catch (err) {
                send("error", { message: err instanceof Error ? err.message : "Chat failed." })
            } finally {
                controller.close()
                release()
            }
        },
    })
}

async function runToolRounds(messages: ChatMessage[], apiKey: string, send: (event: string, data: unknown) => void): Promise<void> {
    const memo = new ToolMemo()
    const toolPayloads: string[] = []

    for (let round = 0; round < chatConfig.limits.maxToolRounds; round++) {
        const reply = await callModel(messages, apiKey, send)
        const decision = finalizeAssistantTurn(reply, toolPayloads)

        if (decision.kind !== "tools") {
            if (decision.kind === "fallback") send("text", decision.text)
            if (reply.followups?.length) send("followups", reply.followups)
            send("done", {})
            return
        }

        messages.push(reply)
        runToolCalls(reply.tool_calls ?? [], messages, memo, toolPayloads, send)
    }

    send("text", "I looked that up a few different ways but couldn't land on a clean answer. Try asking more specifically?")
    send("done", {})
}

function runToolCalls(
    calls: ToolCall[],
    messages: ChatMessage[],
    memo: ToolMemo,
    toolPayloads: string[],
    send: (event: string, data: unknown) => void,
): void {
    for (const call of calls) {
        const args = safeParseArgs(call.function.arguments)

        const prior = memo.recall(call.function.name, args)
        if (prior !== null) {
            messages.push({ role: "tool", tool_call_id: call.id, content: memo.repeatNotice(call.function.name, prior) })
            continue
        }

        send("tool", { name: call.function.name })
        const result = runTool(chatConfig, call.function.name, args)
        if ("meeting" in result) send("meeting", result.meeting)
        if ("resume" in result) send("resume", result.resume)
        if ("contact" in result) send("contact", result.contact)

        const serialized = JSON.stringify(result).slice(0, 6000)
        memo.remember(call.function.name, args, serialized)
        toolPayloads.push(serialized)
        messages.push({ role: "tool", tool_call_id: call.id, content: serialized })
    }
}

/** Calls the model, streaming text deltas out as they arrive; returns the assembled reply. */
async function callModel(
    messages: ChatMessage[],
    apiKey: string,
    send: (event: string, data: unknown) => void,
): Promise<ChatMessage & { followups?: string[] }> {
    const res = await fetchWithFallback(messages, apiKey)
    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body from the model.")

    const decoder = new TextDecoder()
    let buffer = ""
    const followupFilter = new FollowupStream()
    const state = emptyStreamState()

    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = consumeSseLines(buffer, state, followupFilter, send)
    }

    const { tail, followups } = followupFilter.finish()
    if (tail) send("text", tail)

    const calls = [...state.toolCalls.values()].filter((c) => c.function.name)
    return {
        role: "assistant",
        content: state.content,
        ...(calls.length ? { tool_calls: calls } : {}),
        ...(followups.length ? { followups } : {}),
    }
}

function consumeSseLines(
    buffer: string,
    state: ReturnType<typeof emptyStreamState>,
    followupFilter: FollowupStream,
    send: (event: string, data: unknown) => void,
): string {
    const lines = buffer.split("\n")
    const rest = lines.pop() ?? ""

    for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const payload = line.slice(6).trim()
        if (payload === "[DONE]") continue

        const parsed = safeParseJson(payload)
        if (parsed === undefined) continue

        const before = state.content
        ingestCompletionChunk(state, parsed)
        const added = state.content.slice(before.length)
        if (added) {
            const visible = followupFilter.push(added)
            if (visible) send("text", visible)
        }
    }
    return rest
}

function safeParseJson(payload: string): unknown {
    try {
        return JSON.parse(payload)
    } catch {
        return undefined
    }
}

/** Tries each model in `chatConfig.models` in order; a non-2xx moves to the next. */
async function fetchWithFallback(messages: ChatMessage[], apiKey: string): Promise<Response> {
    const attempts: CascadeAttempt[] = []

    for (const model of chatConfig.models) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "X-Title": chatConfig.botName,
            },
            body: JSON.stringify({
                model,
                messages,
                tools: buildToolSchemas(chatConfig),
                tool_choice: "auto",
                stream: true,
                reasoning: { exclude: true },
                max_tokens: chatConfig.limits.maxTokens,
                temperature: 0.3,
            }),
        })

        if (res.ok && res.body) return res
        attempts.push({ model, status: res.status, body: (await res.text()).slice(0, 200) })
    }

    throw new Error(formatCascadeFailure(attempts))
}

/* ── Input handling ──────────────────────────────────────────────────── */

async function readJson(req: NextRequest): Promise<unknown> {
    try {
        return await req.json()
    } catch {
        return {}
    }
}

/** Trusts nothing from the client: roles, lengths and history depth are all clamped. */
function parseHistory(body: unknown): ChatMessage[] {
    if (typeof body !== "object" || body === null) return []
    const raw = (body as { messages?: unknown }).messages
    if (!Array.isArray(raw)) return []

    const clean: ChatMessage[] = []
    for (const m of raw.slice(-chatConfig.limits.maxHistory)) {
        if (typeof m !== "object" || m === null) continue
        const { role, content } = m as { role?: unknown; content?: unknown }
        if (role !== "user" && role !== "assistant") continue
        if (typeof content !== "string" || !content.trim()) continue
        clean.push({ role, content: content.slice(0, chatConfig.limits.maxMessageChars) })
    }
    return clean
}

function safeParseArgs(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw || "{}")
        return typeof parsed === "object" && parsed !== null ? parsed : {}
    } catch {
        return {}
    }
}

const RATE_LIMIT_MESSAGES: Record<"burst" | "cookie" | "ip" | "global" | "replay", string> = {
    burst: "Slow down a moment — too many messages at once.",
    global: "This chat is at capacity right now. Try again later.",
    replay: "That session looks stale. Reload the page and try again.",
    cookie: "You've hit the hourly message limit. Try again a bit later.",
    ip: "You've hit the hourly message limit. Try again a bit later.",
}

function rateLimitMessage(reason: "burst" | "cookie" | "ip" | "global" | "replay"): string {
    return RATE_LIMIT_MESSAGES[reason]
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })
}
