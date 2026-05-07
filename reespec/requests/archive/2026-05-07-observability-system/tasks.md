# Tasks: Observability System

Execution order follows dependency flow:
schema → logger → console migration → audit events → turn journal → extensions → SSE → CLI → webchat → roadmap

---

### 1. Observability DB migration

- [x] **RED** — Write `tests/db/observability-schema.test.ts`: assert `events`, `session_events`, `rate_limits`, `operational_logs` tables do NOT exist on a fresh DB, and `turn_journal` has no `closed_at` column. Run `npx vitest run tests/db/observability-schema.test.ts` → fails (migration not implemented).
- [x] **ACTION** — Add `runObservabilityMigration(db)` to `src/db/schema.ts`: create the four new tables (events, session_events, rate_limits, operational_logs) and add `closed_at TEXT` column to `turn_journal` via `ALTER TABLE IF NOT EXISTS` pattern. Wire the migration call into `openDatabase()` alongside existing migrations.
- [x] **GREEN** — Run `npx vitest run tests/db/observability-schema.test.ts` → all assertions pass. Confirm idempotency by calling the migration twice in the test.

---

### 2. Pino logger singleton

- [x] **RED** — Write `tests/observability/logger.test.ts`: import `createLogger` from `@src/observability/logger.ts` (file does not exist yet) → import fails. Run `npx vitest run tests/observability/logger.test.ts` → test fails.
- [x] **ACTION** — Create `src/observability/logger.ts`: export `createLogger(config)` returning a pino instance with configured level, stdout NDJSON transport, and async file transport (`pino/file`) writing to `~/.reeboot/logs/reeboot-YYYY-MM-DD.log`. Export a lazy `getLogger()` singleton. Add `pino` as an explicit dep in `package.json` (it is currently transitive only).
- [x] **GREEN** — Run `npx vitest run tests/observability/logger.test.ts` → `createLogger` returns a pino instance with `.info`, `.warn`, `.error`, `.debug`, `.fatal` methods.

---

### 3. SSE emitter

- [x] **RED** — Write `tests/observability/sse-emitter.test.ts`: import `SseEmitter` from `@src/observability/sse-emitter.ts` (does not exist) → fails. Run `npx vitest run tests/observability/sse-emitter.test.ts` → test fails.
- [x] **ACTION** — Create `src/observability/sse-emitter.ts`: a singleton `EventEmitter` wrapper that exports `sseEmitter` and `emitLogRecord(record)`. Add a pino transport hook in `createLogger` that calls `sseEmitter.emitLogRecord(record)` for every log line.
- [x] **GREEN** — Run `npx vitest run tests/observability/sse-emitter.test.ts` → registering a listener via `sseEmitter.on('log', cb)` receives records when `emitLogRecord` is called.

---

### 4. emitEvent — audit event writer

- [x] **RED** — Write `tests/observability/events.test.ts`: import `emitEvent` from `@src/observability/events.ts` (does not exist) → fails. Run `npx vitest run tests/observability/events.test.ts` → test fails.
- [x] **ACTION** — Create `src/observability/events.ts`: export `emitEvent(db, event)` that inserts a row into the `events` table. Generate `id` (nanoid), `trace_id` (32-char hex), `span_id` (16-char hex), `created_ns` (nanoseconds from `performance.now()` + epoch offset). Also call `sseEmitter.emitLogRecord` so audit events appear in the SSE stream.
- [x] **GREEN** — Run `npx vitest run tests/observability/events.test.ts` → `emitEvent` inserts a row with correct OTEL-ready fields. Verify `trace_id` is 32 chars, `span_id` is 16 chars, `created_ns` > 0.

---

### 5. Turn journal promoted to permanent

- [x] **RED** — Write `tests/observability/turn-journal-permanent.test.ts`: call `TurnJournal.closeTurn('t1')` on an existing open turn → assert the row is still present with `status = 'closed'` and `closed_at` is set. Currently `closeTurn` deletes the row → assertion fails. Run `npx vitest run tests/observability/turn-journal-permanent.test.ts` → test fails.
- [x] **ACTION** — Change `TurnJournal.closeTurn()` in `src/resilience/turn-journal.ts` to `UPDATE turn_journal SET status = 'closed', closed_at = datetime('now') WHERE turn_id = ?` instead of DELETE. Add `getClosedTurns(db, { limit })` and `pruneTurns(db, retentionDays)` functions. Update the pruning call in `openDatabase()` startup. Update the existing `turn-journal.test.ts` test that asserts the row is deleted after `closeTurn` — it now asserts `status = 'closed'`.
- [x] **GREEN** — Run `npx vitest run tests/observability/ tests/turn-journal.test.ts` → all pass.

