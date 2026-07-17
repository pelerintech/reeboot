# Design — web-api-readback

## Context

The server already persists everything needed; the UI just cannot read it back. Confirmed in code:

- **Conversation history** is written to the `messages` table on every web turn — user rows at
  `orchestrator.ts:331-334`, assistant rows at `orchestrator.ts:502-505`. Schema (`src/db/index.ts:124`):
  `id, context_id, channel, peer_id, role, content, tokens_used, created_at`.
- **Observability** persists to `operational_logs` (`src/db/schema.ts:318`):
  `id, level (INTEGER), msg, component, context_id, payload, created_at` — but **warn+ only**
  (`logger.ts` DB stream drops `level < 40`, and the multistream entry is registered at `level: 'warn'`).
- The Chat page keeps messages in `useState<ChatMessage[]>([])` (`webchat/src/pages/Chat.tsx:24`) with
  no history fetch; the Logs page's only source is `EventSource('/api/logs/stream')`
  (`webchat/src/pages/Logs.tsx:42`) — a live tail with no history query.
- There is **no** `GET /api/contexts/:id/messages` and **no** `GET /api/logs` (history) route today.

So the fix is a thin read-back layer: two REST GET endpoints + UI hydration, plus one small logging
change so the logs history is actually substantive.

## Approach

Four capabilities, each independently testable.

### 1. `conversation-history-api` — `GET /api/contexts/:id/messages`

- Add a Hono route in `src/server.ts`, immediately after the existing
  `GET /api/contexts/:id/sessions` (server.ts:545), mirroring its shape (same `getContextById` 404 guard).
- Query — return the **most recent N** rows in **chronological (ascending) order** so the UI renders
  top-to-bottom:
  ```sql
  SELECT role, content, created_at
  FROM (
    SELECT rowid, role, content, created_at
    FROM messages
    WHERE context_id = ?
    ORDER BY rowid DESC
    LIMIT ?
  ) ORDER BY rowid ASC
  ```
- `limit` from `?limit=` query param, default **200**, clamped to `[1, 1000]`.
- Response: `200` with JSON array `[{ role, content, created_at }]`; `404 {error:'Context not found'}`
  when the context does not exist. Read-only; no schema change.
- Not ree-gated: reading the `messages` table is harmless for both SDKs (ree's own write-rule question
  is out of scope here — see `deployment-readiness`).

### 2. `conversation-history-ui` — Chat page hydrates on mount

- In `webchat/src/pages/Chat.tsx`, add a `useEffect(() => { ... }, [])` that runs once on mount:
  `fetch('/api/contexts/main/messages')` → map each row to a `ChatMessage`
  (`{ id: 'hist-<i>', role, content, timestamp: Date.parse(created_at) }`, mapping any non
  `user`/`assistant`/`error` role to `assistant`) → `setMessages(history)`.
- Runs on every mount, so returning to the page after navigation re-hydrates the transcript from the
  server (the fix for "conversation gone on navigate-away").
- **Dedupe rule:** hydrate on **mount only**, never on WS reconnect. Live deltas are appended after
  the seed within the same mount; no reload happens mid-session, so seeded rows and live rows never
  overlap. (Documented so the executor does not add a reconnect refetch that would double messages.)
- `contextId` stays `'main'` (matches the hardcoded value at Chat.tsx:159 and useWebSocket default).

### 3. `logs-history-api` — `GET /api/logs`

- Add a Hono route in `src/server.ts` next to `GET /api/logs/stream` (server.ts:344).
- Reuse the existing `_pinoLevelToNumber(levelParam)` helper (already used by the stream route) to turn
  `?level=info|warn|...` into a numeric threshold; default `info`.
- Query:
  ```sql
  SELECT level, msg, component, created_at
  FROM (
    SELECT id, level, msg, component, created_at
    FROM operational_logs
    WHERE level >= ?
    ORDER BY id DESC
    LIMIT ?
  ) ORDER BY id ASC
  ```
  `limit` from `?limit=`, default **200**, clamped `[1, 1000]`.
