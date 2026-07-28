# Design — observability-audit-view

## Context

Make the observability page an operator's audit window into agent operations, driven by the curated
`events` table as a **turn-grouped rollup**, and stop the DB-log firehose introduced by
`web-api-readback`. Single-tenant per `decisions.md`; the page is an operator surface (owner in pi mode,
company operator in ree/support mode), never exposed to end customers. All fix points below were
verified in code on 2026-07-17.

## Key findings that shape the design

1. **`events` is already the right substrate.** `emitEvent()` (`observability/events.ts:25`) writes
   typed domain events with OTEL severity (9/13/17/21), `context_id`, `channel`, `peer_id`, and a
   `payload` JSON, and **already fans each event to the SSE stream** via `emitLogRecord({ component:
   'audit', msg: <type>, ... })`. Turn lifecycle events emitted by the orchestrator: `turn_started`
   (sev 9), `turn_completed` (sev 9), `turn_failed` (sev 17, `payload.reason`), plus `budget_breached`
   (17), `budget_warning` (13), channel/capability/scheduler events.

2. **We make `trace_id` the correlation key by mirroring `turnId` into it.** Today each `emitEvent`
   call defaults `traceId` to a *fresh random* 16-byte hex (`events.ts:26`) and the orchestrator emit
   sites don't pass a shared one, so `trace_id` differs per event within a turn. But the orchestrator
   already holds a shared `turnId` (`randomUUID`) and puts it in the `payload` of
   `turn_started`/`turn_completed`/`turn_failed` (`orchestrator.ts:302,408,465,490`). A `randomUUID` is
   128 bits = **exactly 32 hex chars once hyphens are stripped**, which matches the schema's documented
   `trace_id` format (OTEL 16-byte trace id). So the orchestrator passes
   `traceId: turnId.replace(/-/g,'')` at those emit sites. This is the correct OTEL model —
   **trace_id = the turn, span_id = each event within it** (span_id already is random-per-event) — and
   aligns with the existing "OTEL-ready schema for events" decision and the planned OTEL exporter.
   The rollup then groups on the `trace_id` **column** (indexable), not a per-row `json_extract`.
   Budget/channel/scheduler events (emitted before/outside the turn) keep their unique random
   `trace_id`, so they naturally fall out as standalone single-event groups. `payload.turnId` is kept
   as-is for readability/back-compat, but grouping no longer depends on JSON parsing.

3. **The DB firehose is two lines.** `logger.ts:89` (`if (level < 30) continue;`) and `:142`
   (`streams.push({ stream: createDbStream(db), level: 'info' })`). The JSDoc at `:55` still says
   "warn+ (level >= 40)" — the code diverged. Reverting realigns code with its own contract.

4. **Retention is time-only, no cap.** `pruneObservabilityData(db, retentionDays)`
   (`observability/retention.ts:19`) deletes `events`/`operational_logs` older than one flat window
   (`logging.retention_days`, default 30, `config.ts:145`). No severity tiering, no row cap → unbounded
   growth between the window under fan-out.

5. **Live SSE already carries audit events.** `/api/logs/stream` (`server.ts:345`) emits every
   `emitLogRecord`, and audit events arrive tagged `component: 'audit'` with `msg = <event type>`. The
   Activity view can tail the existing stream and filter client-side to `component === 'audit'` — no
   new SSE endpoint required.

## Approach

### 0. Mirror turnId → trace_id at the orchestrator turn emit sites
- At the four turn-lifecycle `emitEvent` calls (`orchestrator.ts:302,408,465,490`) pass
  `traceId: turnId.replace(/-/g, '')` so `turn_started`/`turn_completed`/`turn_failed` for one turn
  share a 32-hex `trace_id`. A tiny helper (`_turnIdToTraceId(turnId)`) keeps it DRY. span_id stays
  per-event (correct). No schema migration — `trace_id` column already exists. Non-turn events are
  unchanged. This makes `trace_id` the audit correlation key used by the API and UI below.

### 1. Revert DB log persistence to warn+ (undo web-api-readback)
- `logger.ts:89`: `if (level < 30) continue;` → `if (level < 40) continue;`
- `logger.ts:142`: stream entry `level: 'info'` → `level: 'warn'`
- stdout stays all-levels (`destination(1)`), file stays warn+, SSE stays all-levels — operator can
  still see/debug info+ live and in files; only DB persistence narrows. Realigns with the `:55` JSDoc.

### 2. `GET /api/events` — curated audit read-back (`server.ts`, next to `/api/logs`)
- Query params: `level` (info|warn|error|fatal → severity threshold ≥ 9/13/17/21, default info),
  `context` (filter `context_id`), `type` (filter event `type`), `limit` (1..1000, default 200,
  most-recent-N then re-sorted ascending — mirror the `/api/logs` DESC-limit-then-ASC subquery).
- Order by `created_ns ASC` (monotonic insertion clock; `id` is a nanoid, not ordered).
- Response shape per row (stable UI contract):
  `{ id, timestamp: created_at, type, level: <string>, severity, contextId, channel, peerId,
     traceId: trace_id, turnId: json_extract(payload,'$.turnId'), payload: <parsed object> }`.
  `traceId` is the grouping key (shared across a turn after step 0); `turnId` is retained for display.
- Reuse `_pinoNumberToLevel`/severity mapping helpers; add a small `_otelSeverityToLevelString` if
  cleaner (9→info, 13→warn, 17→error, 21→fatal).

