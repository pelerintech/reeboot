## Evaluation — 2026-05-07 22:45

### OB-1-A: Logger singleton
verdict:  ⚠️ PARTIAL
reason:   `src/observability/logger.ts` exists with correct stdout and warn+ file transports. However, the spec states "the logger is exported as the default export" — only named exports (`createLogger`, `initLogger`, `getLogger`) exist; no `export default`. Additionally, the spec's risk note specifies "the async `pino/file` transport (which runs in a worker thread)"; the implementation uses synchronous `pino.destination()` via `multistream`, not the worker-thread file transport.
focus:    `src/observability/logger.ts` — missing default export; `pino.destination(logFile)` should be `pino.transport({ target: 'pino/file', … })` for non-blocking I/O

### OB-1-B: console.* replaced across all src/ modules
verdict:  ✅ SATISFIED
reason:   `grep` finds 0 `console.*` calls in all non-UI `src/` files (wizard/, setup-wizard.ts, skills-cli.ts, index.ts, daemon.ts excluded). Logger calls include `component` field at all call sites. Tests confirm and pass.

### OB-1-C: Channel child loggers
verdict:  ✅ SATISFIED
reason:   `src/channels/whatsapp.ts` uses `getLogger().child({ component: 'whatsapp' })` at `warn` level; `src/channels/signal.ts` uses `getLogger().child({ component: 'signal' })`. No-op object pattern removed.

### OB-1-D: DB debug wrapper
verdict:  ⚠️ PARTIAL
reason:   `src/observability/db-wrapper.ts` exports `wrapDb()` that logs `{ sql, params, durationMs }` at debug on every call and error on throw. However, the spec says "Wire `wrapDb` into `openDatabase()`" — no call to `wrapDb` exists anywhere in `src/db/index.ts` or `src/server.ts`. The wrapper is tested in isolation but is dead code in production.
focus:    `src/db/index.ts` — `wrapDb` is never imported or called from `openDatabase()`

### OB-1-E: Operational log retention
verdict:  ⚠️ PARTIAL
reason:   `src/observability/retention.ts` exports `pruneObservabilityData()` which deletes old `operational_logs`, `events`, and closed `turn_journal` rows. Spec says "WHEN the server starts THEN…" — `pruneObservabilityData` is never imported or called from `src/server.ts`. The function is dead code in production.
focus:    `src/server.ts` — `pruneObservabilityData` is not called from server startup path

### OB-2-A: Events table exists after migration
verdict:  ✅ SATISFIED
reason:   `runObservabilityMigration()` creates `events`, `session_events`, `rate_limits`, and `operational_logs` tables with all required columns. `turn_journal` gets `closed_at` column. Migration is idempotent. Tests confirm.

### OB-2-B: emitEvent writes a structured row
verdict:  ✅ SATISFIED
reason:   `emitEvent()` in `src/observability/events.ts` inserts rows with `trace_id` (32-char hex), `span_id` (16-char hex), `created_ns` (nanosecond epoch), and OTEL severity numbers. Tests confirm all fields.

### OB-2-C: Turn lifecycle events are emitted
verdict:  ✅ SATISFIED
reason:   `src/orchestrator.ts` emits `turn_started` at turn open, `turn_completed` with `durationMs` on success, and `turn_failed` with `reason` on timeout or error. Tests pass confirming all three paths.

### OB-2-D: Scheduler events are emitted
verdict:  ❌ UNSATISFIED
reason:   Spec requires "an `events` row of type `scheduler_fired` is inserted with `taskId` and `contextId` in payload" when a scheduled task is dispatched. `grep -rn "scheduler_fired"` across all of `src/` returns no results. `src/scheduler.ts` only emits `scheduler_throttled`.
focus:    `src/scheduler.ts` `_runTask()` — `scheduler_fired` event is never emitted

### OB-2-E: Swallowed events are emitted
verdict:  ❌ UNSATISFIED
reason:   Spec requires a `swallowed_reply` event "when `Orchestrator._reply()` swallows [a message] because `channelType` is `heartbeat` or `scheduler`." The `_reply()` method in `src/orchestrator.ts` has no `emitEvent()` call; it silently returns on those paths with no audit record.
focus:    `src/orchestrator.ts` `_reply()` — no `swallowed_reply` `emitEvent()` call

### OB-2-F: Channel connect/disconnect events are emitted
verdict:  ❌ UNSATISFIED
reason:   Spec requires `channel_connected` and `channel_disconnected` events when a channel adapter changes status. `grep -rn "channel_connected\|channel_disconnected"` across `src/` returns no results. Neither `src/channels/whatsapp.ts` nor `src/channels/signal.ts` calls `emitEvent()`.
focus:    `src/channels/whatsapp.ts`, `src/channels/signal.ts`, `src/channels/registry.ts` — no channel status events emitted

