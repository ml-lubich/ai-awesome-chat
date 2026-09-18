import { describe, expect, test } from "vitest"
import { splitChatSegments } from "@/lib/chat/segments"

describe("splitChatSegments", () => {
    test("splits prose around a closed mermaid fence", () => {
        const segs = splitChatSegments("before\n```mermaid\ngraph TD\nA-->B\n```\nafter")
        expect(segs.map((s) => s.kind)).toEqual(["text", "mermaid", "text"])
    })

    test("withholds an unclosed fence instead of showing raw text", () => {
        const segs = splitChatSegments("intro\n```mermaid\ngraph TD\nA-->B")
        expect(segs).toEqual([{ kind: "text", value: "intro" }])
    })

    test("keeps a non-mermaid fence as plain text", () => {
        const segs = splitChatSegments("```js\nconsole.log(1)\n```")
        expect(segs[0].kind).toBe("text")
    })
})
