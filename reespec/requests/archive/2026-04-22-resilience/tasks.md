# Tasks: resilience

Implementation order follows dependency: config → DB → utilities → journal → recovery → catchup → outage.

---

### 1. Resilience config schema

- [x] **RED** — Write `tests/resilience-config.test.ts`: import `loadConfig`, call it with no file → assert `config.resilience.recovery.mode === 'safe_only'`, `config.resilience.outage_threshold === 3`, `config.resilience.scheduler.catchup_window === '1h'`; call it with a full resilience block → assert all values round-trip; call it with `mode: 'maybe'` → assert ZodError thrown. Run `npx vitest run tests/resilience-config.test.ts` → tests fail (no `resilience` key on Config).

- [x] **ACTION** — In `src/config.ts` add `ResilienceRecoverySchema`, `ResilienceSchedulerSchema`, `ResilienceSchema` Zod schemas (see design.md). Add `resilience: ResilienceSchema.default({})` to `ConfigSchema`. Export `ResilienceConfig` type.

- [x] **GREEN** — Run `npx vitest run tests/resilience-config.test.ts` → all tests pass.

---

### 2. DB migration — resilience tables

- [x] **RED** — Write `tests/resilience-migration.test.ts`: open an in-memory better-sqlite3 DB, call `runResilienceMigration(db)`, assert tables `turn_journal`, `turn_journal_steps`, and `outage_events` exist; assert `tasks` table has a `catchup` column (use `PRAGMA table_info`); call `runResilienceMigration(db)` a second time → no error (idempotent). Run `npx vitest run tests/resilience-migration.test.ts` → tests fail (function does not exist).

- [x] **ACTION** — In `src/db/schema.ts` add `runResilienceMigration(db)`: creates `turn_journal` (turn_id PK, context_id, session_path, prompt, started_at, status='open'), `turn_journal_steps` (id autoincrement, turn_id FK ON DELETE CASCADE, seq, tool_name, tool_input TEXT, tool_output TEXT, is_error INTEGER, fired_at), `outage_events` (id PK, provider, declared_at, resolved_at nullable, lost_jobs TEXT DEFAULT '[]', truncated INTEGER DEFAULT 0); ALTER TABLE tasks ADD COLUMN catchup TEXT if not present. All CREATE TABLE IF NOT EXISTS — safe to re-run.

- [x] **GREEN** — Run `npx vitest run tests/resilience-migration.test.ts` → all tests pass.

---

### 3. Broadcast notification utility

- [x] **RED** — Write `tests/broadcast.test.ts`: create two mock adapters (each with a `send` vi.fn()); call `broadcastToAllChannels(adapters, 'hello')` → assert both adapters' `send` was called with `'hello'`; make the first adapter throw → assert second adapter still receives the call; call with empty adapters map → assert no error thrown. Run `npx vitest run tests/broadcast.test.ts` → tests fail (module does not exist).

- [x] **ACTION** — Create `src/utils/broadcast.ts`: export `broadcastToAllChannels(adapters: Map<string, ChannelAdapter>, text: string): void`. Iterates adapters, calls `adapter.send('__system__', { type: 'text', text })` for each, wraps each call in try/catch and logs errors without rethrowing.

- [x] **GREEN** — Run `npx vitest run tests/broadcast.test.ts` → all tests pass.

---

### 4. Turn journal — open, append, delete

- [x] **RED** — Write `tests/turn-journal.test.ts`: open an in-memory DB, call `runResilienceMigration(db)`, create a `TurnJournal` instance; call `openTurn(turnId, contextId, prompt)` → assert row in `turn_journal` with `status='open'`; call `appendStep(turnId, { seq:1, toolName:'web_search', toolInput:'{}', toolOutput:'result', isError:false })` → assert row in `turn_journal_steps`; call `closeTurn(turnId)` → assert no rows in `turn_journal` or `turn_journal_steps` for that turn_id. Run `npx vitest run tests/turn-journal.test.ts` → tests fail.

- [x] **ACTION** — Create `src/resilience/turn-journal.ts`: export class `TurnJournal` with constructor `(db: Database)` and methods: `openTurn(turnId, contextId, prompt, sessionPath?)`, `appendStep(turnId, step: TurnJournalStep)`, `closeTurn(turnId)` (DELETE WHERE turn_id). Also export `getOpenJournals(db)` returning all `turn_journal` rows with `status='open'` joined with their steps.

- [x] **GREEN** — Run `npx vitest run tests/turn-journal.test.ts` → all tests pass.

---

### 5. Wire journal into orchestrator turn lifecycle

