# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-09-18

### Added

- Gemini-style streaming: replies reveal at a steady word-aligned pace (`nextReveal`, `useSmoothText`) and each new word fades in out of a soft blur (`rehypeStreamWords` + `.stream-word`). Code blocks are never split; `prefers-reduced-motion` turns the fade off; the panel follows the reveal while pinned to the bottom.

## [0.1.1] - 2026-09-17

### Changed

- Renamed the project from cascade-chat to ai-awesome-chat (package name, repo URL, page title, rate-limit cookie name).

## [0.1.0] - 2026-09-17

### Added

- Initial extraction of the MLBot chat pattern into a standalone, config-driven widget:
  streaming SSE agent loop, OpenRouter free-model cascade, Mermaid diagram rendering,
  follow-up pills, adversarial rate limiting, and copy/retry/edit/stop/expand affordances.
- Single `chat.config.ts` entry point for persona, knowledge base, tools, limits and models.
- Plain-CSS theming via `--chat-*` custom properties — no Tailwind dependency in `components/chat`.
