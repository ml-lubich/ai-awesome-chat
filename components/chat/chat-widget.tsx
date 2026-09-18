"use client"

/**
 * ─── Chat widget ────────────────────────────────────────────────────────
 *
 * Floating launcher + panel, config-driven end to end. Talks to
 * `/api/chat`, which streams SSE frames: `text` (token delta), `tool` (a
 * lookup started), `meeting`/`resume`/`contact` (a hand-off card spec),
 * `followups`, `error`, `done`.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
    ArrowUp,
    Check,
    Copy,
    Loader2,
    Maximize2,
    MessageSquarePlus,
    Minimize2,
    Pencil,
    RotateCcw,
    Sparkles,
    Square,
    X,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { chatConfig, type ChatConfig } from "@/chat.config"
import { splitChatSegments } from "@/lib/chat/segments"
import { clampFollowup, splitFollowup, type Followup } from "@/lib/chat/followups"
import { isPinnedToBottom } from "@/lib/chat/scroll"
import { collapseToolSteps, TOOL_LABELS, type ToolStep } from "@/lib/chat/tool-labels"
import type { ContactResult, MeetingResult, ResumeResult } from "@/lib/chat/tools"
import { MermaidDiagram } from "./mermaid-diagram"
import { ContactCard, MeetingCard, ResumeCard } from "./handoff-cards"
import "./chat.css"

interface Turn {
    role: "user" | "assistant"
    content: string
    tools?: ToolStep[]
    followups?: Followup[]
    meeting?: MeetingResult
    resume?: ResumeResult
    contact?: ContactResult
}

type Patch = (fn: (t: Turn) => Turn) => void

/* ── Streaming: event handling ──────────────────────────────────────── */

/** A lookup has returned once anything follows it. */
function settleTools(t: Turn): Turn {
    return t.tools?.some((s) => !s.done) ? { ...t, tools: t.tools.map((s) => ({ ...s, done: true })) } : t
}

function applyToolEvent(data: unknown, patch: Patch): void {
    const name = (data as { name: string }).name
    patch((t) => {
        const prev = settleTools(t)
        return { ...prev, tools: [...(prev.tools ?? []), { name, done: false }] }
    })
}

function applyFollowupsEvent(data: unknown, patch: Patch): void {
    patch((t) => ({
        ...t,
        followups: (data as (string | Followup)[]).map((f) => (typeof f === "string" ? splitFollowup(f) : f)),
    }))
}

const EVENT_HANDLERS: Record<string, (data: unknown, patch: Patch) => void> = {
    text: (data, patch) => patch((t) => ({ ...settleTools(t), content: t.content + String(data) })),
    tool: applyToolEvent,
    meeting: (data, patch) => patch((t) => ({ ...t, meeting: data as MeetingResult })),
    resume: (data, patch) => patch((t) => ({ ...t, resume: data as ResumeResult })),
    contact: (data, patch) => patch((t) => ({ ...t, contact: data as ContactResult })),
    followups: applyFollowupsEvent,
    error: (data, patch) => patch((t) => ({ ...t, content: (data as { message: string }).message })),
}

function parseSseFrame(frame: string): { event: string; data: unknown } | null {
    const event = frame.match(/^event: (.+)$/m)?.[1]
    const raw = frame.match(/^data: (.+)$/m)?.[1]
    if (!event || !raw) return null
    try {
        return { event, data: JSON.parse(raw) }
    } catch {
        return null
    }
}

function applySseFrame(frame: string, patch: Patch): void {
    const parsed = parseSseFrame(frame)
    if (!parsed) return
    EVENT_HANDLERS[parsed.event]?.(parsed.data, patch)
}

async function streamReply(history: Turn[], signal: AbortSignal, patch: Patch): Promise<void> {
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
    })

    if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: "Something went wrong." }))
        patch((t) => ({ ...t, content: error ?? "Something went wrong." }))
        return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) applySseFrame(frame, patch)
    }
}

function handleSendError(err: unknown, patch: Patch): void {
    if ((err as Error)?.name === "AbortError") {
        patch((t) => (t.content || t.tools?.length ? t : { ...t, content: "Stopped." }))
        return
    }
    patch((t) => ({ ...t, content: "Couldn't reach the server. Check your connection and try again." }))
}

