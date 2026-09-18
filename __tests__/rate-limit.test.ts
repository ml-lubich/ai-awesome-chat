import { beforeEach, describe, expect, test } from "vitest"
import type { ChatRateLimit } from "@/chat.config"
import { __resetBuckets, checkRateLimit } from "@/lib/chat/rate-limit"

const baseCfg: ChatRateLimit = {
    cookieMax: 2,
    cookieWindowMs: 60_000,
    ipMax: 10,
    ipWindowMs: 60_000,
    burstMax: 10,
    burstWindowMs: 60_000,
    globalMax: 100,
    globalWindowMs: 60_000,
    concurrent: 2,
}

describe("checkRateLimit", () => {
    beforeEach(() => __resetBuckets())

    test("allows the first request from a fresh visitor", () => {
        const decision = checkRateLimit(baseCfg, "1.2.3.4", undefined)
        expect(decision.ok).toBe(true)
    })

    test("blocks once the cookie cap is reached", () => {
        let cookie: string | undefined
        for (let i = 0; i < baseCfg.cookieMax; i++) {
            const d = checkRateLimit(baseCfg, "1.2.3.4", cookie)
            if (d.ok) cookie = d.cookie
        }
        const blocked = checkRateLimit(baseCfg, "1.2.3.4", cookie)
        expect(blocked.ok).toBe(false)
    })

    test("a missing cookie is still charged against the IP floor", () => {
        const ipCfg: ChatRateLimit = { ...baseCfg, ipMax: 2, cookieMax: 100 }
        checkRateLimit(ipCfg, "9.9.9.9", undefined)
        checkRateLimit(ipCfg, "9.9.9.9", undefined)
        const blocked = checkRateLimit(ipCfg, "9.9.9.9", undefined)
        expect(blocked.ok).toBe(false)
    })
})
