import { describe, expect, test } from "vitest"
import { clampFollowup, FollowupStream, parseFollowups, splitFollowup } from "@/lib/chat/followups"

describe("parseFollowups", () => {
    test("splits pipe-separated line into at most 3 questions", () => {
        expect(parseFollowups("a? | b? | c? | d?")).toEqual(["a?", "b?", "c?"])
    })

    test("dedupes case-insensitively", () => {
        expect(parseFollowups("Same? | same?")).toEqual(["Same?"])
    })
})

describe("splitFollowup", () => {
    test("splits label from question on the :: separator", () => {
        expect(splitFollowup("Short label :: Full question?")).toEqual({ label: "Short label", question: "Full question?" })
    })

    test("uses the whole string for both when there is no separator", () => {
        expect(splitFollowup("Just a question?")).toEqual({ label: "Just a question?", question: "Just a question?" })
    })
})

describe("clampFollowup", () => {
    test("shortens on a word boundary past the char limit", () => {
        const long = "word ".repeat(20)
        expect(clampFollowup(long).endsWith("…")).toBe(true)
    })
})

describe("FollowupStream", () => {
    test("withholds the marker and everything after it from streamed output", () => {
        const s = new FollowupStream()
        const visible = s.push("Hello world FOLLOWUPS: a? | b?")
        expect(visible).toBe("Hello world ")
    })

    test("finish() parses the withheld follow-ups", () => {
        const s = new FollowupStream()
        s.push("Answer. FOLLOWUPS: one? | two?")
        expect(s.finish().followups).toEqual(["one?", "two?"])
    })
})
