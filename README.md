# ai-awesome-chat

A config-driven, streaming AI chat widget for any Next.js site — one file to edit, an
OpenRouter free-model cascade, Gemini-style streaming (words glide in as they arrive),
Mermaid diagrams, follow-up pills, and adversarial rate
limiting, all in plain CSS so it drops into a Tailwind 3, Tailwind 4, or Tailwind-free site.

Extracted and generalized from the "MLBot" assistant on [mishalubich.com](https://mishalubich.com).

## 60-second setup

```bash
bun install
cp .env.example .env.local
# edit .env.local — set OPENROUTER_API_KEY
bun dev
```

Open http://localhost:3000 and click the chat bubble in the bottom-right corner. The demo
ships with a fictional persona ("Ada Example") so it works out of the box.

## Customize it

Everything site-specific lives in one file: **`chat.config.ts`**. Edit `botName`,
`ownerName`, `greeting`, `starters`, the `knowledge` array (what the bot can answer from),
optional `contact`/`resumeUrl`/`bookingUrl` (each turns on a matching tool), the `models`
cascade, and rate limits. No other file needs to change.

```ts
export const chatConfig: ChatConfig = {
    botName: "Ada",
    ownerName: "Ada Example",
    knowledge: [{ id: "role-1", title: "...", tags: ["..."], body: "..." }],
    // ...
}
```

## Re-theme it

All visual styling lives in `components/chat/chat.css` as CSS custom properties:
`--chat-accent`, `--chat-bg`, `--chat-fg`, `--chat-muted`, `--chat-border`, `--chat-radius`,
`--chat-font`. Override them in your own stylesheet — no Tailwind classes exist inside
`components/chat`, so the widget works whether the host site runs Tailwind 3, Tailwind 4, or
nothing at all. Dark mode follows `prefers-color-scheme` by default, or a host's own `.dark`
class on `<html>`/`<body>`.

## Copy it into an existing site

1. Copy `components/chat/`, `lib/chat/`, `chat.config.ts`, and `app/api/chat/route.ts` in.
2. Mount `<ChatWidget />` once, near the root layout.
3. Set `OPENROUTER_API_KEY` in the target's environment.
4. Override the CSS variables above to match the host's theme.

## Deploy to Vercel

```bash
vercel deploy
```

Set `OPENROUTER_API_KEY` (and optionally `CHAT_RATE_SECRET`, used to sign the rate-limit
cookie) as environment variables before the first production deploy.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module map and data flow.
- [`docs/API.md`](docs/API.md) — config schema, env vars, endpoint contract.
- [`docs/TESTING.md`](docs/TESTING.md) — verification commands and coverage.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — setup, common failures, credential rotation.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — release history.

## License

MIT — see [LICENSE](LICENSE).

---

Built by Misha Lubich — [mishalubich.com](https://mishalubich.com) · [github.com/ml-lubich](https://github.com/ml-lubich)
