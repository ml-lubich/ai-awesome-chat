# Runbook

## First-time setup

```bash
bun install
cp .env.example .env.local
# edit .env.local, set OPENROUTER_API_KEY
bun dev
```

Open http://localhost:3000 and click the chat launcher in the bottom-right corner.

## Customizing the persona

Edit `chat.config.ts`. Every field is documented inline. No other file needs to change to
rebrand the bot, swap the knowledge base, or change the model cascade.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Chat replies "Chat is not configured." | `OPENROUTER_API_KEY` missing | Set it in `.env.local` (dev) or the host's environment variables (prod). |
| Chat replies "You've hit the hourly message limit." | Cookie or IP rate limit reached | Expected behavior; wait for the window in `chat.config.ts`'s `rateLimit` to reset. |
| All models fail immediately | Free-tier models retired or renamed upstream | Update `chatConfig.models` with current OpenRouter slugs; append a paid backstop for durability. |
| Diagram renders as raw text | Reply used a fence Mermaid can't parse | Not a bug in this repo — the model's Mermaid syntax is invalid; the fallback `<pre>` is intentional. |

## Credential rotation

Rotate `OPENROUTER_API_KEY` in the OpenRouter dashboard, then update the host's environment
variable and redeploy. `CHAT_RATE_SECRET`, if set, can be rotated independently — rotating it
invalidates in-flight rate-limit cookies, which just resets everyone's quota window.

## Deploy to Vercel

```bash
vercel deploy
```

Set `OPENROUTER_API_KEY` (and optionally `CHAT_RATE_SECRET`) as Vercel environment variables
before the first production deploy.

## Copying this widget into an existing Next.js site

1. Copy `components/chat/`, `lib/chat/`, `chat.config.ts`, and `app/api/chat/route.ts` into
   the target repo (adjust the `@/` import alias if the target uses a different one).
2. Mount `<ChatWidget />` once, near the root layout.
3. Set `OPENROUTER_API_KEY` in the target's environment.
4. Override `--chat-*` CSS custom properties in the host's own stylesheet to match its theme.