- [x] **RED** — Add to `tests/orchestrator.test.ts` (new describe block `'turn journal'`): create an in-memory DB with resilience migration applied, pass it to `Orchestrator`; dispatch a message → assert a `turn_journal` row is inserted during the turn; let the runner resolve → assert the row is deleted; dispatch a message with a runner that rejects → assert the `turn_journal` row remains open after the error. Run `npx vitest run tests/orchestrator.test.ts` → new tests fail.

- [x] **ACTION** — In `src/orchestrator.ts`: add optional `db` and `journal` (`TurnJournal`) constructor params. In `_runTurn`: call `journal.openTurn(turnId, contextId, msg.content, sessionPath)` before `runner.prompt`; in the `onEvent` handler for `tool_call_end`, call `journal.appendStep`; on successful resolution call `journal.closeTurn(turnId)`. On error/timeout leave the journal open. Construct `TurnJournal` from DB in `server.ts` and pass to `Orchestrator`.

- [x] **GREEN** — Run `npx vitest run tests/orchestrator.test.ts` → all tests pass.

---

### 6. Stale journal cleanup

- [x] **RED** — Write `tests/resilience-startup.test.ts` (first describe block `'stale cleanup'`): insert a `turn_journal` row with `started_at` = 25 hours ago; call `cleanStaleJournals(db)` → assert row is deleted and no recovery action taken; insert a row 23 hours ago → assert row is NOT deleted. Run `npx vitest run tests/resilience-startup.test.ts` → tests fail.

- [x] **ACTION** — In `src/resilience/startup.ts` export `cleanStaleJournals(db: Database): void`: DELETE FROM turn_journal WHERE status='open' AND started_at < datetime('now', '-24 hours'), log each deleted turn_id as a warning.

- [x] **GREEN** — Run `npx vitest run tests/resilience-startup.test.ts` (stale cleanup describe) → tests pass.

---

### 7. Crash recovery scan — policy application

- [x] **RED** — Add describe block `'crash recovery'` to `tests/resilience-startup.test.ts`: insert an open `turn_journal` row with no steps (safe turn); call `recoverCrashedTurns(db, config_safe_only, adapters, requeueFn)` → assert `requeueFn` was called with the prompt, assert adapters received a broadcast; insert a row with a step whose `tool_name` is in `side_effect_tools`; call with `safe_only` → assert `requeueFn` NOT called, adapters broadcast; call with `mode='always'` and side-effect step → assert `requeueFn` called; call with `mode='never'` and safe step → assert `requeueFn` NOT called. Run tests → fail.

- [x] **ACTION** — In `src/resilience/startup.ts` export `recoverCrashedTurns(db, config, adapters, requeueFn)`: calls `cleanStaleJournals`, loads open journals via `getOpenJournals(db)`, classifies each as safe/unsafe (checks step tool_names against `config.resilience.recovery.side_effect_tools`), applies policy, calls `requeueFn(contextId, prompt)` or broadcasts "I was interrupted" message accordingly, deletes journal row after handling.

- [x] **GREEN** — Run `npx vitest run tests/resilience-startup.test.ts` → all tests pass.

---

### 8. Scheduled task catchup

- [x] **RED** — Write `tests/resilience-catchup.test.ts`: open in-memory DB, run scheduler migration, insert tasks in various states (missed 30m ago no override, missed 3h ago no override, missed 48h ago catchup='always', missed 5m ago catchup='never', missed 90m ago catchup='2h'); call `applyScheduledCatchup(db, config_1h_window)` → assert: 30m task has `next_run` ≤ now; 3h task has `next_run` > now (advanced); 48h always task has `next_run` ≤ now; never task has `next_run` > now; 90m custom-2h task has `next_run` ≤ now. Run `npx vitest run tests/resilience-catchup.test.ts` → tests fail.

- [x] **ACTION** — In `src/resilience/startup.ts` export `applyScheduledCatchup(db, config)`: query tasks WHERE status='active' AND next_run < now; for each, resolve catchup window from task.catchup column or global config; compare missed duration; if within window set next_run = now; else advance next_run to next natural occurrence via `computeNextRun`. Single UPDATE per task.

- [x] **GREEN** — Run `npx vitest run tests/resilience-catchup.test.ts` → all tests pass.

---

### 9. Outage detection — consecutive failure counter

- [x] **RED** — Add describe block `'outage detection'` to `tests/orchestrator.test.ts`: create orchestrator with `resilience.outage_threshold=3` and in-memory DB; dispatch 2 messages with a provider-error-throwing runner → assert no `outage_events` row, no broadcast; dispatch a 3rd → assert `outage_events` row inserted with `resolved_at=NULL`, broadcast sent, probe task created in tasks table; dispatch a successful message → assert failure counter resets (4th provider failure after success should not trigger outage without reaching threshold again). Run tests → fail.

