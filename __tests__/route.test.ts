import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "@/app/api/chat/route"
import { __resetBuckets } from "@/lib/chat/rate-limit"

function chatRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) })
}

describe("POST /api/chat gates", () => {
    beforeEach(() => __resetBuckets())
    afterEach(() => vi.unstubAllEnvs())

    test("returns 400 when the message history is empty", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "test-key")
        const res = await POST(chatRequest({ messages: [] }))
        expect(res.status).toBe(400)
    })

    test("returns 503 when OPENROUTER_API_KEY is not set", async () => {
        vi.stubEnv("OPENROUTER_API_KEY", "")
        const res = await POST(chatRequest({ messages: [{ role: "user", content: "hi" }] }))
        expect(res.status).toBe(503)
    })
})