### OB-3-A: closeTurn marks closed, does not delete
verdict:  ✅ SATISFIED
reason:   `TurnJournal.closeTurn()` performs `UPDATE … SET status = 'closed', closed_at = datetime('now')`. Row is retained. `getOpenJournals()` filters by `status = 'open'`. Tests confirm.

### OB-3-B: Open turns remain crash evidence
verdict:  ✅ SATISFIED
reason:   `getOpenJournals()` unchanged; existing resilience recovery logic in `src/resilience/startup.ts` is unaffected. Tests confirm.

### OB-3-C: Closed turns are queryable
verdict:  ✅ SATISFIED
reason:   `getClosedTurns(db, { limit })` exists, returns closed rows ordered by `closed_at DESC` with steps joined. Tests confirm.

### OB-3-D: Retention pruning removes old closed turns
verdict:  ✅ SATISFIED
reason:   `pruneTurns(db, retentionDays)` deletes closed rows older than threshold, never open rows. Tests confirm cascade and open-row protection.

### OB-4-A: session_shutdown is captured
verdict:  ⚠️ PARTIAL
reason:   `src/extensions/observability.ts` correctly handles all reason values and inserts into `session_events`. However, `makeObservabilityExtension` is **never registered in production** — it is absent from `src/extensions/loader.ts` and never called from `src/server.ts` or `src/agent-runner/`. In production, the pi `session_shutdown` hook is never registered; the function only runs in tests.
focus:    `src/extensions/loader.ts` — `makeObservabilityExtension` not wired into the extension loader

### OB-4-B: Crash links to open turn
verdict:  ⚠️ PARTIAL
reason:   Logic correctly detects open turns and sets `reason = 'crash'` with `linked_turn_id`. Tests confirm. Same production-registration gap as OB-4-A applies.
focus:    Same as OB-4-A

### OB-4-C: Clean shutdown has no linked turn
verdict:  ⚠️ PARTIAL
reason:   Logic correct in isolation. Same production-registration gap applies.
focus:    Same as OB-4-A

### OB-5-A: after_provider_response captures headers
verdict:  ⚠️ PARTIAL
reason:   Header parsing and row insertion logic is correct. Spec says "provider is the model provider string from config" — the implementation reads `event.provider ?? 'unknown'`, not from config. Same production-registration gap as OB-4-A also applies.
focus:    `src/extensions/observability.ts` — provider taken from event field, not from config; extension not wired into loader

### OB-5-B: Missing headers degrade gracefully
verdict:  ⚠️ PARTIAL
reason:   No row inserted, no error thrown, debug log emitted — correct in isolation. Same production-registration gap applies.
focus:    Same as OB-4-A

### OB-5-C: Warn log when headroom critically low
verdict:  ⚠️ PARTIAL
reason:   Warn log is emitted: "Rate limit headroom low: N tokens remaining" ✓. However, spec also requires "an `events` row of type `rate_limit_warning` is inserted with `remaining_tokens` in payload" — `grep -rn "rate_limit_warning"` returns no results anywhere in `src/`. Only `getLogger().warn()` is called; `emitEvent()` is not.
focus:    `src/extensions/observability.ts` — `emitEvent({ type: 'rate_limit_warning', … })` call is missing

### OB-5-D: Scheduler throttles on retry-after
verdict:  ✅ SATISFIED
reason:   `src/scheduler.ts` checks `getLatestRateLimit()` before dispatch, skips tasks when `retry_after_ms` is active, emits `scheduler_throttled` event, updates `next_run`, and logs at warn. Tests confirm all conditions including expired retry-after pass-through.

### OB-5-E: Latest rate limit headroom is queryable
verdict:  ✅ SATISFIED
reason:   `getLatestRateLimit(db, provider)` in `src/extensions/observability.ts` returns most recent row or null. Tests confirm both cases.

### OB-6-A: SSE endpoint streams log records
verdict:  ⚠️ PARTIAL
reason:   `GET /api/logs/stream` endpoint exists and uses `streamSSE`. Audit events from `emitEvent()` reach the stream via `emitLogRecord()`. However, spec states "every subsequent log record (from pino) is sent as an SSE event" — `src/observability/logger.ts` has no hook into `sseEmitter`; `emitLogRecord` is never called from any pino transport. Operational pino logs (info, warn, error from modules) do **not** appear in the SSE stream.
focus:    `src/observability/logger.ts` — pino transport does not call `emitLogRecord`; SSE only receives audit events, not operational logs

### OB-6-B: Level filter is respected
verdict:  ✅ SATISFIED
reason:   `_pinoLevelToNumber()` converts level string to number; records below threshold are skipped in the SSE handler. Logic is correct for records that do arrive.