- [x] **ACTION** — In `src/orchestrator.ts`: add `_consecutiveFailures: Map<string, number>` and `_activeOutage: boolean`. In `_runTurn` error path: check if error is provider-related (status 4xx/5xx or network timeout after all retries exhausted); if yes increment counter; if counter >= threshold and no active outage, call `_declareOutage(contextId, db)`. On success reset counter. `_declareOutage`: INSERT outage_events, call `broadcastToAllChannels`, INSERT probe task into tasks table with context_id='__outage_probe__', schedule=probe_interval from config. Also added `_recordLostJob` to append failed turns to `outage_events.lost_jobs` with a 20-entry cap and truncation flag.

- [x] **GREEN** — Run `npx vitest run tests/orchestrator.test.ts` → all tests pass.

---

### 10. Self-healing probe and outage resolution

- [x] **RED** — Write `tests/outage-probe.test.ts`: mock `fetch`; create orchestrator with active outage_events row and probe task; call `handleScheduledTask({ taskId, contextId: '__outage_probe__', prompt: '' })` with fetch returning 500 → assert outage_events.resolved_at still null, probe task still exists; call twice with fetch returning 200 → assert outage_events.resolved_at is set, probe task deleted from tasks, broadcast sent with lost_jobs content. Also test: outage with 3 lost_jobs → broadcast message contains all 3 prompts; outage with truncated=1 → broadcast mentions truncation. Run `npx vitest run tests/outage-probe.test.ts` → tests fail.

- [x] **ACTION** — In `src/orchestrator.ts` add `_probeSuccessCount: number`. In `handleScheduledTask`: if `task.contextId === '__outage_probe__'`, call `_runOutageProbe()` and return. `_runOutageProbe`: HTTP GET to provider base URL; on success increment `_probeSuccessCount`; if >= 2 call `_resolveOutage()`; on failure reset `_probeSuccessCount` and advance probe task `next_run`. `_resolveOutage`: UPDATE outage_events SET resolved_at=now, DELETE probe task, load lost_jobs, broadcast recovery message, reset `_activeOutage` and `_consecutiveFailures`.

- [x] **GREEN** — Run `npx vitest run tests/outage-probe.test.ts` → all tests pass.

---

### 11. Wire startup recovery into server.ts

- [x] **RED** — Add to `tests/server.test.ts` (or new `tests/resilience-integration.test.ts`): start a test server with an in-memory DB that has one open `turn_journal` row and one overdue task within the catchup window; capture adapter broadcasts and requeue calls; assert that after `startServer()`: the open journal was processed (broadcast sent OR requeue called per policy), the overdue task's `next_run` ≤ now, `runResilienceMigration` tables exist. Run `npx vitest run tests/resilience-integration.test.ts` → tests fail.

- [x] **ACTION** — In `src/server.ts`, after DB init and before `scheduler.start()`: call `runResilienceMigration(db)`, then `notifyRestart(db, adapters)` (unconditional restart notification), then `recoverCrashedTurns(db, config, adapters, requeueFn)`, then `applyScheduledCatchup(db, config)`. Pass `db` and `TurnJournal` instance to `Orchestrator` constructor. Wire `getResumedSessionPath` into runner creation for session continuity. Added `getSessionPath()` to `AgentRunner` interface and pi-runner to expose active session file path.

- [x] **GREEN** — Run `npx vitest run tests/resilience-integration.test.ts` → all tests pass. Run full suite `npx vitest run` → no regressions.

---

### 12. Crash-recovery gap tests — empty journal and multi-journal

_Evaluation finding: crash-recovery spec scenarios "No unclosed journals → startup proceeds normally" and "Multiple unclosed journals — each handled independently" had no test coverage._

- [x] **RED** — Add to `tests/resilience-startup.test.ts` (crash recovery describe): one test calls `recoverCrashedTurns` with an empty `turn_journal` → assert `requeueFn` not called and no broadcast sent; one test inserts two open journal rows for different context IDs, calls `recoverCrashedTurns` with `mode='safe_only'` and no steps → assert `requeueFn` called twice (once per context) and broadcast sent twice.

- [x] **ACTION** — No source change needed; implementation already handles both cases correctly.

- [x] **GREEN** — Run `npx vitest run tests/resilience-startup.test.ts` → 12/12 tests pass.

---

### 13. Stale-cleanup warning log

_Evaluation finding: spec says "a warning is logged" when a stale journal is discarded; no test asserts this._

