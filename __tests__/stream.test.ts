import { describe, expect, test } from "vitest"
import { emptyStreamState, finalizeAssistantTurn, formatCascadeFailure, ingestCompletionChunk } from "@/lib/chat/stream"

describe("ingestCompletionChunk", () => {
    test("appends delta.content across chunks", () => {
        const state = emptyStreamState()
        ingestCompletionChunk(state, { choices: [{ delta: { content: "Hel" } }] })
        ingestCompletionChunk(state, { choices: [{ delta: { content: "lo" } }] })
        expect(state.content).toBe("Hello")
    })

    test("falls back to message.content when no delta ever arrives", () => {
        const state = emptyStreamState()
        ingestCompletionChunk(state, { choices: [{ message: { content: "Full reply" } }] })
        expect(state.content).toBe("Full reply")
    })

    test("assembles tool-call argument fragments by index", () => {
        const state = emptyStreamState()
        ingestCompletionChunk(state, {
            choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "search_knowledge", arguments: '{"que' } }] } }],
        })
        ingestCompletionChunk(state, {
            choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"go"}' } }] } }],
        })
        expect(state.toolCalls.get(0)?.function.arguments).toBe('{"query":"go"}')
    })
})

describe("finalizeAssistantTurn", () => {
    test("keeps looping when the reply carries tool calls", () => {
        const decision = finalizeAssistantTurn(
            { content: "", tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] },
            [],
        )
        expect(decision.kind).toBe("tools")
    })

    test("falls back to a grounded summary on an empty final after tools", () => {
        const decision = finalizeAssistantTurn({ content: "" }, ['{"matches":[{"title":"Role A"}]}'])
        expect(decision.kind).toBe("fallback")
    })

    test("accepts non-empty text as the answer", () => {
        const decision = finalizeAssistantTurn({ content: "Here you go." }, [])
        expect(decision.kind).toBe("answer")
    })
})

describe("formatCascadeFailure", () => {
    test("joins every attempt's model and status", () => {
        const msg = formatCascadeFailure([{ model: "m1", status: 429, body: "rate limited" }])
        expect(msg).toContain("m1: 429")
    })
})