### OB-6-C: Multiple concurrent SSE clients
verdict:  ✅ SATISFIED
reason:   `SseEmitter extends EventEmitter` with `setMaxListeners(100)`. Each SSE handler subscribes independently and unsubscribes on abort. Multiple listeners are structurally supported.

### OB-6-D: reeboot logs --follow connects to the stream
verdict:  ✅ SATISFIED
reason:   `reeboot logs --follow` registered in `src/index.ts`. Connects to `/api/logs/stream`, prints human-readable format (`TIME LEVEL [component] msg`), handles `SIGINT` and `AbortError` cleanly.

### OB-6-E: reeboot logs --follow falls back to file
verdict:  ✅ SATISFIED
reason:   On `ECONNREFUSED`, tails most recent `.log` file in `~/.reeboot/logs/`. Prints `"Server not running — tailing log file: <path>"` matching the exact contract wording.

### OB-7-A: Logs tab exists in the webchat
verdict:  ✅ SATISFIED
reason:   `webchat/index.html` contains a "Logs" tab button; `webchat/logs.js` creates an `EventSource('/api/logs/stream')` and appends records to `#logs-table` with auto-scroll.

### OB-7-B: Level filter controls which records are shown
verdict:  ✅ SATISFIED
reason:   `#logs-level-filter` select exists; `renderRecord()` checks `LEVEL_NUMBERS[levelFilter.value]` and skips records below threshold. Spec describes this as "client-side filter on the already-received stream" — new records are filtered correctly.

### OB-7-C: Pause and resume work
verdict:  ✅ SATISFIED
reason:   `paused` flag blocks `renderRecord()` via early return; SSE connection stays open (`eventSource` not closed). Records during pause are discarded, not buffered. Resume button toggles back.

### OB-7-D: Error/fatal badge is visible from all tabs
verdict:  ✅ SATISFIED
reason:   `connect()` is called at `logs.js` init time regardless of active tab; SSE is always live. `renderRecord()` checks `logsTabBtn.classList.contains('active')` and increments badge only when Logs tab is inactive — ensuring badge appears on Chat tab.

### OB-7-E: Badge resets when Logs tab is focused
verdict:  ✅ SATISFIED
reason:   Tab-click handler resets `errorBadgeCount = 0`, sets `badgeEl.hidden = true` and `badgeEl.textContent = '0'` when `data-tab="logs"` is clicked.

## Triage

⚠️ Worth a look:
- **OB-1-A** — logger has no `export default`; file transport is sync (`pino.destination`) not async worker thread (`pino/file`); low operational risk but deviates from contract
- **OB-1-D** — `wrapDb` exists but is never called from `openDatabase()`; DB debug wrapper is dead code in production
- **OB-1-E** — `pruneObservabilityData` exists but is never called from server startup; retention never fires in production
- **OB-2-D** — `scheduler_fired` event never emitted; scheduled task dispatches are unobservable in the audit log
- **OB-2-E** — `swallowed_reply` event never emitted; heartbeat/scheduler-swallowed errors remain invisible in the events table
- **OB-2-F** — `channel_connected`/`channel_disconnected` events never emitted; channel lifecycle unobservable
- **OB-4-A/B/C** — `makeObservabilityExtension` not registered in production loader; `session_shutdown` hook never fires in production
- **OB-5-A/B** — same production-wiring gap; rate limit capture never runs without manual loader registration
- **OB-5-C** — `rate_limit_warning` `emitEvent()` call missing; spec requires an events row in addition to the warn log
- **OB-6-A** — pino operational logs do not feed `sseEmitter`; the SSE stream only carries audit events, not the operational log stream the spec describes

✅ Safe to skip: OB-1-B, OB-1-C, OB-2-A, OB-2-B, OB-2-C, OB-3-A, OB-3-B, OB-3-C, OB-3-D, OB-5-D, OB-5-E, OB-6-B, OB-6-C, OB-6-D, OB-6-E, OB-7-A, OB-7-B, OB-7-C, OB-7-D, OB-7-E

---

## Evaluation — 2026-05-07 23:09

### OB-1-A: logger-singleton
verdict:  ✅ SATISFIED
reason:   `src/observability/logger.ts` creates a pino logger at the configured `logging.level` (default `info`), writes NDJSON to stdout, writes `warn+` to `~/.reeboot/logs/reeboot-YYYY-MM-DD.log` via `pino.destination`, fans out to SSE via an in-process `Writable`, and exports `getLogger` as the default export.

### OB-1-B: console-replaced
verdict:  ✅ SATISFIED
reason:   `tests/observability/no-console.test.ts` passes 3/3, scanning every `src/` file (excluding wizard, daemon, skills-cli, index — all permitted as "wizard/CLI user-facing output" per spec). Orchestrator and server are individually asserted to have 0 `console.*` calls.