- [x] **RED** — Added console.warn spy test to `tests/resilience-startup.test.ts`; confirmed existing source already emits warn.

- [x] **ACTION** — No source change needed.

- [x] **GREEN** — Run `npx vitest run tests/resilience-startup.test.ts` → 13/13 tests pass.

---

### 14. Outage-detection — non-provider error does not increment counter

_Evaluation finding: spec scenario "Non-provider errors do not count toward outage threshold" has no test._

- [x] **RED** — Added non-provider-error test to `tests/orchestrator.test.ts`; `isProviderError` guard confirmed correct.

- [x] **ACTION** — No source change needed.

- [x] **GREEN** — Run `npx vitest run tests/orchestrator.test.ts` → 16/16 tests pass.

---

### 15. Outage-recovery gap tests — truncation message, runner not called, no probe when no outage

_Evaluation finding: three outage-recovery spec scenarios lacked test coverage._

- [x] **RED** — Added 3 tests to `tests/outage-probe.test.ts`: truncation-in-broadcast, runner-not-called, no-probe-when-no-outage. All verified against existing implementation.

- [x] **ACTION** — No source change needed; implementation already correct for all three.

- [x] **GREEN** — Run `npx vitest run tests/outage-probe.test.ts` → 8/8 tests pass.

---

### 16. Surface unanswered user messages on restart

_Evaluation finding: brief Layer 1 goal "Inspect the last session on restart and surface any apparent incomplete work (user message with no assistant response)" had no implementation._

- [x] **RED** — Write `tests/resilience-unanswered.test.ts`: 6 scenarios covering `scanSessionForUnansweredMessage` — returns user text when last message entry is user, returns null when last is assistant, returns null for empty session, returns null for missing file, ignores non-message trailing entries, handles multi-part user content. Run `npx vitest run tests/resilience-unanswered.test.ts` → 6 tests fail (function not exported).

- [x] **ACTION** — In `src/resilience/startup.ts`: add `import { readFileSync, existsSync } from 'fs'`; export `scanSessionForUnansweredMessage(sessionPath: string): string | null` — reads JSONL file, walks lines in reverse to find the last `type='message'` entry, returns concatenated text blocks if `role='user'`, null otherwise. In `src/server.ts`: import `scanSessionForUnansweredMessage` from startup.ts and `broadcastToAllChannels` from utils/broadcast.ts; after computing `sessionPath` per-context, scan it and broadcast "⚠️ It looks like I may not have responded to your last message…" if unanswered message found.

- [x] **GREEN** — Run `npx vitest run tests/resilience-unanswered.test.ts` → 6/6 pass. Run `npx vitest run` → 84 test files, 744 tests pass, 0 failures.

---

### 17. Fix server.ts crash-recovery wiring — post-channel notifications and real requeueFn

_Evaluation finding (2026-04-22 22:27): two production wiring gaps in server.ts: (1) requeueFn was a no-op; (2) notifyRestart and recoverCrashedTurns broadcast to the empty pre-init adapters Map, not the populated one — all crash-recovery and restart notifications silently dropped at runtime._

- [x] **RED** — Write `tests/resilience-wiring.test.ts`: 3 tests using mock channel adapter via `registerChannel`:
  (1) restart notification reaches adapter after server start with previous-run DB marker;
  (2) crash-recovery notification reaches adapter with open safe journal;
  (3) requeueFn code path reached (mock adapter receives "re-running" broadcast with mode=always).
  All 3 fail — notifications go to the empty initial Map.

- [x] **ACTION** — In `src/server.ts`:
  (a) Slim the early resilience block to DB-only: `runResilienceMigration` + `applyScheduledCatchup` only — remove `notifyRestart` and `recoverCrashedTurns`.
  (b) Inside `if (appConfig)`, add import for `scanSessionForUnansweredMessage` before the contexts loop.
  (c) After `_orchestrator.start()`, add a deferred resilience block: import `notifyRestart` + `recoverCrashedTurns`, call `notifyRestart(db, _channelAdapters)`, then call `recoverCrashedTurns(db, appConfig, _channelAdapters, requeueFn)` where `requeueFn` calls `bus.publish(createIncomingMessage({ channelType: 'recovery', peerId: contextId, content: prompt, raw: null }))`.
  (d) Update `tests/resilience-integration.test.ts` — the journal-cleanup test now requires a minimal config (so the deferred phase runs) and a registered no-op channel adapter.

- [x] **GREEN** — Run `npx vitest run tests/resilience-wiring.test.ts` → 3/3 pass. Run `npx vitest run` → 85 test files, 747 tests pass, 0 failures.
