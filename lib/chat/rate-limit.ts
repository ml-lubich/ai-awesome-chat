/**
 * ─── Adversarial rate limiting for the chat endpoint ───────────────────
 *
 * Threat model: a public, unauthenticated endpoint that spends real money
 * on every call. The attacker can clear cookies, spoof `x-forwarded-for`
 * on a self-hosted origin, and open many tabs. This is not unbeatable —
 * it makes abuse cost more than it is worth without blocking a genuine
 * visitor asking a handful of questions.
 *
 * Three independent layers; a request must clear ALL of them:
 *
 *  1. Signed cookie quota — HMAC-signed, needs no server storage, cannot
 *     be forged. Deleting the cookie is possible, which is why it is not
 *     the only layer.
 *  2. IP bucket — the floor cookie-wiping cannot escape.
 *  3. Global spend cap — a hard ceiling on total daily requests across all
 *     visitors, protecting the upstream API budget from a distributed flood.
 *
 * All numeric limits come from `chat.config.ts` (`ChatRateLimit`) — nothing
 * here is a hardcoded business threshold.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { ChatRateLimit } from "@/chat.config"

export const COOKIE_NAME = "ai_awesome_chat_q"

export type Decision =
    | { ok: true; cookie: string; remaining: number }
    | { ok: false; reason: "burst" | "cookie" | "ip" | "global" | "replay"; retryAfterSec: number }

interface Window {
    sid: string
    start: number
    count: number
}

function newSid(): string {
    return randomBytes(9).toString("base64url")
}

function secret(): string {
    return process.env.CHAT_RATE_SECRET || process.env.OPENROUTER_API_KEY || "ai-awesome-chat-dev-secret"
}

function sign(payload: string): string {
    return createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function encodeCookie(w: Window): string {
    const payload = `${w.sid}.${w.start}.${w.count}`
    return `${payload}.${sign(payload)}`
}

/** Returns null when the cookie is absent, malformed, or fails signature check. */
export function decodeCookie(raw: string | undefined): Window | null {
    if (!raw) return null
    const parts = raw.split(".")
    if (parts.length !== 4) return null
    const [sid, start, count, mac] = parts
    const expected = sign(`${sid}.${start}.${count}`)
    if (mac.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
    const s = Number(start)
    const c = Number(count)
    if (!Number.isFinite(s) || !Number.isFinite(c) || c < 0 || !sid) return null
    return { sid, start: s, count: c }
}

interface Bucket {
    start: number
    count: number
}

const buckets = new Map<string, Bucket>()
const highWater = new Map<string, { start: number; count: number }>()
const inFlight = new Map<string, number>()

function sweep(now: number, windowMs: number): void {
    if (buckets.size < 5000) return
    for (const [k, w] of buckets) if (now - w.start >= windowMs) buckets.delete(k)
}

function bump(key: string, now: number, limit: { max: number; windowMs: number }): boolean {
    sweep(now, limit.windowMs)
    const w = buckets.get(key)
    if (!w || now - w.start >= limit.windowMs) {
        buckets.set(key, { start: now, count: 1 })
        return true
    }
    if (w.count >= limit.max) return false
    w.count += 1
    return true
}

function retryAfter(start: number, now: number, windowMs: number): number {
    return Math.max(1, Math.ceil((start + windowMs - now) / 1000))
}

/** True when this cookie is older than one already honoured for this sid. */
function isReplay(w: Window): boolean {
    const seen = highWater.get(w.sid)
    if (!seen) return false
    if (seen.start !== w.start) return false
    return w.count < seen.count
}

function recordHighWater(w: Window): void {
    if (highWater.size > 20_000) highWater.clear()
    highWater.set(w.sid, { start: w.start, count: w.count })
}

function checkGlobal(cfg: ChatRateLimit, now: number): Decision | null {
    if (bump("global", now, { max: cfg.globalMax, windowMs: cfg.globalWindowMs })) return null
    const w = buckets.get("global")!
    return { ok: false, reason: "global", retryAfterSec: retryAfter(w.start, now, cfg.globalWindowMs) }
}

function checkBurst(cfg: ChatRateLimit, ip: string, now: number): Decision | null {
    const key = `burst:${ip}`
    if (bump(key, now, { max: cfg.burstMax, windowMs: cfg.burstWindowMs })) return null
    const w = buckets.get(key)!
    return { ok: false, reason: "burst", retryAfterSec: retryAfter(w.start, now, cfg.burstWindowMs) }
}

function checkIp(cfg: ChatRateLimit, ip: string, now: number): Decision | null {
    const key = `ip:${ip}`
    if (bump(key, now, { max: cfg.ipMax, windowMs: cfg.ipWindowMs })) return null
    const w = buckets.get(key)!
    return { ok: false, reason: "ip", retryAfterSec: retryAfter(w.start, now, cfg.ipWindowMs) }
}

function checkCookie(cfg: ChatRateLimit, cookieRaw: string | undefined, now: number): Decision {
    const prev = decodeCookie(cookieRaw)
    if (prev && isReplay(prev)) {
        return { ok: false, reason: "replay", retryAfterSec: retryAfter(prev.start, now, cfg.cookieWindowMs) }
    }

    const fresh = !prev || now - prev.start >= cfg.cookieWindowMs
    const w: Window = fresh ? { sid: prev?.sid ?? newSid(), start: now, count: 0 } : prev

    if (w.count >= cfg.cookieMax) {
        return { ok: false, reason: "cookie", retryAfterSec: retryAfter(w.start, now, cfg.cookieWindowMs) }
    }

    w.count += 1
    recordHighWater(w)
    return { ok: true, cookie: encodeCookie(w), remaining: cfg.cookieMax - w.count }
}

/** Entry point. Order is load-bearing: cheapest/broadest checks first. */
export function checkRateLimit(cfg: ChatRateLimit, ip: string, cookieRaw: string | undefined, now: number = Date.now()): Decision {
    return checkGlobal(cfg, now) ?? checkBurst(cfg, ip, now) ?? checkIp(cfg, ip, now) ?? checkCookie(cfg, cookieRaw, now)
}

/** Extracts the client IP. On Vercel `x-forwarded-for` is edge-set and unspoofable. */
export function clientIp(headers: Headers): string {
    const xff = headers.get("x-forwarded-for")
    if (xff) return xff.split(",")[0].trim()
    return headers.get("x-real-ip")?.trim() || "unknown"
}

export function buildCookie(cfg: ChatRateLimit, value: string): string {
    const maxAge = Math.ceil(cfg.cookieWindowMs / 1000)
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
    return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
}

/** Returns a release token, or null when the IP already has too many open streams. */
export function acquireSlot(cfg: ChatRateLimit, ip: string): (() => void) | null {
    const open = inFlight.get(ip) ?? 0
    if (open >= cfg.concurrent) return null
    inFlight.set(ip, open + 1)
    let released = false
    return () => {
        if (released) return
        released = true
        releaseSlot(ip)
    }
}

export function releaseSlot(ip: string): void {
    const open = inFlight.get(ip) ?? 0
    if (open <= 1) inFlight.delete(ip)
    else inFlight.set(ip, open - 1)
}

/** Test-only: clears the process-local buckets. */
export function __resetBuckets(): void {
    buckets.clear()
    highWater.clear()
    inFlight.clear()
}
