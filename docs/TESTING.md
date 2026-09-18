# Testing

## Commands

```bash
bun run test        # vitest run — unit + route tests
bun run lint         # eslint .
bun run typecheck    # tsc --noEmit
bun run build        # next build
bun run ci           # lint && typecheck && test && build — the completion gate
```

## Definition of Done

A change is done when `bun run ci` exits 0. That runs, in order: lint, typecheck, the
vitest suite, and a production build.

## Coverage

| Area | File | What's covered |
|---|---|---|
| Segments | `__tests__/segments.test.ts` | Mermaid-fence splitting, unclosed-fence withholding. |
| Follow-ups | `__tests__/followups.test.ts` | Marker parsing, label/question split, streaming withholding. |
| Stream ingest | `__tests__/stream.test.ts` | Delta assembly, message-content fallback, tool-call fragment merge, turn finalization. |
| Rate limit | `__tests__/rate-limit.test.ts` | Cookie cap, IP floor charged even without a cookie. |
| Config-driven | `__tests__/config-driven.test.ts` | Changing `botName`/`resumeUrl`/`bookingUrl`/`knowledge` changes the system prompt, tool list, or search results. |
| Route gates | `__tests__/route.test.ts` | 400 on empty history, 503 without an API key. |
| Cascade | `__tests__/cascade.test.ts` | A non-2xx from the first model walks to the next entry in `chatConfig.models`. |

## What is intentionally not tested

- The React widget itself (`components/chat/*.tsx`) has no DOM-level test harness in this
  template — no `jsdom`/`@testing-library/react` dependency is included, to keep the runtime
  dependency list to what ships to production. Add one if the fork needs component tests.
- Live calls to OpenRouter. All model calls in tests go through a mocked `fetch`.

## Negative fixtures

`__tests__/cascade.test.ts` mocks a `429` from the first configured model to prove the
fallback walk works without spending a real request.