---

### 6. Replace console.* in orchestrator and server

- [x] **RED** — Write `tests/observability/no-console.test.ts`: grep `src/orchestrator.ts` and `src/server.ts` source text for `console.log`, `console.warn`, `console.error` — assert count is 0. Run `npx vitest run tests/observability/no-console.test.ts` → fails (many console.* calls exist).
- [x] **ACTION** — In `src/orchestrator.ts` and `src/server.ts`, replace all `console.*` calls with `logger.info/warn/error` from `getLogger()`. Add `component` field to each call site. Wire `getLogger()` initialisation into `startServer()` using the config's `logging` section.
- [x] **GREEN** — Run `npx vitest run tests/observability/no-console.test.ts` → grep finds 0 console.* calls in both files. Run `npx vitest run tests/server.test.ts tests/orchestrator.test.ts` → existing tests still pass.

---

### 7. Replace console.* in all remaining src/ files

- [x] **RED** — Extend `tests/observability/no-console.test.ts` to grep ALL files under `src/` (excluding wizard/ and skills-cli.ts which have intentional user-facing output). Assert 0 matches. Run → fails (scheduler, channels/registry, extensions, resilience, etc. still have console.*).
- [x] **ACTION** — Replace `console.*` with `logger.*` calls in: `src/scheduler.ts`, `src/scheduler/heartbeat.ts`, `src/channels/registry.ts`, `src/resilience/startup.ts`, `src/utils/broadcast.ts`, `src/extensions/mcp-manager.ts`, `src/extensions/skill-manager.ts`, `src/extensions/web-search.ts`, and all other `src/` files flagged by the test.
- [x] **GREEN** — Run `npx vitest run tests/observability/no-console.test.ts` → 0 matches across all non-UI src/ files. Run `npx vitest run` → full suite passes.

---

### 8. WhatsApp and Signal real pino logger

- [x] **RED** — Write `tests/observability/channel-logger.test.ts`: instantiate `WhatsAppAdapter` and inspect the logger object it constructs for Baileys — assert it is NOT the existing no-op (`{ trace: noop, debug: noop, ... }`). Run `npx vitest run tests/observability/channel-logger.test.ts` → fails (still no-op).
- [x] **ACTION** — In `src/channels/whatsapp.ts`, replace the `baileysLogger` no-op with `getLogger().child({ component: 'whatsapp' })`. Set its level to `warn` so Baileys protocol noise stays suppressed at info but real errors surface. Apply same pattern to Signal adapter (`component: 'signal'`).
- [x] **GREEN** — Run `npx vitest run tests/observability/channel-logger.test.ts` → adapter logger is a pino child instance. Run `npx vitest run tests/channels/` → existing channel tests pass.

---

### 9. DB debug wrapper

- [x] **RED** — Write `tests/observability/db-wrapper.test.ts`: import `wrapDb` from `@src/observability/db-wrapper.ts` (does not exist) → fails. Run `npx vitest run tests/observability/db-wrapper.test.ts` → test fails.
- [x] **ACTION** — Create `src/observability/db-wrapper.ts`: export `wrapDb(db, logger)` that returns a proxy around the better-sqlite3 Database. Override `prepare()` to return a wrapped statement that logs `{ sql, params, durationMs }` at `debug` on each `run/get/all` call, and `error` on throw. Wire `wrapDb` into `openDatabase()` when a logger is available.
- [x] **GREEN** — Run `npx vitest run tests/observability/db-wrapper.test.ts` → wrapper emits debug records, result of `get/all/run` is unchanged from unwrapped DB.

---

### 10. Turn lifecycle audit events in orchestrator

