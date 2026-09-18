# Architecture

## Module map

```
chat.config.ts            single config: persona, knowledge, limits, rate limit, models
app/
  layout.tsx               mounts <ChatWidget /> globally
  page.tsx                 minimal demo landing page
  api/chat/route.ts         thin orchestration: gate -> validate -> key check -> slot -> agent loop
components/chat/
  chat-widget.tsx           launcher + panel UI, session hook, SSE client
  mermaid-diagram.tsx        renders ```mermaid fences
  handoff-cards.tsx          contact / resume / meeting cards
  chat.css                   all visual styling, CSS custom properties only
lib/chat/
  prompt.ts                 builds the system prompt from config
  tools.ts                   tool schemas + dispatch + repeat-call memo, all config-driven
  stream.ts                  OpenRouter SSE chunk ingest, empty-final recovery
  segments.ts                 splits a reply into prose / mermaid segments
  followups.ts                extracts the trailing `FOLLOWUPS:` line from a streamed reply
  rate-limit.ts               cookie + IP + burst + global limiter, config-driven
  scroll.ts                   scroll-pinning predicate for the panel
  tool-labels.ts               human-readable tool step labels + collapsing
  mermaid-dsl.ts                detects Mermaid DSL vs. plain text in a fence
```

## Data flow

1. Browser opens the widget, `ChatWidget` renders `chat.config.ts`'s greeting and starters.
2. A message POSTs to `/api/chat` with the trimmed turn history.
3. The route checks rate limits, then validates the body, then confirms `OPENROUTER_API_KEY`
   is set, then takes a concurrency slot.
4. `runAgent` builds `[system, ...history]` and loops: call the model (`fetchWithFallback`
   walks `chatConfig.models` on any non-2xx), let it call tools (`runTool`, config-driven),
   feed results back, repeat until it answers or `limits.maxToolRounds` is exhausted.
5. The stream emits SSE frames (`text`, `tool`, `meeting`, `resume`, `contact`, `followups`,
   `error`, `done`) that the widget patches onto the in-flight turn as they arrive.

## Invariants

- **Config is the only thing that changes behavior.** `route.ts`, `tools.ts` and `prompt.ts`
  take a `ChatConfig` and read nothing else; no persona or business data is hardcoded outside
  `chat.config.ts`.
- **The rate limiter runs before anything else spends money.** Order in `checkRateLimit` is
  load-bearing: global cap, then burst, then IP floor, then the signed cookie quota.
- **`get_resume` / `request_meeting` / `get_contact` only exist when their config field is
  set.** `buildToolSchemas` omits a tool entirely rather than returning an error from it.
- **No Tailwind inside `components/chat`.** Every visual choice is a `--chat-*` custom
  property on `:root`, so the widget can be dropped into a Tailwind 3, Tailwind 4, or
  plain-CSS site and re-themed by overriding variables.