### OB-1-C: channel-child-loggers
verdict:  ⚠️ PARTIAL
reason:   WhatsApp uses `getLogger().child({ component: 'whatsapp' })` satisfying the spec's explicit `logger.child()` requirement. Signal does **not** call `.child()`: it calls `getLogger()` and passes `{ component: 'signal' }` per-call. The channel-logger test only checks for the string `component: 'signal'` — it does not verify that a child logger is actually constructed.
focus:    `src/channels/signal.ts` — replace per-call `getLogger().error({ component: 'signal' }, …)` with a module-level `const logger = getLogger().child({ component: 'signal' })`.

### OB-1-D: db-debug-wrapper
verdict:  ✅ SATISFIED
reason:   `src/observability/db-wrapper.ts` provides both `patchDb` and `wrapDb`; both wrap `get/all/run`, emit `debug`-level `{ sql, params, durationMs }` on success, and `error`-level on throw. Query results returned unchanged.

### OB-1-E: operational-log-retention
verdict:  ⚠️ PARTIAL
reason:   `src/observability/retention.ts` deletes rows from `operational_logs` older than `retention_days` and prunes log files. However, **nothing ever inserts into `operational_logs`** — the pino logger has no transport that writes `warn+` records to the SQLite table. The brief states "warn and above are persisted" to Stream 2. The table is created and pruned but permanently empty, making retention vacuous.
focus:    `src/observability/logger.ts` — add a pino transport (or multistream leg) that inserts `warn+` log records into `operational_logs` via the DB.

### OB-2-A: events-table-migration
verdict:  ✅ SATISFIED
reason:   `runObservabilityMigration` in `src/db/schema.ts` creates `events`, `session_events`, `rate_limits`, and `operational_logs` tables using `CREATE TABLE IF NOT EXISTS`. Adds `closed_at` to `turn_journal` via conditional `ALTER TABLE`. All operations are idempotent.

### OB-2-B: emitEvent-row-structure
verdict:  ✅ SATISFIED
reason:   `emitEvent()` generates a nanoid `id`, 32-char hex `trace_id` via `randomBytes(16)`, 16-char hex `span_id` via `randomBytes(8)`, and `created_ns` as `BigInt(Date.now()) * 1_000_000n`. OTEL severity numbers accepted as-is. Tests pass 8/8.

### OB-2-C: turn-lifecycle-events
verdict:  ✅ SATISFIED
reason:   `src/orchestrator.ts` emits `turn_started` at turn open, `turn_completed` (with `durationMs` in payload) on success, and `turn_failed` (with `reason`) on timeout or error. Tests pass 3/3.

### OB-2-D: scheduler-fired-events
verdict:  ✅ SATISFIED
reason:   `src/scheduler.ts` emits a `scheduler_fired` audit event with `taskId` and `contextId` in payload before dispatching each due task. Tests pass 1/1.

### OB-2-E: swallowed-events
verdict:  ✅ SATISFIED
reason:   `src/orchestrator.ts` emits a `swallowed_reply` event with `channelType`, `reason`, and `text` in payload at WARN severity (13) when `_reply()` suppresses a heartbeat or scheduler turn. Tests pass 2/2.

### OB-2-F: channel-connect-disconnect-events
verdict:  ⚠️ PARTIAL
reason:   WhatsApp and Signal both emit `channel_connected` and `channel_disconnected` events. The **web channel** (`src/channels/web.ts`) has explicit `connect()`/`disconnect()` methods that transition status but calls `emitEvent()` nowhere. The spec says "GIVEN a channel adapter changes status" without limiting scope to external channels.
focus:    `src/channels/web.ts` — add `emitEvent(db, { type: 'channel_connected', … })` in `connect()` and `channel_disconnected` in `disconnect()`.

### OB-3-A: closeTurn-marks-closed
verdict:  ✅ SATISFIED
reason:   `TurnJournal.closeTurn()` issues `UPDATE … SET status = 'closed', closed_at = datetime('now')` — no DELETE. `getOpenJournals()` filters by `status = 'open'`. Tests pass 6/6.

### OB-3-B: open-turns-crash-evidence
verdict:  ✅ SATISFIED
reason:   `getOpenJournals()` queries `WHERE status = 'open'` and returns rows with steps; existing resilience startup path is unaffected.

### OB-3-C: closed-turns-queryable
verdict:  ✅ SATISFIED
reason:   `getClosedTurns(db, { limit: 20 })` returns the 20 most recent closed turns ordered by `closed_at DESC`, each joined with steps.

### OB-3-D: retention-pruning
verdict:  ✅ SATISFIED
reason:   `pruneTurns(db, retentionDays)` deletes rows where `status = 'closed'` and `closed_at < datetime('now', '-N days')`. Steps cascade via `ON DELETE CASCADE`. Open rows are never touched.