/* ── Session hook ────────────────────────────────────────────────────── */

function useChatSession() {
    const [turns, setTurns] = useState<Turn[]>([])
    const [input, setInput] = useState("")
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState<{ index: number; draft: string } | null>(null)

    const abortRef = useRef<AbortController | null>(null)
    const busyRef = useRef(false)
    const runRef = useRef(0)

    const stop = useCallback(() => abortRef.current?.abort(), [])

    const newChat = useCallback(() => {
        runRef.current++
        stop()
        setTurns([])
        setInput("")
        setEditing(null)
    }, [stop])

    const send = useCallback(
        async (text: string, from?: number) => {
            const question = text.trim()
            if (!question || busyRef.current) return
            busyRef.current = true
            const run = ++runRef.current
            setInput("")
            setEditing(null)
            setBusy(true)

            const history = [...turns.slice(0, from ?? turns.length), { role: "user" as const, content: question }]
            setTurns([...history, { role: "assistant", content: "", tools: [] }])

            const patch: Patch = (fn) => {
                if (runRef.current !== run) return
                setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? fn(t) : t)))
            }

            const controller = new AbortController()
            abortRef.current = controller

            try {
                await streamReply(history, controller.signal, patch)
            } catch (err) {
                handleSendError(err, patch)
            } finally {
                if (abortRef.current === controller) abortRef.current = null
                patch(settleTools)
                busyRef.current = false
                setBusy(false)
            }
        },
        [turns],
    )

    const retry = useCallback(() => {
        const i = turns.findLastIndex((t) => t.role === "user")
        if (i >= 0) send(turns[i].content, i)
    }, [send, turns])

    return { turns, input, setInput, busy, editing, setEditing, send, retry, stop, newChat }
}

/* ── Presentational pieces ──────────────────────────────────────────── */

function ChatLauncher({ open, botName, onToggle }: { open: boolean; botName: string; onToggle: () => void }) {
    return (
        <div className="cc-launcher-slot">
            <button
                type="button"
                className="cc-launcher"
                onClick={onToggle}
                aria-label={open ? `Close ${botName}` : `Chat with ${botName}`}
                aria-expanded={open}
            >
                {open ? <X size={20} /> : <Sparkles size={20} />}
                {!open && <span className="cc-launcher-pulse" aria-hidden />}
            </button>
        </div>
    )
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!copied) return
        const id = setTimeout(() => setCopied(false), 1600)
        return () => clearTimeout(id)
    }, [copied])

    return (
        <button
            type="button"
            className="cc-action-btn"
            aria-label={label}
            title={label}
            onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
        >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? <span>Copied</span> : null}
        </button>
    )
}

function ToolStepRow({ name, done, index }: ToolStep & { index: number }) {
    const label = TOOL_LABELS[name]
    if (!label) return null
    return (
        <p className="cc-tool-row" data-done={done}>
            <span className="cc-tool-badge">{index + 1}</span>
            {done ? <Check size={13} aria-hidden /> : <Loader2 size={13} className="cc-spin" aria-hidden />}
            <span>{label}</span>
        </p>
    )
}

function ThinkingIndicator() {
    return (
        <span className="cc-thinking">
            Thinking
            <span className="cc-dots" aria-hidden>
                <i />
                <i />
                <i />
            </span>
        </span>
    )
}

function AssistantSegments({ content }: { content: string }) {
    return (
        <>
            {splitChatSegments(content).map((seg, j) =>
                seg.kind === "mermaid" ? (
                    <MermaidDiagram key={j} source={seg.source} />
                ) : (
                    <div key={j} className="cc-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.value}</ReactMarkdown>
                    </div>
                ),
            )}
        </>
    )
}

function EmptyState({ config, busy, onAsk }: { config: ChatConfig; busy: boolean; onAsk: (q: string) => void }) {
    return (
        <div>
            <p className="cc-intro">{config.greeting}</p>
            <div className="cc-starters">
                {config.starters.map((s) => (
                    <button key={s} type="button" className="cc-pill" disabled={busy} onClick={() => onAsk(s)}>
                        {s}
                    </button>
                ))}
            </div>
        </div>
    )
}

