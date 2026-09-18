/**
 * ─── Chat tool layer ────────────────────────────────────────────────────
 *
 * Tools the model can call to answer questions grounded in `chat.config.ts`.
 * Deliberately not a RAG pipeline: the knowledge base is a few thousand
 * tokens of already-structured data, well inside any modern model's
 * context — a lookup by key/search is cheaper and exact.
 *
 * The tool list itself is config-driven: `get_resume`/`request_meeting`
 * only exist when `resumeUrl`/`bookingUrl` are set, and `get_contact` only
 * when `contact` is set.
 */

import type { ChatConfig, KnowledgeEntry } from "@/chat.config"

export interface MeetingResult {
    topic: string
    durationMin: number
    url: string
    summary: string
}

export interface ResumeResult {
    url: string
    filename: string
    summary: string
}

export interface ContactResult {
    email: string
    mailto: string
    linkedin?: string
    github?: string
    summary: string
}

export type ToolResult =
    | { matches: KnowledgeEntry[] }
    | { entry: KnowledgeEntry | null }
    | { meeting: MeetingResult }
    | { resume: ResumeResult }
    | { contact: ContactResult }
    | { error: string }

/* ── Schemas (OpenAI/OpenRouter function-calling format) ────────────── */

export interface ToolSchema {
    type: "function"
    function: {
        name: string
        description: string
        parameters: {
            type: "object"
            properties: Record<string, { type: string; description?: string }>
            required?: string[]
        }
    }
}

function knowledgeSchemas(): ToolSchema[] {
    return [
        {
            type: "function",
            function: {
                name: "search_knowledge",
                description: "Full-text search over the knowledge base. Use this first for open-ended questions.",
                parameters: {
                    type: "object",
                    properties: { query: { type: "string", description: "Keywords to search for" } },
                    required: ["query"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "get_entry",
                description: "Fetch one knowledge entry by its id.",
                parameters: {
                    type: "object",
                    properties: { id: { type: "string", description: "The entry id, from a prior search result" } },
                    required: ["id"],
                },
            },
        },
    ]
}

function contactSchema(): ToolSchema {
    return {
        type: "function",
        function: {
            name: "get_contact",
            description: "Hand the visitor real contact details. Call when someone asks how to get in touch.",
            parameters: { type: "object", properties: {} },
        },
    }
}

function resumeSchema(): ToolSchema {
    return {
        type: "function",
        function: {
            name: "get_resume",
            description: "Hand the visitor a downloadable resume/CV. Call when someone asks for one.",
            parameters: { type: "object", properties: {} },
        },
    }
}

function meetingSchema(): ToolSchema {
    return {
        type: "function",
        function: {
            name: "request_meeting",
            description: "Open a booking calendar for the visitor. Call the moment someone wants to book time.",
            parameters: {
                type: "object",
                properties: {
                    topic: { type: "string", description: "Short subject line" },
                    durationMin: { type: "number", description: "15 for a quick intro, 30 for a scoping call" },
                    summary: { type: "string", description: "One sentence restating what the visitor wants" },
                },
                required: ["topic"],
            },
        },
    }
}

/** Builds the schema list actually offered to the model — only the tools
 *  this config can serve. */
export function buildToolSchemas(config: ChatConfig): ToolSchema[] {
    const schemas = [...knowledgeSchemas()]
    if (config.contact) schemas.push(contactSchema())
    if (config.resumeUrl) schemas.push(resumeSchema())
    if (config.bookingUrl) schemas.push(meetingSchema())
    return schemas
}

/* ── Search ──────────────────────────────────────────────────────────── */

const STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "from", "with", "about",
    "what", "whats", "which", "who", "where", "when", "why", "how", "has", "have", "had",
    "does", "did", "do", "is", "are", "was", "were", "be", "been", "this", "that", "these",
    "those", "built", "build", "made", "make", "using", "use", "used", "can", "could",
    "would", "should", "your", "my", "me", "you", "we",
])