### OB-4-A: session-shutdown-captured
verdict:  ✅ SATISFIED
reason:   `makeObservabilityExtension` handles `session_shutdown` and inserts a `session_events` row with `reason`, `context_id`, and `created_at` for any reason value. Tests pass 4/4.

### OB-4-B: crash-links-open-turn
verdict:  ✅ SATISFIED
reason:   When `getOpenJournals()` returns rows at shutdown time, `reason` is overridden to `'crash'` and `linked_turn_id` is set to the open turn's `turn_id`. `session_path` set from `event.targetSessionFile` if present.

### OB-4-C: clean-shutdown-no-linked-turn
verdict:  ✅ SATISFIED
reason:   When no turn_journal rows are open, `linked_turn_id = null` and `reason` is passed through unchanged from the pi event.

### OB-5-A: rate-limit-headers-captured
verdict:  ✅ SATISFIED
reason:   `after_provider_response` handler parses `x-ratelimit-remaining-tokens`, `x-ratelimit-remaining-requests`, and `retry-after` (both numeric-seconds and HTTP-date formats). Inserts `rate_limits` row with all required fields. Tests pass 6/6.

### OB-5-B: missing-headers-degrade-gracefully
verdict:  ✅ SATISFIED
reason:   When all three header values are null, handler returns early without inserting and emits a `debug` log: "No rate limit headers found in provider response."

### OB-5-C: low-headroom-warn
verdict:  ⚠️ PARTIAL
reason:   Warn log and `rate_limit_warning` audit event are both emitted when `remaining_tokens < LOW_TOKENS_THRESHOLD`. However, the spec requires a "(configurable threshold)" — the threshold is hardcoded as `const LOW_TOKENS_THRESHOLD = 5000` in `src/extensions/observability.ts`, not driven by any config value.
focus:    `src/extensions/observability.ts` — expose threshold through config (e.g. `logging.rate_limit_warn_threshold`).

### OB-5-D: scheduler-throttles-on-retry-after
verdict:  ✅ SATISFIED
reason:   `src/scheduler.ts` calls `getLatestRateLimit` at every poll, skips due tasks when `recorded_at + retry_after_ms > now`, updates `next_run` to `expiresMs + 5000`, emits warn log "Scheduler task deferred: provider retry-after in effect", and inserts `scheduler_throttled` audit event.

### OB-5-E: latest-rate-limit-queryable
verdict:  ✅ SATISFIED
reason:   `getLatestRateLimit(db, provider)` returns the most recent `rate_limits` row or `null`. Handles missing table gracefully via try/catch.

### OB-6-A: sse-endpoint-streams
verdict:  ✅ SATISFIED
reason:   `GET /api/logs/stream` in `src/server.ts` uses Hono `streamSSE`, registers a `sseEmitter` listener writing each record as `data: <JSON>`, stays open until client disconnects via `stream.onAbort`. Both pino (via in-process `Writable` → `emitLogRecord`) and audit events fan out to subscribers. Tests pass 4/4.

### OB-6-B: sse-level-filter
verdict:  ✅ SATISFIED
reason:   `?level=` param converted to pino level number; records below threshold skipped before SSE write. Verified by passing `sse-endpoint.test.ts`.

### OB-6-C: multiple-concurrent-sse-clients
verdict:  ✅ SATISFIED
reason:   `SseEmitter extends EventEmitter` with `setMaxListeners(100)`. Each client subscribes independently and unsubscribes on abort. Tests pass 5/5.

### OB-6-D: reeboot-logs-follow-cli
verdict:  ✅ SATISFIED
reason:   `reeboot logs --follow` in `src/index.ts` connects to `/api/logs/stream`, pretty-prints records as `${time} ${level} [${component}] ${msg}`, exits cleanly on Ctrl-C. Tests pass 3/3.

### OB-6-E: reeboot-logs-follow-fallback
verdict:  ✅ SATISFIED
reason:   On `ECONNREFUSED` or non-200, tails most recent `.log` file in `~/.reeboot/logs/`. Prints "Server not running — tailing log file: \<path\>".

### OB-7-A: logs-tab-exists
verdict:  ✅ SATISFIED
reason:   `webchat/index.html` has a "Logs" tab button; `webchat/logs.js` connects via `new EventSource('/api/logs/stream')` and appends records to `#logs-table` with auto-scroll.

### OB-7-B: webchat-level-filter
verdict:  ✅ SATISFIED
reason:   `renderRecord()` applies client-side level filter against `#logs-level-filter` dropdown, skipping records below threshold — matching "client-side filter on the already-received stream."

### OB-7-C: webchat-pause-resume
verdict:  ✅ SATISFIED
reason:   Pause toggles `paused` flag; `onmessage` returns early without rendering when paused, discarding records without buffering. SSE connection stays open. Resume reactivates rendering.