interface AssistantTurnProps {
    turn: Turn
    busy: boolean
    isLast: boolean
    onRetry: () => void
    onAsk: (q: string) => void
}

function AssistantTurnView({ turn, busy, isLast, onRetry, onAsk }: AssistantTurnProps) {
    const showThinking = busy && isLast && !turn.content && !turn.tools?.length
    const showActions = !busy && turn.content.length > 0

    return (
        <div className="cc-turn-assistant">
            {collapseToolSteps(turn.tools ?? []).map((step, j) => (
                <ToolStepRow key={j} {...step} index={j} />
            ))}

            {turn.meeting && <MeetingCard meeting={turn.meeting} />}
            {turn.resume && <ResumeCard resume={turn.resume} />}
            {turn.contact && <ContactCard contact={turn.contact} />}

            <AssistantSegments content={turn.content} />

            {showThinking && <ThinkingIndicator />}

            {showActions && (
                <div className="cc-actions">
                    <CopyButton text={turn.content} label="Copy answer" />
                    {isLast && (
                        <button type="button" className="cc-action-btn" onClick={onRetry} aria-label="Retry" title="Retry">
                            <RotateCcw size={13} />
                            <span>Retry</span>
                        </button>
                    )}
                </div>
            )}

            {turn.followups?.length ? (
                <div className="cc-followups">
                    {turn.followups.map((q) => (
                        <button
                            key={q.question}
                            type="button"
                            className="cc-pill"
                            disabled={busy}
                            onClick={() => onAsk(q.question)}
                            title={q.question}
                        >
                            {clampFollowup(q.label)}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

interface UserTurnProps {
    turn: Turn
    index: number
    busy: boolean
    editing: { index: number; draft: string } | null
    onEditStart: (index: number, draft: string) => void
    onEditCancel: () => void
    onEditChange: (draft: string) => void
    onResend: (text: string, from: number) => void
}

function UserEditForm({ index, draft, onEditCancel, onEditChange, onResend }: Omit<UserTurnProps, "turn" | "busy" | "editing"> & { draft: string }) {
    return (
        <form
            className="cc-edit-form"
            onSubmit={(e) => {
                e.preventDefault()
                onResend(draft, index)
            }}
        >
            <textarea
                autoFocus
                className="cc-edit-textarea"
                value={draft}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") onEditCancel()
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        onResend(draft, index)
                    }
                }}
                rows={2}
                maxLength={1000}
                aria-label="Edit your message"
            />
            <div className="cc-edit-actions">
                <button type="button" className="cc-action-btn" onClick={onEditCancel}>
                    Cancel
                </button>
                <button type="submit" className="cc-card-btn-primary" disabled={!draft.trim()}>
                    Resend
                </button>
            </div>
        </form>
    )
}

function UserTurnView({ turn, index, busy, editing, onEditStart, onEditCancel, onEditChange, onResend }: UserTurnProps) {
    if (editing) {
        return (
            <UserEditForm
                index={index}
                draft={editing.draft}
                onEditStart={onEditStart}
                onEditCancel={onEditCancel}
                onEditChange={onEditChange}
                onResend={onResend}
            />
        )
    }

    return (
        <div className="cc-turn-user">
            <p className="cc-bubble-user">{turn.content}</p>
            {!busy && (
                <div className="cc-actions">
                    <CopyButton text={turn.content} label="Copy message" />
                    <button
                        type="button"
                        className="cc-action-btn"
                        onClick={() => onEditStart(index, turn.content)}
                        aria-label="Edit message"
                        title="Edit message"
                    >
                        <Pencil size={13} />
                    </button>
                </div>
            )}
        </div>
    )
}

function ChatHeader({
    config,
    hasTurns,
    expanded,
    onNewChat,
    onToggleExpand,
    onClose,
}: {
    config: ChatConfig
    hasTurns: boolean
    expanded: boolean
    onNewChat: () => void
    onToggleExpand: () => void
    onClose: () => void
}) {
    return (
        <header className="cc-header">
            <Sparkles size={20} aria-hidden />
            <div className="cc-header-title">
                <p>{config.botName}</p>
                <p>Ask about {config.ownerName}&rsquo;s work</p>
            </div>
            {hasTurns && (
                <button type="button" className="cc-icon-btn" onClick={onNewChat} aria-label="New chat" title="New chat">
                    <MessageSquarePlus size={16} />
                </button>
            )}
            <button
                type="button"
                className="cc-icon-btn"
                onClick={onToggleExpand}
                aria-label={expanded ? "Shrink" : "Enlarge"}
                title={expanded ? "Shrink" : "Enlarge"}
            >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" className="cc-icon-btn" onClick={onClose} aria-label="Close" title="Close">
                <X size={16} />
            </button>
        </header>
    )
}

function InputBar({
    inputRef,
    input,
    setInput,
    busy,
    onSend,
    onStop,
}: {
    inputRef: RefObject<HTMLTextAreaElement | null>
    input: string
    setInput: (v: string) => void
    busy: boolean
    onSend: () => void
    onStop: () => void
}) {
    return (
        <form
            className="cc-inputbar"
            onSubmit={(e) => {
                e.preventDefault()
                if (!busy && input.trim()) onSend()
            }}
        >
            <textarea
                ref={inputRef}
                className="cc-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        if (!busy && input.trim()) onSend()
                    }
                }}
                rows={1}
                maxLength={1000}
                disabled={busy}
                placeholder={busy ? "Answering…" : "Ask a question…"}
                aria-label="Message"
            />
            {busy ? (
                <button type="button" className="cc-send" onClick={onStop} aria-label="Stop generating" title="Stop generating">
                    <Square size={14} />
                </button>
            ) : (
                <button type="submit" className="cc-send" disabled={!input.trim()} aria-label="Send">
                    <ArrowUp size={16} />
                </button>
            )}
        </form>
    )
}

/* ── Panel ───────────────────────────────────────────────────────────── */

function ChatPanel({ session, onClose }: { session: ReturnType<typeof useChatSession>; onClose: () => void }) {
    const { turns, input, setInput, busy, editing, setEditing, send, retry, stop, newChat } = session
    const [expanded, setExpanded] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (!el || !isPinnedToBottom(el)) return
        el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" })
    }, [turns, busy])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    const lastAssistant = turns.findLastIndex((t) => t.role === "assistant")

    return (
        <div role="dialog" aria-label={`Chat with ${chatConfig.botName}`} className={`cc-panel${expanded ? " cc-panel--expanded" : ""}`}>
            <ChatHeader
                config={chatConfig}
                hasTurns={turns.length > 0}
                expanded={expanded}
                onNewChat={newChat}
                onToggleExpand={() => setExpanded((v) => !v)}
                onClose={onClose}
            />

            <div ref={scrollRef} className="cc-body">
                {turns.length === 0 && <EmptyState config={chatConfig} busy={busy} onAsk={send} />}

                {turns.map((turn, i) =>
                    turn.role === "user" ? (
                        <UserTurnView
                            key={i}
                            turn={turn}
                            index={i}
                            busy={busy}
                            editing={editing?.index === i ? editing : null}
                            onEditStart={(index, draft) => setEditing({ index, draft })}
                            onEditCancel={() => setEditing(null)}
                            onEditChange={(draft) => setEditing({ index: i, draft })}
                            onResend={send}
                        />
                    ) : (
                        <AssistantTurnView key={i} turn={turn} busy={busy} isLast={i === lastAssistant} onRetry={retry} onAsk={send} />
                    ),
                )}
            </div>

            <InputBar inputRef={inputRef} input={input} setInput={setInput} busy={busy} onSend={() => send(input)} onStop={stop} />
        </div>
    )
}

/* ── Widget root ─────────────────────────────────────────────────────── */

export function ChatWidget() {
    const [open, setOpen] = useState(false)
    const session = useChatSession()

    return (
        <div className="cc-root">
            <ChatLauncher open={open} botName={chatConfig.botName} onToggle={() => setOpen((v) => !v)} />
            {open && <ChatPanel session={session} onClose={() => setOpen(false)} />}
        </div>
    )
}