export function searchTerms(query: string): string[] {
    const raw = query.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean)
    const terms = new Set<string>()
    for (const token of raw) {
        if (STOPWORDS.has(token) || token.length < 2) continue
        terms.add(token)
        if (token.endsWith("s") && token.length > 4) {
            const stem = token.slice(0, -1)
            if (!STOPWORDS.has(stem) && stem.length >= 2) terms.add(stem)
        }
    }
    return [...terms]
}

function scoreEntry(entry: KnowledgeEntry, terms: string[]): number {
    const title = entry.title.toLowerCase()
    const body = `${entry.body} ${entry.tags.join(" ")}`.toLowerCase()
    const hit = (h: string) => terms.filter((t) => h.includes(t)).length
    return hit(title) * 2 + hit(body)
}

function searchKnowledge(config: ChatConfig, query: string): ToolResult {
    const terms = searchTerms(query)
    if (terms.length === 0) return { matches: [] }
    const scored = config.knowledge
        .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
    return { matches: scored.slice(0, 8).map((s) => s.entry) }
}

function getEntry(config: ChatConfig, id: string): ToolResult {
    return { entry: config.knowledge.find((e) => e.id === id) ?? null }
}

/* ── Hand-off tools ──────────────────────────────────────────────────── */

function requestMeeting(config: ChatConfig, args: Record<string, unknown>): ToolResult {
    if (!config.bookingUrl) return { error: "Booking is not configured." }
    const topic = typeof args.topic === "string" && args.topic.trim() ? args.topic.trim() : "Consulting enquiry"
    const raw = typeof args.durationMin === "number" ? args.durationMin : 30
    const durationMin = raw <= 20 ? 15 : 30
    const summary =
        typeof args.summary === "string" && args.summary.trim()
            ? args.summary.trim().slice(0, 200)
            : `Wants to talk through a project with ${config.ownerName}.`
    return { meeting: { topic: topic.slice(0, 90), durationMin, url: config.bookingUrl, summary } }
}

function getResume(config: ChatConfig): ToolResult {
    if (!config.resumeUrl) return { error: "No resume is configured." }
    return {
        resume: {
            url: config.resumeUrl,
            filename: `${config.ownerName.replace(/\s+/g, "-")}-Resume.pdf`,
            summary: `${config.ownerName}'s resume — one page, PDF.`,
        },
    }
}

function getContact(config: ChatConfig, args: Record<string, unknown>): ToolResult {
    if (!config.contact) return { error: "No contact details are configured." }
    const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 80) : ""
    const subject = reason ? `${reason} — via chat` : "Hello"
    return {
        contact: {
            email: config.contact.email,
            mailto: `mailto:${config.contact.email}?subject=${encodeURIComponent(subject)}`,
            linkedin: config.contact.linkedin,
            github: config.contact.github,
            summary: "Email reaches them directly — nothing here sends anything on your behalf.",
        },
    }
}

/** Dispatches a model tool call. Unknown names return an error the model can recover from. */
export function runTool(config: ChatConfig, name: string, args: Record<string, unknown>): ToolResult {
    const handlers: Record<string, () => ToolResult> = {
        search_knowledge: () => searchKnowledge(config, String(args.query ?? "")),
        get_entry: () => getEntry(config, String(args.id ?? "")),
        get_contact: () => getContact(config, args),
        get_resume: () => getResume(config),
        request_meeting: () => requestMeeting(config, args),
    }
    return (handlers[name] ?? (() => ({ error: `Unknown tool: ${name}` })))()
}

/* ── Repeat-call memo ────────────────────────────────────────────────── */

/** Remembers which tool calls a conversation has already made, so a model
 *  that re-asks for the same data answers from memory instead of burning
 *  the tool-round budget on a duplicate lookup. */
export class ToolMemo {
    private readonly seen = new Map<string, string>()

    recall(name: string, args: unknown): string | null {
        return this.seen.get(signature(name, args)) ?? null
    }

    remember(name: string, args: unknown, serializedResult: string): void {
        this.seen.set(signature(name, args), serializedResult)
    }

    repeatNotice(name: string, prior: string): string {
        return (
            `You already called ${name} with these arguments in this conversation. ` +
            `The result is below — answer the user from it instead of calling it again.\n${prior}`
        )
    }
}

function signature(name: string, args: unknown): string {
    return `${name}:${stableStringify(args)}`
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
}
