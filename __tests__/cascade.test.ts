import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { NextRequest } from "next/server"
import { chatConfig } from "@/chat.config"
import { POST } from "@/app/api/chat/route"
import { __resetBuckets } from "@/lib/chat/rate-limit"

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    let i = 0
    return new ReadableStream({
        pull(controller) {
            if (i >= lines.length) {
                controller.close()
                return
            }
            controller.enqueue(encoder.encode(lines[i] + "\n"))
            i += 1
        },
    })
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    for (;;) {
        const { done } = await reader.read()
        if (done) return
    }
}

describe("model cascade", () => {
    beforeEach(() => {
        __resetBuckets()
        vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    })
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    test("walks to the next configured model on a non-2xx response", async () => {
        const calls: string[] = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                const requestBody = JSON.parse(String(init?.body)) as { model: string }
                calls.push(requestBody.model)
                if (calls.length === 1) return new Response("rate limited", { status: 429 })
                return new Response(sseStream(['data: {"choices":[{"delta":{"content":"Hi there."}}]}', "data: [DONE]"]), {
                    status: 200,
                })
            }),
        )

        const req = new NextRequest("http://localhost/api/chat", {
            method: "POST",
            body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
        })
        const res = await POST(req)
        await drain(res.body!)

        expect(calls).toEqual([chatConfig.models[0], chatConfig.models[1]])
    })
})