### OB-7-D: error-fatal-badge
verdict:  ✅ SATISFIED
reason:   `renderRecord()` checks `recordLevel >= 50` (error/fatal) and, when Logs tab is not active, increments `errorBadgeCount` and unhides `#logs-error-badge` on the Logs tab label.

### OB-7-E: badge-resets-on-focus
verdict:  ✅ SATISFIED
reason:   Tab-click handler for `data-tab="logs"` sets `errorBadgeCount = 0`, `badgeEl.hidden = true`, and `badgeEl.textContent = '0'`.

## Triage

✅ Safe to skip: OB-1-A, OB-1-B, OB-1-D, OB-2-A, OB-2-B, OB-2-C, OB-2-D, OB-2-E, OB-3-A, OB-3-B, OB-3-C, OB-3-D, OB-4-A, OB-4-B, OB-4-C, OB-5-A, OB-5-B, OB-5-D, OB-5-E, OB-6-A, OB-6-B, OB-6-C, OB-6-D, OB-6-E, OB-7-A, OB-7-B, OB-7-C, OB-7-D, OB-7-E

⚠️  Worth a look:
- **OB-1-C** (channel-child-loggers) — Signal uses `getLogger()` per-call rather than `getLogger().child({ component: 'signal' })`; spec explicitly requires a child logger.
- **OB-1-E** (operational-log-retention) — `operational_logs` table is never written to; the brief states "warn and above are persisted" to SQLite but no pino transport inserts rows; retention prunes a table that is always empty.
- **OB-2-F** (channel-connect-disconnect-events) — web channel `connect()`/`disconnect()` do not emit `channel_connected`/`channel_disconnected` events; spec scope is "a channel adapter" with no exclusion.
- **OB-5-C** (low-headroom-warn) — token warn threshold is hardcoded (`const LOW_TOKENS_THRESHOLD = 5000`); spec requires a configurable threshold.

---

## Evaluation — 2026-05-07 23:26

### OB-1-A: logger-singleton
verdict:  ✅ SATISFIED
reason:   `src/observability/logger.ts` creates a pino logger at the configured `logging.level` (default `info`), writes structured NDJSON to stdout, writes `warn+` to `~/.reeboot/logs/reeboot-YYYY-MM-DD.log` via a file multistream leg, and exports `getLogger` as the default export (`export default getLogger`).

### OB-1-B: console-replaced
verdict:  ✅ SATISFIED
reason:   `tests/observability/no-console.test.ts` (3/3 passing) scans all `src/` files and asserts 0 `console.*` calls in orchestrator, server, and all non-wizard/CLI files. Exclusions (wizard/, daemon.ts, index.ts, skills-cli.ts, setup-wizard.ts) map directly to the spec's "other than wizard/CLI user-facing output" exception.

### OB-1-C: channel-child-loggers
verdict:  ✅ SATISFIED
reason:   WhatsApp uses `getLogger().child({ component: 'whatsapp' })` at line 75 of `src/channels/whatsapp.ts`. Signal declares a module-level `const _log = getLogger().child({ component: 'signal' })` at line 23 of `src/channels/signal.ts`; all 6 log call sites use `_log` — no per-call `getLogger()` pattern remains.

### OB-1-D: db-debug-wrapper
verdict:  ✅ SATISFIED
reason:   `src/observability/db-wrapper.ts` exports `patchDb` which monkey-patches `prepare()` to wrap `run/get/all` with debug-level `{ sql, params, durationMs }` logging and error-level on throw. `patchDb(db)` is called at line 54 of `src/db/index.ts` inside `openDatabase()` — every query in production goes through the wrapper.

### OB-1-E: operational-log-retention
verdict:  ✅ SATISFIED
reason:   `pruneObservabilityData(db, retentionDays)` is called at server startup (line 158 of `src/server.ts`), deleting `operational_logs` rows and log files older than `retention_days`. `initLogger({ level }, db)` is called at line 164 after the DB is ready, adding a DB persist stream so `warn+` records actually populate `operational_logs`. Both operations are idempotent.

### OB-2-A: events-table-migration
verdict:  ✅ SATISFIED
reason:   `runObservabilityMigration` in `src/db/schema.ts` creates `events`, `session_events`, `rate_limits`, and `operational_logs` via `CREATE TABLE IF NOT EXISTS` and adds `closed_at` to `turn_journal` via conditional `ALTER TABLE`. All four tables confirmed present; migration is idempotent.

### OB-2-B: emitEvent-row-structure
verdict:  ✅ SATISFIED
reason:   `emitEvent()` generates `id` (nanoid), `trace_id` (32-char hex via `randomBytes(16).toString('hex')`), `span_id` (16-char hex via `randomBytes(8).toString('hex')`), `created_ns` (`BigInt(Date.now()) * 1_000_000n` = nanoseconds), and stores the caller-provided OTEL `severity` value unchanged. Tests pass 8/8.

