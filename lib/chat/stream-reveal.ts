/**
 * Gemini-style streaming. The network delivers text in bursts, so the panel
 * reveals it at a steady, word-aligned pace instead of jumping a paragraph at a
 * time, and each newly revealed word fades in (see `.stream-word` in chat.css).
 */

/** A backlog drains over roughly this many animation frames (~1.5 s at 60 fps),
 *  easing out as it shrinks. Answers often land in one block after tool calls,
 *  so a short window would flash the whole reply in at once instead of flowing. */
export const REVEAL_BACKLOG_FRAMES = 90
/** Floor pace ≈ 180 chars/s (~35 words/s): steady, readable, never a crawl. */
const MIN_CHARS_PER_FRAME = 3

/** Next reveal position: the step scales with the backlog, and always lands on
 *  a word boundary so a word never renders half-drawn. */
export function nextReveal(shown: number, target: string): number {
    if (shown >= target.length) return target.length
    const step = Math.max(MIN_CHARS_PER_FRAME, Math.ceil((target.length - shown) / REVEAL_BACKLOG_FRAMES))
    const raw = Math.min(target.length, shown + step)
    const toSpace = target.slice(raw).search(/\s/)
    return toSpace === -1 ? target.length : raw + toSpace
}

/* Minimal hast shapes — enough for this plugin without pulling in @types/hast. */
interface HastText {
    type: "text"
    value: string
}
interface HastElement {
    type: "element"
    tagName: string
    properties: Record<string, unknown>
    children: HastNode[]
}
interface HastParent {
    type: string
    tagName?: string
    children?: HastNode[]
}
type HastNode = HastText | HastElement | HastParent

/** Code keeps its exact text: wrapping tokens in spans would break copy and highlighting. */
const SKIP_TAGS = new Set(["code", "pre"])

function toWordNodes(text: string): HastNode[] {
    return text
        .split(/(\s+)/)
        .filter((part) => part.length > 0)
        .map((part): HastNode =>
            /^\s+$/.test(part)
                ? { type: "text", value: part }
                : { type: "element", tagName: "span", properties: { className: ["stream-word"] }, children: [{ type: "text", value: part }] },
        )
}

function wrapWords(node: HastParent): void {
    if (!node.children || (node.tagName && SKIP_TAGS.has(node.tagName))) return
    node.children = node.children.flatMap((child) => {
        if (child.type === "text") return toWordNodes((child as HastText).value)
        wrapWords(child as HastParent)
        return [child]
    })
}

/** Rehype plugin: wrap every prose word in `<span class="stream-word">`. React
 *  keeps already-rendered words mounted, so only new words play the fade-in. */
export function rehypeStreamWords() {
    return (tree: HastParent): void => wrapWords(tree)
}
