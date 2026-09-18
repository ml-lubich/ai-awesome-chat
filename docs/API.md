# API

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key. Without it, `POST /api/chat` returns 503. |
| `CHAT_RATE_SECRET` | No | HMAC secret for the rate-limit cookie. Falls back to `OPENROUTER_API_KEY`, then a dev default. Set explicitly in production. |

## `chat.config.ts` — `ChatConfig`

| Field | Type | Notes |
|---|---|---|
| `botName` | `string` | Shown in the launcher and panel header. |
| `ownerName` | `string` | Who the bot answers questions about. |
| `greeting` | `string` | Shown above the starter pills on a fresh chat. |
| `starters` | `string[]` | Suggested opening questions. |
| `knowledge` | `KnowledgeEntry[]` | `{ id, title, tags, body }` — the full corpus `search_knowledge`/`get_entry` read. |
| `contact` | `{ email, linkedin?, github? }` \| `undefined` | Enables the `get_contact` tool when set. |
| `resumeUrl` | `string` \| `undefined` | Enables the `get_resume` tool when set. |
| `bookingUrl` | `string` \| `undefined` | Enables the `request_meeting` tool when set. |
| `models` | `string[]` | Cascade order for OpenRouter model IDs; first 2xx response wins. |
| `limits` | `ChatLimits` | `maxMessageChars`, `maxHistory`, `maxToolRounds`, `maxTokens`. |
| `rateLimit` | `ChatRateLimit` | Cookie/IP/burst/global caps and windows, plus `concurrent` in-flight streams per IP. |
| `extraRules` | `string` | Freeform text appended to the generated system prompt. |

## `POST /api/chat`

Request body:

```json
{ "messages": [{ "role": "user", "content": "..." }] }
```

Only `user`/`assistant` roles survive; a client cannot inject a `system` message. History is
clamped to `limits.maxHistory` turns and each message to `limits.maxMessageChars`.

Responses:

- `400` — empty or invalid history (`{ "error": "Send a message." }`).
- `429` — rate-limited (`{ "error": "...", "retryAfter": <seconds> }`, plus a `Retry-After` header).
- `503` — `OPENROUTER_API_KEY` is not set (`{ "error": "Chat is not configured." }`).
- `200` — `text/event-stream`. SSE events: `text`, `tool`, `meeting`, `resume`, `contact`,
  `followups`, `error`, `done`.

## Exit codes / build

Standard Next.js: `bun run build` exits non-zero on a type or build error; `bun run lint` and
`bun run typecheck` likewise. There is no CLI beyond the Next.js dev/build/start scripts.