- [x] **RED** — Write `tests/observability/turn-events.test.ts`: run a mock turn through the orchestrator, then query the `events` table — assert rows of type `turn_started` and `turn_completed` exist. Run `npx vitest run tests/observability/turn-events.test.ts` → fails (no events emitted yet).
- [x] **ACTION** — In `src/orchestrator.ts _runTurn()`, call `emitEvent(db, { type: 'turn_started', contextId, channel: msg.channelType, severity: 9 })` at turn start. Call `emitEvent(db, { type: 'turn_completed', ... payload: { durationMs } })` on success. Call `emitEvent(db, { type: 'turn_failed', ... payload: { reason } })` on timeout/error. Also emit `swallowed_reply` event inside `_reply()` for heartbeat/scheduler swallowed messages.
- [x] **GREEN** — Run `npx vitest run tests/observability/turn-events.test.ts tests/orchestrator.test.ts` → all pass.

---

### 11. Observability extension — session_shutdown hook

- [x] **RED** — Write `tests/observability/session-lifecycle.test.ts`: load the observability extension in a mock pi context, simulate `session_shutdown` event with `reason: 'quit'` → query `session_events` table → assert a row exists with `reason = 'quit'`. Simulate `session_shutdown` while a turn_journal row is open → assert `linked_turn_id` is set and `reason = 'crash'`. Run `npx vitest run tests/observability/session-lifecycle.test.ts` → fails (extension does not exist).
- [x] **ACTION** — Create `src/extensions/observability.ts`: register `pi.on('session_shutdown', ...)` to insert into `session_events`. Check `getOpenJournals(db)` to detect crash scenario and set `linked_turn_id` and override reason to `'crash'`. Wire the extension into the loader (always-on, no feature flag). Pass `db` as second argument to the factory.
- [x] **GREEN** — Run `npx vitest run tests/observability/session-lifecycle.test.ts` → all scenarios pass.

---

### 12. Observability extension — after_provider_response hook

- [x] **RED** — Write `tests/observability/rate-limits.test.ts`: load the observability extension, simulate `after_provider_response` with `headers: { 'x-ratelimit-remaining-tokens': '5000', 'retry-after': '10' }` → query `rate_limits` table → assert row exists with `remaining_tokens = 5000` and `retry_after_ms = 10000`. Simulate with no rate limit headers → assert no row inserted. Run `npx vitest run tests/observability/rate-limits.test.ts` → fails.
- [x] **ACTION** — Add `pi.on('after_provider_response', ...)` to `src/extensions/observability.ts`. Parse `x-ratelimit-remaining-tokens`, `x-ratelimit-remaining-requests`, `retry-after` from event headers. Insert into `rate_limits`. Emit `rate_limit_warning` event and warn log if remaining < threshold (default 5000, configurable). Export `getLatestRateLimit(db, provider)` from a new `src/observability/rate-limits.ts` module.
- [x] **GREEN** — Run `npx vitest run tests/observability/rate-limits.test.ts` → all scenarios pass.

---

### 13. Scheduler throttling on retry-after

- [x] **RED** — Write `tests/observability/scheduler-throttle.test.ts`: insert a `rate_limits` row with `retry_after_ms = 60000` and `recorded_at = now`. Trigger the scheduler's dispatch check → assert the task is skipped and a `scheduler_throttled` event is in the `events` table. Run `npx vitest run tests/observability/scheduler-throttle.test.ts` → fails.
- [x] **ACTION** — In `src/scheduler.ts`, before dispatching a task call `getLatestRateLimit(db, provider)`. If `retry_after_ms` is set and `recorded_at + retry_after_ms > Date.now()`, skip the task: update `next_run` to `recorded_at + retry_after_ms + 5000` buffer, emit `scheduler_throttled` event, log at warn. Import provider string from config.
- [x] **GREEN** — Run `npx vitest run tests/observability/scheduler-throttle.test.ts tests/scheduler.test.ts` → all pass.

---

### 14. SSE endpoint in Hono server

- [x] **RED** — Write `tests/observability/sse-endpoint.test.ts`: start the test server, make a `GET /api/logs/stream` request, emit a log record via `getLogger().info('test')` → assert the SSE response body contains the log record as a data event. Run `npx vitest run tests/observability/sse-endpoint.test.ts` → fails (endpoint does not exist).
- [x] **ACTION** — Add `app.get('/api/logs/stream', streamSSE(...))` in `src/server.ts`. On connection, subscribe to `sseEmitter`. Apply level filter from `?level=` query param (default `info`). Unsubscribe on client disconnect. Import `streamSSE` from `hono/streaming`.
- [x] **GREEN** — Run `npx vitest run tests/observability/sse-endpoint.test.ts tests/server.test.ts` → all pass.