### 3. Bounded-growth retention (`observability/retention.ts` + `config.ts`)
- New config in `LoggingConfigSchema` (`config.ts:141`), all with safe defaults:
  - `events_info_retention_days` (int ≥ 1, default **7**) — INFO-severity events (severity < 13)
    pruned after this shorter window.
  - `events_max_rows_per_context` (int ≥ 100, default **8000**) — hard per-context backstop.
- `pruneObservabilityData` gains the tiers. Prefer an options object
  (`pruneObservabilityData(db, { retentionDays, eventsInfoRetentionDays, eventsMaxRowsPerContext })`)
  with back-compat for the existing numeric call (`pruneObservabilityData(db, 30)` still works):
  1. `DELETE FROM events WHERE severity < 13 AND created_at < datetime('now','-<info> days')` (INFO tier).
  2. `DELETE FROM events WHERE created_at < datetime('now','-<retention> days')` (all severities; existing).
  3. Per-context cap: for each `context_id`, delete rows beyond the newest N
     (`DELETE FROM events WHERE id IN (SELECT id FROM events WHERE context_id=? ORDER BY created_ns DESC
     LIMIT -1 OFFSET ?)`).
- `operational_logs` keeps the flat `retention_days` window (now smaller since warn+ only).
- Arming a *periodic* retention sweep is **deployment-readiness E3**, not re-planned here; this request
  only makes the pruning smarter.

### 4. Activity (turn-rollup) UI (`webchat/src/pages/Logs.tsx` — repurpose)
- On mount and on filter change, seed from `GET /api/events?level=<level>` instead of `/api/logs`.
- **Group** rows by `traceId`. A group is a "turn" iff it contains a `turn_*` event; single-event
  groups from non-turn events render standalone. Each turn group renders as one collapsible card:
  - header: turn start time, context, and status derived from members —
    `turn_completed` present → **completed**; `turn_failed` present → **failed** (+ `payload.reason`,
    `durationMs`); only `turn_started` → **running / incomplete**.
  - body (expand): member events in `created_ns` order.
  - Non-turn events (budget/channel/scheduler/capability) render as standalone system entries
    interleaved by time.
- **Live tail:** keep the existing `EventSource('/api/logs/stream?level=…')`, but filter incoming
  records to `component === 'audit'`, map them into the event model, and merge into the right turn
  (by `traceId`/`turnId` on the record) or append as a new/system entry. Non-audit pino records are
  ignored by the Activity view.
- Rename the page heading to **"Activity"** (keep the route/component file to limit churn). A flat
  "raw logs" mode is out of scope for v1 (see open decisions).

## Testing strategy

Backend: vitest, `@src/*` alias, injected `better-sqlite3`. Mirror `tests/web-readback-api.test.ts`
(its `startTestServer`; add a `createEventsTable()` helper from the `events` schema in `db/schema.ts:276`,
plus an insert helper setting `severity`, `payload`, `created_ns`). Mirror
`tests/observability/operational-logs-persist.test.ts` for the log-level revert, and add a retention
test seeding `events` at mixed severities/ages/contexts. Frontend: vitest + jsdom + Testing Library,
mirror `webchat/src/pages/__tests__/Logs.test.tsx` (fetch stub + `MockEventSource`).

## Risks

- **Grouping on `trace_id`** means non-turn events (unique trace_id) show standalone; acceptable for v1
  and clearly specified. Richer per-tool sub-events inside a turn need new emission that inherits the
  turn's trace_id (separate request), not this read-side change.
- **`json_extract` availability** — used only for the `turnId` display field (grouping uses the
  `trace_id` column). SQLite JSON1 is compiled into better-sqlite3 by default; the RED test asserts a
  non-null `turnId` for a seeded turn event, so a missing JSON1 build fails loudly.
- **Orchestrator emit-site change (Task 1)** is on the turn hot path — keep it to adding the `traceId`
  field only; re-run the orchestrator suite (`tests/orchestrator*.test.ts`) to catch regressions.
- **Per-context cap query** (`LIMIT -1 OFFSET ?`) must be tested at the boundary (exactly N → nothing
  deleted; N+1 → oldest one deleted).
- **SSE double-source**: the Activity view shares `/api/logs/stream`; the client-side
  `component === 'audit'` filter must be exact so pino noise doesn't leak into the rollup.
- **Reverting info persistence** reduces what `/api/logs` history returns (warn+ only) — intended, but
  it changes the `logs-history-*` behavior shipped in web-api-readback.

## Open decisions — RESOLVED at review (2026-07-17)

1. **INFO events retention window** — **7 days**. ✅ confirmed.
2. **Per-context row cap** — **8000 rows/context** (per-context, not global). ✅ confirmed (raised from 5000).
3. **Keep `GET /api/logs`?** — **keep** as-is; the Activity page just stops using it as primary. No
   flat raw-log UI in v1. ✅ confirmed.
4. **Page rename** — heading → **"Activity"**, keep the `Logs.tsx` file/route to limit churn. ✅ confirmed.
5. **Propagate `turnId` → `trace_id`?** — **YES, adopt** (see Approach step 0). Grouping keys off the
   `trace_id` column instead of `json_extract(payload)`. ✅ confirmed — chosen for tracing correctness
   and OTEL alignment; the mirror is a one-liner per emit site with no migration.
