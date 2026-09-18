import { describe, expect, test } from "vitest"
import { chatConfig, type ChatConfig } from "@/chat.config"
import { buildSystemPrompt } from "@/lib/chat/prompt"
import { buildToolSchemas, runTool } from "@/lib/chat/tools"

function withOverrides(overrides: Partial<ChatConfig>): ChatConfig {
    return { ...chatConfig, ...overrides }
}

describe("system prompt is config-driven", () => {
    test("changing botName changes the generated prompt", () => {
        const a = buildSystemPrompt(withOverrides({ botName: "Aaa" }))
        const b = buildSystemPrompt(withOverrides({ botName: "Bbb" }))
        expect(a).not.toBe(b)
    })
})

describe("tool schemas are config-driven", () => {
    test("omitting resumeUrl removes get_resume", () => {
        const schemas = buildToolSchemas(withOverrides({ resumeUrl: undefined }))
        expect(schemas.some((s) => s.function.name === "get_resume")).toBe(false)
    })

    test("setting resumeUrl adds get_resume", () => {
        const schemas = buildToolSchemas(withOverrides({ resumeUrl: "/r.pdf" }))
        expect(schemas.some((s) => s.function.name === "get_resume")).toBe(true)
    })

    test("omitting bookingUrl removes request_meeting", () => {
        const schemas = buildToolSchemas(withOverrides({ bookingUrl: undefined }))
        expect(schemas.some((s) => s.function.name === "request_meeting")).toBe(false)
    })
})

describe("search results are config-driven", () => {
    test("changing knowledge entries changes search_knowledge results", () => {
        const cfgA = withOverrides({
            knowledge: [{ id: "x", title: "Kubernetes ninja", tags: ["kubernetes"], body: "Kubernetes expert." }],
        })
        const cfgB = withOverrides({
            knowledge: [{ id: "y", title: "Cooking blog", tags: ["cooking"], body: "Loves pasta." }],
        })
        const a = runTool(cfgA, "search_knowledge", { query: "kubernetes" })
        const b = runTool(cfgB, "search_knowledge", { query: "kubernetes" })
        expect(a).not.toEqual(b)
    })
})