---

### 15. reeboot logs --follow CLI command

- [x] **RED** — Write `tests/observability/logs-cli.test.ts`: run `reeboot logs --follow --help` or inspect the command registry — assert `logs` command with `--follow` flag is registered in `src/index.ts`. Run `npx vitest run tests/observability/logs-cli.test.ts` → fails (command not registered).
- [x] **ACTION** — Add `reeboot logs --follow` subcommand in `src/index.ts`. Attempt to connect to `/api/logs/stream` on the configured port. If successful, pipe the SSE stream through `pino-pretty` and print to stdout. If server is not running, tail the most recent file in `~/.reeboot/logs/` and print a notice. Handle Ctrl-C gracefully.
- [x] **GREEN** — Run `npx vitest run tests/observability/logs-cli.test.ts` → command is registered. Manually verify `reeboot logs --follow` connects and prints records.

---

### 16. Operational log retention pruning

- [x] **RED** — Write `tests/observability/retention.test.ts`: insert `operational_logs` rows and `turn_journal` closed rows with `created_at` set to 31 days ago. Call `pruneObservabilityData(db, 30)` → assert old rows are deleted and recent rows (< 30 days) are retained. Run `npx vitest run tests/observability/retention.test.ts` → fails (function does not exist).
- [x] **ACTION** — Create `src/observability/retention.ts`: export `pruneObservabilityData(db, retentionDays)` that deletes from `operational_logs` and `events` where `created_at < datetime('now', '-N days')`, and calls `pruneTurns(db, retentionDays)`. Also delete log files in `~/.reeboot/logs/` older than `retentionDays` days. Wire into server startup after migrations.
- [x] **GREEN** — Run `npx vitest run tests/observability/retention.test.ts` → old rows deleted, recent rows intact.

---

### 17. Webchat observability tab

- [x] **RED** — Check: `webchat/index.html` does not contain a "Logs" tab element and `webchat/logs.js` does not exist. Assert both conditions. Run check → assertion passes (neither exists).
- [x] **ACTION** — Add a "Logs" tab to `webchat/index.html` with: level filter `<select>`, log table/list area, pause/resume button, error badge on the tab label. Create `webchat/logs.js`: connect to `/api/logs/stream` via `EventSource`, render records as colored rows, implement level filter (client-side), implement pause/resume, increment badge on error/fatal, reset badge on tab focus.
- [x] **GREEN** — Verify: `webchat/index.html` contains the Logs tab element. `webchat/logs.js` exists and is referenced. Manually load the webchat and confirm: stream appears, level filter works, error badge increments on error records.

---

### 18. Roadmap and decisions update

- [x] **RED** — Check: `agent-roadmap.md` observability section still shows all 5 items as `💡 idea`. Assert `token-budget` request brief exists. Run check → items are `💡 idea` (not yet updated).
- [x] **ACTION** — Update `agent-roadmap.md`: mark "Structured audit log", "Session lifecycle events log", "Rate limit headroom tracking", "Swallowed-event log" as `🔄 in progress [observability-system]`. Add "Analytics streaming" and OTEL exporter as `💡 idea` notes referencing the next request. Mark "Token budget & overspend protection" as `🔄 in progress [token-budget]`. Add to `reespec/decisions.md`: pino as operational logger decision, turn_journal permanence decision, OTEL-ready schema decision.
- [x] **GREEN** — Verify: `agent-roadmap.md` contains `🔄 in progress [observability-system]` for the 4 covered items. `decisions.md` contains the 3 new architectural decisions. `reespec/requests/token-budget/brief.md` exists and is non-empty.

---

### 19. [Gap fix] Signal channel — module-level child logger

- [x] **RED** — Strengthened `tests/observability/channel-logger.test.ts`: Signal test now asserts `.child({ component: 'signal' })` is called and that no per-call `getLogger().warn/error/...` pattern remains. Run → failed (Signal used per-call `getLogger()`).
- [x] **ACTION** — Added `const _log = getLogger().child({ component: 'signal' })` at module level in `src/channels/signal.ts`. Replaced all six `getLogger().xxx({ component: 'signal', ... })` call sites with `_log.xxx(...)`. The `component` field is now bound once by the child logger.
- [x] **GREEN** — Run `npx vitest run tests/observability/channel-logger.test.ts` → 3/3 pass.

