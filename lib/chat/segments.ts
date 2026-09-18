/**
 * Splits a reply into prose and mermaid-diagram segments.
 *
 * The model draws flows as ```mermaid fences (graph TD, flowchart LR, …).
 * The panel streams tokens, so a fence is routinely half-written — an
 * unclosed fence is withheld until its closing backticks arrive rather
 * than shown as raw text.
 */

import { isMermaidDsl } from "@/lib/chat/mermaid-dsl"

export type ChatSegment = { kind: "text"; value: string } | { kind: "mermaid"; source: string }

/** Any fenced block. The label is a hint the model sometimes gets wrong. */
const FENCE = /```([a-z]*)\s*\n([\s\S]*?)```/gi

function pushText(out: ChatSegment[], raw: string): void {
    const value = raw.trim()
    if (value) out.push({ kind: "text", value })
}

export function splitChatSegments(content: string): ChatSegment[] {
    const out: ChatSegment[] = []
    let cursor = 0

    for (const match of content.matchAll(FENCE)) {
        const body = match[2].trim()
        pushText(out, content.slice(cursor, match.index))
        if (isMermaidDsl(body)) out.push({ kind: "mermaid", source: body })
        else pushText(out, match[0])
        cursor = match.index + match[0].length
    }

    const tail = content.slice(cursor)
    // An opening fence with no closer is still streaming — drop the partial.
    const open = tail.search(/```/)
    pushText(out, open === -1 ? tail : tail.slice(0, open))

    return out
}