### OB-2-C: turn-lifecycle-events
verdict:  ✅ SATISFIED
reason:   `src/orchestrator.ts` emits `turn_started` (line 231) at turn open, `turn_completed` with `durationMs` in payload (line 400) on success, and `turn_failed` with `reason` (lines 323, 380) on timeout or error. Tests pass 3/3.

### OB-2-D: scheduler-fired-events
verdict:  ✅ SATISFIED
reason:   `src/scheduler.ts` emits a `scheduler_fired` event (line 180) with `taskId` and `contextId` in payload before dispatching each due task. Tests pass 1/1.

### OB-2-E: swallowed-events
verdict:  ✅ SATISFIED
reason:   `src/orchestrator.ts` emits `swallowed_reply` (line 567) with `channelType`, `reason`, and `text` in payload at severity 13 (WARN) when `_reply()` swallows a heartbeat or scheduler message. Tests pass 2/2.

### OB-2-F: channel-connect-disconnect-events
verdict:  ✅ SATISFIED
reason:   WhatsApp and Signal emit `channel_connected`/`channel_disconnected` on status transitions. `src/channels/web.ts` now also emits `channel_connected` in `start()` (line 36) and `channel_disconnected` in `stop()` (line 43), both with `try/catch` graceful degradation. Tests pass 6/6.

### OB-3-A: closeTurn-marks-closed
verdict:  ✅ SATISFIED
reason:   `TurnJournal.closeTurn()` issues `UPDATE turn_journal SET status = 'closed', closed_at = datetime('now')` (line 84 of `src/resilience/turn-journal.ts`) — no DELETE. `getOpenJournals()` filters by `status = 'open'`. Tests pass 6/6.

### OB-3-B: open-turns-crash-evidence
verdict:  ✅ SATISFIED
reason:   `getOpenJournals()` queries `WHERE status = 'open'` and returns rows with steps; the existing resilience startup recovery path is unaffected.

### OB-3-C: closed-turns-queryable
verdict:  ✅ SATISFIED
reason:   `getClosedTurns(db, { limit })` (line 113) returns closed turns ordered by `closed_at DESC` with steps joined, up to the requested limit.

### OB-3-D: retention-pruning
verdict:  ✅ SATISFIED
reason:   `pruneTurns(db, retentionDays)` (line 136) deletes `status = 'closed'` rows older than the retention window. Steps cascade via `ON DELETE CASCADE`. Open rows are never touched.

### OB-4-A: session-shutdown-captured
verdict:  ✅ SATISFIED
reason:   `makeObservabilityExtension` in `src/extensions/observability.ts` handles `session_shutdown` and inserts a `session_events` row with `reason`, `context_id`, and `created_at` for any reason value (quit, reload, new, resume, fork). Tests pass 4/4.

### OB-4-B: crash-links-open-turn
verdict:  ✅ SATISFIED
reason:   When `getOpenJournals(db)` returns rows at shutdown, `reason` is overridden to `'crash'` and `linked_turn_id` is set to the open turn's `turn_id`. `session_path` is set from `event.targetSessionFile` if present.

### OB-4-C: clean-shutdown-no-linked-turn
verdict:  ✅ SATISFIED
reason:   When no turn_journal rows are open, `linked_turn_id = null` and `reason` is passed through unchanged from the pi event.

### OB-5-A: rate-limit-headers-captured
verdict:  ⚠️ PARTIAL
reason:   All three headers are parsed and a `rate_limits` row is inserted correctly. However, the spec requires "AND `provider` is the model provider string from config" — the implementation uses `event.provider ?? 'unknown'` (line 97 of `src/extensions/observability.ts`) rather than the configured `agent.model.provider`. The scheduler queries `getLatestRateLimit(db, this._provider)` where `this._provider` defaults to `'unknown'` because `server.ts` passes no `provider` option to `new Scheduler(...)`. If pi's `after_provider_response` event carries a real provider name (e.g. 'anthropic'), the scheduler's throttle lookup will miss the recorded row entirely.
focus:    `src/extensions/observability.ts` line 97 — use config's `agent.model.provider` instead of `event.provider`. `src/server.ts` line 285 — pass `provider: config.agent.model.provider` to `new Scheduler(...)`.

### OB-5-B: missing-headers-degrade-gracefully
verdict:  ✅ SATISFIED
reason:   When all three header values parse to null, the handler returns early without inserting and emits `debug` log: "No rate limit headers found in provider response." No error thrown.

### OB-5-C: low-headroom-warn
verdict:  ✅ SATISFIED
reason:   Warn log "Rate limit headroom low: N tokens remaining" is emitted and a `rate_limit_warning` audit event is inserted when `remaining_tokens < rateLimitWarnThreshold`. Threshold is configurable via `logging.rate_limit_warn_threshold` in config.ts (default 5000), passed through the loader to `makeObservabilityExtension`. Tests pass 5/5.

