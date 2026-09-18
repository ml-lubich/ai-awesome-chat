import { describe, expect, it } from "vitest"
import { nextReveal, rehypeStreamWords, REVEAL_BACKLOG_FRAMES } from "@/lib/chat/stream-reveal"

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] }

function run(tree: Node): Node {
    rehypeStreamWords()(tree as Parameters<ReturnType<typeof rehypeStreamWords>>[0])
    return tree
}

const para = (text: string): Node => ({ type: "root", children: [{ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: text }] }] })

describe("nextReveal", () => {
    it("never reveals half a word", () => {
        expect(nextReveal(0, "Hello wonderful world")).toBe(5)
    })

    it("stops at the end of the text", () => {
        expect(nextReveal(18, "Hello wonderful world")).toBe(21)
    })
     it("flows a reply that lands in one block instead of flashing it in", () => {
         const reply = "word ".repeat(80)
         let shown = 0
         let frames = 0
         while (shown < reply.length) {
             shown = nextReveal(shown, reply)
             frames++
         }
         expect(frames).toBeGreaterThan(45)
     })


    it("drains a long burst within the backlog window", () => {
        const text = "word ".repeat(400)
        let shown = 0
        for (let i = 0; i < REVEAL_BACKLOG_FRAMES * 4; i++) shown = nextReveal(shown, text)
        expect(shown).toBe(text.length)
    })
})

describe("rehypeStreamWords", () => {
    it("wraps each word in a stream-word span", () => {
        const words = run(para("two words")).children?.[0].children?.filter((n) => n.tagName === "span")
        expect(words?.map((n) => n.children?.[0].value)).toEqual(["two", "words"])
    })

    it("keeps the whitespace between words as plain text", () => {
        const kids = run(para("a  b")).children?.[0].children
        expect(kids?.[1]).toEqual({ type: "text", value: "  " })
    })

    it("leaves code untouched", () => {
        const code: Node = { type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: "const x = 1" }] }
        run({ type: "root", children: [code] })
        expect(code.children).toEqual([{ type: "text", value: "const x = 1" }])
    })
})