- **Map to the exact `LogRecord` shape the UI already consumes** (`Logs.tsx:4`):
  `{ timestamp: created_at, level: <string>, component: component ?? undefined, message: msg }`,
  where numeric level → string via `{10:'debug',20:'debug',30:'info',40:'warn',50:'error',60:'fatal'}`
  (a `_pinoNumberToLevel` helper added alongside `_pinoLevelToNumber`).
- Response: `200` JSON array of `LogRecord`.

### 4. `logs-history-ui` — Logs page seeds on mount

- In `webchat/src/pages/Logs.tsx`, before opening the SSE stream (inside the existing
  `useEffect` keyed on `[filterLevel, ...]`), `fetch('/api/logs?level=' + filterLevel)` and
  `setLogs(history)`; then start the live `EventSource` which appends new records as today.
- Re-fetch when `filterLevel` changes (the effect already re-runs on `filterLevel`).

### 5. `info-log-persistence` — make the logs history substantive

- Symptom "few logs" is because only warn+ is persisted. Change `src/observability/logger.ts` so the
  **DB** stream persists `info` (30) and above: (a) in `createDbStream`, change the guard from
  `if (level < 40) continue` to `if (level < 30) continue`; (b) in `createLogger`, change the DB
  multistream entry from `level: 'warn'` to `level: 'info'`.
- **This deliberately revisits the earlier decision** *"operational_logs persists level >= 40 (warn+)"*
  (`decisions.md`, observability-system). Rationale: for a single-owner / one-company deployment the
  extra INFO volume is acceptable and is bounded by the existing retention sweep (30-day default,
  `retention.ts`). stdout/file streams are unchanged (file stays warn+). If the reviewer prefers to
  keep warn+ persistence, this capability can be dropped without affecting 1–4 (the history endpoint
  still works; it just shows fewer rows).

## Data shapes (authoritative for this request)

```
GET /api/contexts/:id/messages?limit=200
  → 200: [{ role: string, content: string, created_at: string }]
  → 404: { error: "Context not found" }

GET /api/logs?level=info&limit=200
  → 200: [{ timestamp: string, level: "debug"|"info"|"warn"|"error"|"fatal",
            component?: string, message: string }]
```

## Testing strategy

- **Server endpoints** — vitest, mirror `tests/rest-api.test.ts`: `startServer({ port:0,
  logLevel:'silent', db, reebotDir })` with an injected `better-sqlite3` handle, seed rows directly
  via `db.prepare(...).run(...)`, then `fetch(base + route)` and assert status + body. New file
  `tests/web-readback-api.test.ts`.
- **info-log-persistence** — vitest: `initLogger({level:'info'}, db)`, `getLogger().info(...)`, await a
  short flush tick (`await new Promise(r => setTimeout(r, 50))` — pino streams are async), assert a row
  exists in `operational_logs`. Add to the same or a new observability test file.
- **SPA** — vitest + React Testing Library + jsdom (setup at `webchat/src/test-setup.ts`). Mock
  `global.fetch` to return history JSON and stub `globalThis.WebSocket` (copy the `MockWebSocket`
  pattern from `webchat/src/hooks/__tests__/useWebSocket.test.ts`). Assert the seeded messages/logs
  render. New files under `webchat/src/pages/__tests__/`.

## Risks

- **Reloaded transcript loses tool-call cards.** Tool calls are persisted only as flattened assistant
  text (`orchestrator.ts:502`), so a hydrated transcript shows assistant text without `ToolCall`
  cards. Accepted for v1; a richer turn-persistence format is out of scope (noted in brief Impact).
- **Optimistic-send vs. persisted duplicate.** Only a concern if history is refetched mid-session; the
  mount-only hydrate rule avoids it. Executor must not add a reconnect refetch.
- **INFO log volume / DB growth** (capability 5). Bounded by retention; flagged as a reversible
  decision above.
- **pino async flush in tests.** The persistence test must await a tick before querying; documented in
  the task so it is not written as a synchronous assertion.
- **jsdom lacks `fetch`/`WebSocket`.** Both must be mocked in SPA tests (pattern exists in-repo).
