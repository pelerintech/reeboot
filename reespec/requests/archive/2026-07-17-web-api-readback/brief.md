# Brief — web-api-readback

## Why

The WebChat UI is newly built and only partially working. Investigation (2026-07-17 discovery)
traced three reported symptoms to a single architectural gap:

- **"Agent didn't remember context message-to-message"** — already FIXED by `web-channel-routing`.
  The WS handler now publishes to the bus and a single persistent, file-backed pi session per
  context is reused (`server.ts:690`, `pi-runner.ts:304,327`). No further work needed here; it is
  the baseline this request builds on.
- **"Start a conversation, navigate to another page, come back — the conversation is gone."**
  Root cause is purely client-side plus a missing endpoint: the Chat page holds messages in
  `useState([])` that unmounts on navigation (`webchat/src/pages/Chat.tsx:24`), never fetches prior
  messages on mount, and **there is no REST endpoint that returns a context's past messages**. The
  server already persists web turns to the `messages` table (`orchestrator.ts:331,502`) — the UI
  simply cannot read them back.
- **"Logs page shows few logs, nothing from previous runs."** The logs page's only data source is a
  live SSE stream `EventSource('/api/logs/stream')` (`webchat/src/pages/Logs.tsx:42`); there is no
  history query. The rich, persistent, full-INFO audit history lives in the `events` table
  (`events.ts:32`) which **no endpoint and no UI reads**. `operational_logs` is warn+ only by design
  (`logger.ts:88`). Retention is not the cause (runs once at startup, 30-day window).

**The unifying blind spot:** reeboot persists plenty server-side (messages table, events table, pi
session files) but exposes almost none of it over HTTP for read-back. Every remaining symptom is the
same missing layer — a **conversation + observability read-back API, plus UI hydration**.

This is shared infrastructure for BOTH deployment use cases: the personal assistant web UI needs it
now, and the single-company support agent (ree) will need the exact same per-conversation history
read-back when its client-embedded UI loads a customer's prior conversation.

## What Changes

After this request:

- A REST endpoint returns a context/conversation's past messages, and the WebChat Chat page hydrates
  from it on mount — so navigating away and back restores the visible transcript (server already
  remembers; the UI now shows it).
- A REST endpoint returns persisted observability history (from the `events` table), and the Logs
  page seeds from it on load — so the page shows a useful, cross-run history instead of only what
  streams live while the tab is open.
- The live SSE streams continue to work for real-time updates, now layered on top of a seeded
  history rather than being the sole source.

## Goals

- `GET /api/contexts/:id/messages` (or equivalent) returning `role`, `content`, `created_at` from the
  `messages` table filtered by `context_id`, with a sane limit/paging.
- Chat page (`webchat/src/pages/Chat.tsx`) fetches and seeds message history on mount/remount, and
  reconnect does not duplicate messages already shown (live-vs-persisted dedupe).
- A log/event history endpoint (reading the `events` table) plus Logs page seeding on load, keeping
  the existing `/api/logs/stream` live tail.
- Transcript state survives SPA navigation (hydrate on remount, or lift state above the router).

## Non-Goals

- Not changing the message-to-message memory path — already fixed by `web-channel-routing`.
- Not building per-peer / per-customer conversation isolation or dynamic chat creation for ree — that
  is the multi-user routing workstream in `deployment-readiness`.
- Not adding API authentication / the canonical support-API contract — tracked in
  `deployment-readiness`. This request assumes the existing single-owner web access model.
- Not redesigning the WebChat UI visual/interaction design.
- Not solving the flattened-tool-call persistence limitation beyond acknowledging it (see Impact).

## Impact

- Files likely touched: `src/server.ts` (new read endpoints), `webchat/src/pages/Chat.tsx`,
  `webchat/src/pages/Logs.tsx`, possibly `webchat/src/hooks/useWebSocket.ts` and a small data/store
  helper. Read-only against existing `messages` / `events` schemas — no migration expected.
- Known caveat to design around: tool calls are persisted only as flattened assistant text
  (`orchestrator.ts:502`), so a reloaded transcript shows assistant text without tool-call cards.
  Either accept this for v1 or persist richer turn structure (decide in design.md).
- Benefits both deployment use cases; establishes the read-back layer the support (ree) API will
  reuse.
