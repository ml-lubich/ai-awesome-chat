/**
 * ─── OpenRouter stream ingest + empty-final recovery ──────────────────
 *
 * Two failure modes this guards against:
 *
 * 1. Some models put the answer on `choices[0].message` and never emit a
 *    `delta.content` string. Reading only deltas drops a real reply.
 * 2. Some models call tools, get the payload, and then emit nothing. A
 *    silent final after tools is not success — the caller writes a
 *    grounded fallback from the tool JSON rather than a blank bubble.
 */

export interface StreamToolCall {
    id: string
    type: "function"
    function: { name: string; arguments: string }
}

export interface StreamState {
    content: string
    toolCalls: Map<number, StreamToolCall>
}

export function emptyStreamState(): StreamState {
    return { content: "", toolCalls: new Map() }
}

export function ingestCompletionChunk(state: StreamState, chunk: unknown): void {
    if (typeof chunk !== "object" || chunk === null) return
    const choice = (chunk as { choices?: unknown[] }).choices?.[0]
    if (typeof choice !== "object" || choice === null) return

    const delta = (choice as { delta?: unknown }).delta
    const message = (choice as { message?: unknown }).message

    const deltaContent = readContent(field(delta, "content"))
    if (deltaContent) state.content += deltaContent
    else if (!state.content) {
        const messageContent = readContent(field(message, "content"))
        if (messageContent) state.content = messageContent
    }

    applyToolFragments(state, field(delta, "tool_calls"))
    if (state.toolCalls.size === 0) applyToolFragments(state, field(message, "tool_calls"))
}

function field(obj: unknown, key: string): unknown {
    if (typeof obj !== "object" || obj === null) return undefined
    return (obj as Record<string, unknown>)[key]
}

function readContent(value: unknown): string {
    if (typeof value === "string") return value
    if (!Array.isArray(value)) return ""
    return value
        .map((part) => {
            if (typeof part === "string") return part
            if (typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string") {
                return (part as { text: string }).text
            }
            return ""
        })
        .join("")
}

function applyToolFragments(state: StreamState, raw: unknown): void {
    if (!Array.isArray(raw)) return
    for (const frag of raw) applyOneFragment(state, frag)
}

function applyOneFragment(state: StreamState, frag: unknown): void {
    if (typeof frag !== "object" || frag === null) return
    const index = typeof (frag as { index?: unknown }).index === "number" ? (frag as { index: number }).index : 0
    const existing = state.toolCalls.get(index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } }

    const id = (frag as { id?: unknown }).id
    if (typeof id === "string" && id) existing.id = id

    const fn = (frag as { function?: unknown }).function
    if (typeof fn === "object" && fn !== null) {
        const name = (fn as { name?: unknown }).name
        const args = (fn as { arguments?: unknown }).arguments
        if (typeof name === "string" && name) existing.function.name = name
        if (typeof args === "string" && args) existing.function.arguments += args
    }
    state.toolCalls.set(index, existing)
}

export interface AssistantTurn {
    content: string
    tool_calls?: StreamToolCall[]
    followups?: string[]
}

export type TurnDecision =
    | { kind: "tools" }
    | { kind: "answer"; text: string }
    | { kind: "fallback"; text: string }

/** After a model round: keep looping, accept the text, or recover from silence. */
export function finalizeAssistantTurn(reply: AssistantTurn, toolPayloads: string[]): TurnDecision {
    if (reply.tool_calls?.length) return { kind: "tools" }
    const text = reply.content.trim()
    if (text) return { kind: "answer", text: reply.content }
    if (toolPayloads.length) return { kind: "fallback", text: fallbackFromToolPayloads(toolPayloads) }
    return { kind: "answer", text: "" }
}

/** Generic recovery: names whatever entries came back, so an empty final
 *  reply still shows the visitor something grounded in real data. */
export function fallbackFromToolPayloads(payloads: string[]): string {
    const names = collectEntryTitles(payloads)
    if (!names.length) return "I looked that up but nothing useful came back. Try asking more specifically?"
    return `Here is what I found:\n${names.map((n) => `• ${n}`).join("\n")}`
}

function collectEntryTitles(payloads: string[]): string[] {
    const titles: string[] = []
    for (const raw of payloads) {
        const data = parseJson(raw)
        const rows = data?.matches ?? data?.entries
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
            if (typeof row !== "object" || row === null) continue
            const title = (row as Record<string, unknown>).title
            if (typeof title === "string" && title.trim()) titles.push(title.trim())
        }
    }
    return [...new Set(titles)].slice(0, 8)
}

function parseJson(raw: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(raw) as unknown
        return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
    } catch {
        return null
    }
}

export interface CascadeAttempt {
    model: string
    status: number
    body: string
}

export function formatCascadeFailure(attempts: CascadeAttempt[]): string {
    if (!attempts.length) return "No model responded."
    return attempts.map((a) => `${a.model}: ${a.status} ${a.body.slice(0, 200)}`).join(" | ")
}