---

### 20. [Gap fix] Operational logs — pino writes warn+ to SQLite

- [x] **RED** — Wrote `tests/observability/operational-logs-persist.test.ts`: assert warn/error records appear in `operational_logs` after `createLogger(config, db).warn(...)`. Run → 2/4 failed (warn and error tests failed, info/debug NOT-written tests correctly passed).
- [x] **ACTION** — Updated `src/observability/logger.ts`: `createLogger(config, db?)` accepts an optional `Database` argument. When provided, adds a fourth `pino.multistream` destination: an in-process `Writable` that parses NDJSON lines, filters for `level >= 40` (warn+), and inserts rows into `operational_logs`. Updated `initLogger` signature to match. Updated `src/server.ts` to call `initLogger({ level }, db)` after DB is ready so production deployments persist warn+ logs.
- [x] **GREEN** — Run `npx vitest run tests/observability/operational-logs-persist.test.ts` → 4/4 pass.

---

### 21. [Gap fix] Web channel — emit channel_connected/channel_disconnected events

- [x] **RED** — Added two assertions to `tests/observability/channel-events.test.ts`: `web.ts` contains `'channel_connected'` and `'channel_disconnected'`. Run → 2 new tests failed.
- [x] **ACTION** — Added `emitEvent` and `getDb` imports to `src/channels/web.ts`. In `start()`, emit `channel_connected` event with `{ channelType: 'web' }`. In `stop()`, emit `channel_disconnected` event with `{ channelType: 'web', reason: 'stopped' }`. Both wrapped in `try { } catch { /* db not ready */ }` for graceful degradation during early startup.
- [x] **GREEN** — Run `npx vitest run tests/observability/channel-events.test.ts` → 6/6 pass.

---

### 22. [Gap fix] Rate limit warn threshold — configurable via options

- [x] **RED** — Wrote `tests/observability/rate-limit-threshold-config.test.ts`: pass `{ rateLimitWarnThreshold: 1000 }` to `makeObservabilityExtension`, assert 2000 tokens does NOT trigger a warning (below default 5000 but above custom 1000). Run → failed (hardcoded 5000 ignored the custom value).
- [x] **ACTION** — Added `ObservabilityOptions` interface to `src/extensions/observability.ts` with optional `rateLimitWarnThreshold`. Changed `makeObservabilityExtension(pi, db, opts = {})` to read `opts.rateLimitWarnThreshold ?? 5000`. Added `rate_limit_warn_threshold: z.number().int().min(0).default(5000)` to `LoggingConfigSchema` in `src/config.ts`. Updated `src/extensions/loader.ts` to pass `{ rateLimitWarnThreshold: config.logging.rate_limit_warn_threshold }` to the extension.
- [x] **GREEN** — Run `npx vitest run tests/observability/rate-limit-threshold-config.test.ts` → 3/3 pass.

---

### 23. [Gap fix] rate_limits.provider from config, not event field

- [x] **RED** — Wrote `tests/observability/rate-limit-provider-config.test.ts`: assert that when `configProvider: 'anthropic'` is passed to `makeObservabilityExtension`, the recorded row uses 'anthropic' even when `event.provider` says something else; and that `getLatestRateLimit(db, 'anthropic')` finds the row. Run → 2/3 failed (implementation used `event.provider ?? 'unknown'`, ignoring configProvider).
- [x] **ACTION** — Added `configProvider?: string` field to `ObservabilityOptions` in `src/extensions/observability.ts`. Changed provider resolution from `event.provider ?? 'unknown'` to `opts.configProvider ?? 'unknown'`. Updated `src/extensions/loader.ts` to pass `configProvider: config?.agent?.model?.provider ?? 'unknown'`. Updated `src/server.ts` line 285 to construct `new Scheduler(db, schedulerOrchestrator, { provider: schedulerProvider })` where `schedulerProvider = appConfig?.agent?.model?.provider ?? 'unknown'`. Updated existing `tests/observability/rate-limits.test.ts` tests that expected `event.provider` behaviour to pass `configProvider` explicitly, reflecting the correct contract.
- [x] **GREEN** — Run `npx vitest run tests/observability/ tests/scheduler.test.ts tests/server.test.ts` → 27 files, 155 tests pass.
