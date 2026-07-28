# Tasks — observability-audit-view

> **Executor notes — read first.**
> - Paths relative to `reeboot/`. Backend tests run from `reeboot/` with `npx vitest run <file>`
>   (`@src/*` alias; inject `better-sqlite3`). Frontend tests run from `reeboot/webchat/` with
>   `npx vitest run <file>` (jsdom + Testing Library).
> - Mirror these existing tests: `tests/messages-persistence.test.ts` (orchestrator + mock runner +
>   `runObservabilityMigration` creates `events`), `tests/web-readback-api.test.ts` (server harness
>   `startTestServer`, `createOperationalLogsTable`/`insertLog`), `tests/observability/operational-logs-persist.test.ts`
>   (logger DB persistence), and `webchat/src/pages/__tests__/Logs.test.tsx` (fetch stub + `MockEventSource`).
> - Do tasks **in order**; one test → one implementation → re-run. Do not batch.
> - **Open Decisions are RESOLVED (design.md):** INFO events 7 days; per-context cap **8000**; keep
>   `/api/logs`; page heading → "Activity"; **group on the `trace_id` column** (turnId mirrored into it,
>   Task 1).
> - This request **reverses** the `info-log-persistence` behavior shipped in `web-api-readback` (Task 2).
>   That is intended.

---

### 1. Mirror turnId → trace_id at orchestrator turn emit sites
Spec `turn-trace-correlation`.
- [x] **RED** — New `tests/orchestrator-turn-trace.test.ts` (mirror `messages-persistence.test.ts`
      setup: `makeDb()` + `runObservabilityMigration(db)`, a mock success runner and a throwing runner,
      Orchestrator wired to a `MessageBus`). Assert: `turn_started` and `turn_completed` rows share one
      non-empty `trace_id` (S1); that `trace_id` equals `payload.turnId` with `-` removed and is 32 hex
      (S2); a failing runner's `turn_started`/`turn_failed` share a `trace_id` (S3); two turns get two
      distinct `trace_id`s (S4). Run → **fails** (each event has a random trace_id today).
- [x] **ACTION** — In `src/orchestrator.ts` add a helper `_turnIdToTraceId(turnId: string) =>
      turnId.replace(/-/g, '')` and pass `traceId: _turnIdToTraceId(turnId)` on the four turn-lifecycle
      `emitEvent` calls (`:302` turn_started, `:408` + `:465` turn_failed, `:490` turn_completed).
- [x] **GREEN** — `npx vitest run tests/orchestrator-turn-trace.test.ts` passes.

### 2. Revert DB log persistence to warn+
Spec `warn-only-log-persistence`.
- [x] **RED** — New `tests/observability/warn-only-log-persistence.test.ts` (mirror
      `operational-logs-persist.test.ts`): with `createLogger({ level:'debug' }, db)`, assert `warn`→row
      `level 40` (S1), `error`→`level 50` (S2), `info`→**no** row (S3), `debug`→**no** row (S4). Create the
      `operational_logs` table in the test first. Run → **fails** on S3 (info currently persisted).
- [x] **ACTION** — In `src/observability/logger.ts`: change `:89` `if (level < 30) continue;` →
      `if (level < 40) continue;` and `:142` stream entry `level: 'info'` → `level: 'warn'`. Realign the
      `createDbStream` JSDoc if it mentions info+.
- [x] **GREEN** — `npx vitest run tests/observability/warn-only-log-persistence.test.ts` passes; update
      or remove the existing `operational-logs-persist.test.ts` info assertion to reflect warn+ (note in
      the PR that this reverses web-api-readback).

### 3. Config: events retention + row-cap fields
Spec `events-retention-bound` (config surface).
- [x] **RED** — New `tests/config-events-retention.test.ts`: parse a minimal config through the schema
      and assert `logging.events_info_retention_days === 7` and `logging.events_max_rows_per_context === 8000`
      by default, and that explicit values round-trip. Run → **fails** (fields absent).
- [x] **ACTION** — In `src/config.ts` `LoggingConfigSchema` (~:141) add
      `events_info_retention_days: z.number().int().min(1).default(7)` and
      `events_max_rows_per_context: z.number().int().min(100).default(8000)`.
- [x] **GREEN** — test passes; `npm run build` compiles.

### 4. Severity-tiered + per-context-capped retention
Spec `events-retention-bound`.
- [x] **RED** — New `tests/observability/events-retention.test.ts`: seed `events` (create via
      `runObservabilityMigration(db)`) with rows at chosen `severity`/`created_at`/`created_ns`/
      `context_id`. Assert: 10-day-old INFO pruned, today INFO kept (S1); 10-day-old WARN kept (S2);
      40-day-old WARN pruned (S3); per-context cap keeps newest N (S4); cap applied per context
      independently (S5); the bare `pruneObservabilityData(db, 30)` call still works (S6). Run → **fails**.
- [x] **ACTION** — In `src/observability/retention.ts` make `pruneObservabilityData` accept
      `(db, retentionDays | { retentionDays, eventsInfoRetentionDays?, eventsMaxRowsPerContext? })`.
      Add: (a) INFO-tier delete `WHERE severity < 13 AND created_at < datetime('now','-<info> days')`;
      (b) keep the existing all-severity `created_at` window; (c) per-context cap
      `DELETE FROM events WHERE id IN (SELECT id FROM events WHERE context_id=? ORDER BY created_ns DESC
      LIMIT -1 OFFSET ?)` looping over distinct `context_id`. Defaults when only a number is passed:
      info=7, cap=8000.