### OB-5-D: scheduler-throttles-on-retry-after
verdict:  ✅ SATISFIED
reason:   `src/scheduler.ts` checks `getLatestRateLimit` at every poll tick, skips due tasks when `recorded_at + retry_after_ms > now`, updates `next_run` to `expiresMs + 5000` buffer, emits warn log "Scheduler task deferred: provider retry-after in effect", and inserts a `scheduler_throttled` event. Tests pass 3/3.

### OB-5-E: latest-rate-limit-queryable
verdict:  ✅ SATISFIED
reason:   `getLatestRateLimit(db, provider)` returns the most recent `rate_limits` row for the given provider, or `null` (with graceful try/catch if the table doesn't exist yet).

### OB-6-A: sse-endpoint-streams
verdict:  ✅ SATISFIED
reason:   `GET /api/logs/stream` in `src/server.ts` uses Hono's `streamSSE`, subscribes to `sseEmitter`, writes each record as `data: <JSON>`, and stays open until `stream.onAbort`. Pino logs reach the stream via the in-process `Writable → emitLogRecord` pipeline; audit events call `emitLogRecord` directly. Tests pass 4/4.

### OB-6-B: sse-level-filter
verdict:  ✅ SATISFIED
reason:   The `?level=` query param is converted to a pino level number; records below the threshold are skipped before writing to the SSE client.

### OB-6-C: multiple-concurrent-sse-clients
verdict:  ✅ SATISFIED
reason:   `SseEmitter extends EventEmitter` with `setMaxListeners(100)`; each connection adds an independent listener removed on abort. Tests pass 5/5.

### OB-6-D: reeboot-logs-follow-cli
verdict:  ✅ SATISFIED
reason:   `reeboot logs --follow` connects to `/api/logs/stream`, prints records in `${time} ${level} [${component}] ${msg}` format (human-readable, matching "pino-pretty style"), and exits cleanly on Ctrl-C/SIGTERM. Tests pass 3/3.

### OB-6-E: reeboot-logs-follow-fallback
verdict:  ✅ SATISFIED
reason:   On `ECONNREFUSED`, the command finds the most recent `.log` file in `~/.reeboot/logs/`, prints "Server not running — tailing log file: \<path\>", and tails the file via `tail -f`.

### OB-7-A: logs-tab-exists
verdict:  ✅ SATISFIED
reason:   `webchat/index.html` has a "Logs" tab button; `webchat/logs.js` creates `new EventSource('/api/logs/stream')` and appends records to `#logs-table` with auto-scroll to bottom.

### OB-7-B: webchat-level-filter
verdict:  ✅ SATISFIED
reason:   `renderRecord()` in `logs.js` checks `recordLevel < LEVEL_NUMBERS[levelFilter.value]` and returns early, matching the spec's "client-side filter on the already-received stream."

### OB-7-C: webchat-pause-resume
verdict:  ✅ SATISFIED
reason:   Pause sets `paused = true`; `onmessage` returns immediately, discarding records without buffering. SSE `eventSource` remains open. Resume sets `paused = false`; new records flow through `renderRecord` again.

### OB-7-D: error-fatal-badge
verdict:  ✅ SATISFIED
reason:   `renderRecord()` checks `recordLevel >= 50` and, when `logsTabBtn.classList.contains('active')` is false, increments `errorBadgeCount` and unhides `#logs-error-badge` on the Logs tab label — visible regardless of active tab.

### OB-7-E: badge-resets-on-focus
verdict:  ✅ SATISFIED
reason:   The tab-click handler for `data-tab="logs"` sets `errorBadgeCount = 0`, `badgeEl.hidden = true`, and `badgeEl.textContent = '0'`.

## Triage

✅ Safe to skip: OB-1-A, OB-1-B, OB-1-C, OB-1-D, OB-1-E, OB-2-A, OB-2-B, OB-2-C, OB-2-D, OB-2-E, OB-2-F, OB-3-A, OB-3-B, OB-3-C, OB-3-D, OB-4-A, OB-4-B, OB-4-C, OB-5-B, OB-5-C, OB-5-D, OB-5-E, OB-6-A, OB-6-B, OB-6-C, OB-6-D, OB-6-E, OB-7-A, OB-7-B, OB-7-C, OB-7-D, OB-7-E

⚠️  Worth a look:
- **OB-5-A** (rate-limit-headers-captured) — `rate_limits.provider` uses `event.provider ?? 'unknown'` not the config's `agent.model.provider`; scheduler queries with its own `_provider` which also defaults to `'unknown'` (no provider passed to `new Scheduler(...)` in server.ts). If pi sends a real provider name in the event, the scheduler's throttle lookup will miss all recorded rows.

---
