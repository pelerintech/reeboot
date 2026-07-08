# Brief — webchat-ui

## Problem

Reeboot's current webchat is a single static HTML file (~300 lines of vanilla JS) served as a fallback when no mobile channel (WhatsApp/Signal) is configured. It provides basic chat, logs, and settings tabs but lacks:

- **Rich chat experience** — markdown rendering, code blocks, tool call expand/collapse, streaming text
- **Channel management** — no UI to view or manage channel status/reconnection
- **Agent soul editing** — no interface to edit AGENTS.md persona
- **Knowledge corpus management** — no UI for document ingestion/search
- **Multi-context support** — hardcoded to single "main" context
- **Polish** — feels like a prototype, not a product

The user wants a **swap-able webchat implementation** where:
- The default is a proper SPA (Vite + React + TanStack)
- Users can substitute their own static HTML or external URL via config
- The API contract (Hono endpoints + WebSocket) remains stable

## Goals

1. **Rich chat UI** with streaming text, tool call visualization, markdown/code rendering
2. **Tab/panel navigation** (Chat, Channels, Soul, Corpus, Logs, Settings)
3. **Responsive layout** (sidebar navigation, collapses on mobile)
4. **Pluggable strategy** (builtin SPA, static HTML, external URL)
5. **Type-safe component architecture** (agnostic components + adapter layer)

## Non-Goals

- Replacing the backend API or WebSocket protocol
- Building a full agent management UI (task scheduling, cron, etc.)
- Multi-user support or authentication
- Replacing the mobile channels (WhatsApp, Signal)

## Impact

- Webchat becomes a **first-class channel** (not a fallback)
- Users can **substitute their own UI** via config
- Components are **extractable** as `@reeboot/ui` in the future
- Sets foundation for **multi-context** support (out of scope v1)

## Scope

**In scope (v1):**
- Builtin SPA with rich chat
- Channel status panel (read-only, view channel state)
- Tab navigation (Chat, Channels, Logs, Settings)
- Responsive layout (sidebar → bottom nav on mobile)
- Pluggable strategy (builtin only for v1, static/external in v2)

**Out of scope (v2+):**
- Soul editor (AGENTS.md)
- Corpus management (knowledge documents)
- Multi-context switching
- Static HTML strategy
- External URL strategy