- [x] **GREEN** — test passes.

### 5. Wire config values into the retention call
Spec `events-retention-bound` (integration).
- [x] **RED** — In `tests/observability/events-retention.test.ts` (or a small server-level test): assert
      that starting the server with `config.logging.events_info_retention_days`/`events_max_rows_per_context`
      set causes `pruneObservabilityData` to receive them (spy, or observe effect on seeded rows). Run →
      **fails** (server passes only `retention_days`).
- [x] **ACTION** — In `src/server.ts` (~:151-154) pass the options object:
      `pruneObservabilityData(db, { retentionDays: logging.retention_days ?? 30,
      eventsInfoRetentionDays: logging.events_info_retention_days ?? 7,
      eventsMaxRowsPerContext: logging.events_max_rows_per_context ?? 8000 })`.
- [x] **GREEN** — test passes.

### 6. GET /api/events endpoint
Spec `events-history-api`.
- [x] **RED** — New `tests/web-events-api.test.ts` (mirror `web-readback-api.test.ts` harness): add a
      `createEventsTable()` (via `runObservabilityMigration`) and an `insertEvent({type,severity,contextId,
      payload,traceId,createdNs})` helper. Assert: chronological order incl. `traceId` (S1); `?level=error`
      filter (S2); `traceId` from column + `turnId` from payload + `payload` parsed to object (S3); no turn
      payload → `turnId===null` but `traceId` present (S4); `?context=main` isolation (S5); `?limit=2`
      most-recent-two ascending (S6); empty → `[]` (S7). Run → **fails** (no route).
- [x] **ACTION** — In `src/server.ts` add `app.get('/api/events', ...)` next to `/api/logs` (~:369):
      map `level`→severity threshold, optional `context`/`type` filters, `limit` (1..1000, default 200)
      via DESC-`created_ns`-limit-then-ASC subquery. Select
      `id, type, severity, context_id, channel, peer_id, created_at, trace_id, payload,
       json_extract(payload,'$.turnId') AS turn_id`; return
      `{ id, timestamp, type, level, severity, contextId, channel, peerId, traceId, turnId,
       payload:JSON.parse(...) }`. Add `_otelSeverityToLevelString` (9→info,13→warn,17→error,21→fatal)
      or reuse existing helpers.
- [x] **GREEN** — `npx vitest run tests/web-events-api.test.ts` passes.

### 7. Activity page: seed from /api/events and group by traceId
Spec `turn-rollup-ui` S1–S5.
- [x] **RED** — New/updated `webchat/src/pages/__tests__/Activity.test.tsx` (mirror `Logs.test.tsx`):
      stub `fetch` for `/api/events?level=info`. Assert: seeds from `/api/events` not `/api/logs` (S1);
      two events same `traceId` render one turn card with status "completed" (S2); `turn_failed` shows
      reason "provider timeout" (S3); a `budget_warning` (turnId null, no turn sibling) renders as a
      standalone entry (S4); changing the level filter refetches `/api/events?level=error` (S5). Run →
      **fails**.
- [x] **ACTION** — Repurpose `webchat/src/pages/Logs.tsx`: change the seed `fetch` to
      `/api/events?level=${filterLevel}`; add a `groupByTrace(events)` helper (group by `traceId`; a group
      is a turn iff it contains a `turn_*` event; derive status from `turn_completed`/`turn_failed`
      presence; expose `reason` from the failed event's `payload.reason`); render turn cards + standalone
      entries in time order. Rename the heading to "Activity".
- [x] **GREEN** — `npx vitest run src/pages/__tests__/Activity.test.tsx` passes (from `reeboot/webchat/`).

### 8. Activity page: live audit SSE tail merges into turns
Spec `turn-rollup-ui` S6–S7.
- [x] **RED** — In `Activity.test.tsx`: after seeding a `turn_started` for `traceId:'TR1'`, dispatch a
      `MockEventSource` message `{component:'audit', msg:'turn_completed', trace_id:'TR1', ...}` and assert
      the `TR1` turn becomes "completed" (S6); dispatch a `{component:'scheduler'}` record and assert it is
      NOT rendered as a turn/entry (S7). Run → **fails**.
- [x] **ACTION** — In the SSE `onmessage` handler, filter to `record.component === 'audit'`, map the
      record into the event model (type from `msg`, `traceId` from `trace_id`), and merge into the
      matching turn (by `traceId`) or append as standalone. Ignore non-audit records. Keep the existing
      reconnect logic.
- [x] **GREEN** — test passes.

### 9. Full build + suite gate
- [x] **RED** — `npm run check` from `reeboot/` (and build/test in `webchat/`) before all pieces are
      green together.
- [x] **ACTION** — Resolve type errors and cross-test interference (esp. the `pruneObservabilityData`
      signature change, the orchestrator emit-site change, and any test that assumed info-level DB
      persistence or the old "Logs" heading).
- [x] **GREEN** — `npm run check` passes (build + full backend suite) and the webchat suite passes.
      Feature complete when green.
