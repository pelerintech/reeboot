# Tasks: Token Budget & Overspend Protection

Execution order follows dependency flow:
schema → tracking → global guard → agentic tools → introspection → settings UI → roadmap

**Depends on**: `observability-system` must be executed first (audit event stream, emitEvent).

---

### 1. Budget config schema

- [x] **RED** — Write `tests/budget/budget-config.test.ts`: import `ConfigSchema` from `@src/config.ts` and parse `{ budget: { daily_cost_usd: 5.0, warn_threshold: 0.9 } }` → assert parsed value has `daily_cost_usd = 5.0` and `warn_threshold = 0.9`. Parse `{}` → assert all budget fields default to `null` except `warn_threshold` which defaults to `0.8`. Run `npx vitest run tests/budget/budget-config.test.ts` → fails (no budget schema yet).
- [x] **ACTION** — Add `BudgetConfigSchema` to `src/config.ts`: `z.object({ daily_tokens: z.number().int().nullable().default(null), daily_cost_usd: z.number().nullable().default(null), session_tokens: z.number().int().nullable().default(null), session_cost_usd: z.number().nullable().default(null), turn_tokens: z.number().int().nullable().default(null), turn_cost_usd: z.number().nullable().default(null), warn_threshold: z.number().default(0.8) })`. Add `budget: BudgetConfigSchema.default({})` to `ConfigSchema`.
- [x] **GREEN** — Run `npx vitest run tests/budget/budget-config.test.ts tests/config.test.ts` → all pass.

---

### 2. Usage table migration (cost_usd + operation_type)

- [x] **RED** — Write `tests/budget/budget-schema.test.ts`: create an in-memory DB, call `runBudgetMigration(db)` (does not exist yet) → import fails. Run `npx vitest run tests/budget/budget-schema.test.ts` → fails.
- [x] **ACTION** — Add `runBudgetMigration(db)` to `src/db/schema.ts`: add `cost_usd REAL NOT NULL DEFAULT 0` and `operation_type TEXT NOT NULL DEFAULT 'user_message'` to the `usage` table via `ALTER TABLE ADD COLUMN IF NOT EXISTS` pattern. Wire the call into `openDatabase()` after existing migrations.
- [x] **GREEN** — Run `npx vitest run tests/budget/budget-schema.test.ts` → migration runs, columns exist, idempotent (safe to call twice).

---

### 3. Token-meter persists cost and operation_type

- [x] **RED** — Write `tests/budget/token-meter-cost.test.ts`: mock a pi `agent_end` event where `messages[last].usage.cost.total = 0.042`, trigger the token-meter handler, query the `usage` table → assert `cost_usd = 0.042`. Assert `operation_type = 'user_message'` when no meta file exists, and `operation_type = 'scheduler'` when `.reeboot_turn_meta.json` has `operationType: 'scheduler'`. Run `npx vitest run tests/budget/token-meter-cost.test.ts` → fails (token-meter doesn't read cost or meta file).
- [x] **ACTION** — Update `src/extensions/token-meter.ts`: (1) read `usage.cost.total` from the last assistant message and persist as `cost_usd`; (2) read `operationType` from `.reeboot_turn_meta.json` in `ctx.cwd` (default `'user_message'` if absent); (3) include both new columns in the `INSERT INTO usage` statement. Update the prepared statement to include `cost_usd` and `operation_type`.
- [x] **GREEN** — Run `npx vitest run tests/budget/token-meter-cost.test.ts` → all assertions pass. Run `npx vitest run tests/extensions/` → existing extension tests pass.

---

### 4. Orchestrator writes turn meta before dispatch

- [x] **RED** — Write `tests/budget/turn-meta.test.ts`: mock an orchestrator dispatch for a message with `channelType = 'scheduler'`, check the context workspace for `.reeboot_turn_meta.json` → assert file does not exist before dispatch, assert it exists with `operationType = 'scheduler'` after dispatch begins. Run `npx vitest run tests/budget/turn-meta.test.ts` → fails (orchestrator doesn't write meta).
- [x] **ACTION** — In `src/orchestrator.ts _runTurn()`, before calling `runner.prompt()`, write `.reeboot_turn_meta.json` to the runner's workspace path with `{ operationType, turnId }`. Map `channelType` to `operationType`: `scheduler→scheduler`, `heartbeat→heartbeat`, `recovery→recovery`, `memory→memory`, all others→`user_message`. Read workspace path from runner context.
- [x] **GREEN** — Run `npx vitest run tests/budget/turn-meta.test.ts tests/orchestrator.test.ts` → all pass.

---

### 5. BudgetGuard — global limit pre-dispatch check

- [x] **RED** — Write `tests/budget/budget-guard.test.ts`: import `BudgetGuard` from `@src/budget/guard.ts` (does not exist) → fails. Run `npx vitest run tests/budget/budget-guard.test.ts` → test fails.
- [x] **ACTION** — Create `src/budget/guard.ts`: export `BudgetGuard` class with `check(db, contextId, config): BudgetCheckResult`. Implements: (a) null limits → `{ ok: true }` immediately; (b) daily token/cost query via `SUM(input_tokens + output_tokens)` and `SUM(cost_usd)` WHERE `created_at >= date('now', 'start of day')`; (c) session query using last session boundary; (d) turn check using most recent row; (e) warn threshold check. Track last-warned threshold in an in-memory Set to avoid repeated warn events.
- [x] **GREEN** — Run `npx vitest run tests/budget/budget-guard.test.ts` → all TB-2 scenarios pass (no limits, daily block, daily warn, session block, turn block).

---

### 6. Wire BudgetGuard into orchestrator

- [x] **RED** — Write `tests/budget/budget-guard-wiring.test.ts`: configure orchestrator with `budget.daily_tokens = 100`, insert a `usage` row with 200 tokens today, send a message → assert orchestrator replies with a budget-exceeded message instead of dispatching to the runner. Run `npx vitest run tests/budget/budget-guard-wiring.test.ts` → fails (no guard in orchestrator).
- [x] **ACTION** — In `src/orchestrator.ts _runTurn()`, call `BudgetGuard.check(db, contextId, config)` after the disk space check and before `runner.prompt()`. If `ok = false`: call `_reply(msg, reason)` and return. If `warning`: emit a `budget_warning` event via `emitEvent()`, broadcast warning to all channels via `broadcastToAllChannels()`. Pass full config to orchestrator constructor and store as `_config`.
- [x] **GREEN** — Run `npx vitest run tests/budget/budget-guard-wiring.test.ts tests/orchestrator.test.ts` → all pass.

---

### 7. Budget-manager extension — set_budget and check_budget tools

- [x] **RED** — Write `tests/budget/budget-manager.test.ts`: load the `budget-manager` extension in a mock pi context, call `set_budget({ amount: 5, unit: 'usd' })` tool → assert confirmation returned and `.task_budget.json` written to workspace. Call `check_budget()` → assert structured result with `{ spent: 0, budget: 5, remaining: 5, percentUsed: 0 }`. Run `npx vitest run tests/budget/budget-manager.test.ts` → fails (extension does not exist).
- [x] **ACTION** — Create `src/extensions/budget-manager.ts`: register `set_budget(amount, unit)` tool — stores budget in closure, writes `.task_budget.json`. Register `check_budget()` tool — reads closure state, queries current accumulated cost, returns structured result including global limits from config. Wire into the extension loader (always-on). Pass config and db as constructor args.
- [x] **GREEN** — Run `npx vitest run tests/budget/budget-manager.test.ts` → all assertions pass.

---

### 8. Per-task budget enforcement via turn_end accumulation

- [x] **RED** — Write `tests/budget/task-budget-enforcement.test.ts`: set a $1.00 task budget via the extension, simulate three `turn_end` events each costing $0.40 → assert that after the third event (total $1.20), the next `turn_start` receives an injected wrap-up instruction. Assert the budget is cleared after `agent_end`. Run `npx vitest run tests/budget/task-budget-enforcement.test.ts` → fails (turn_end handler not implemented).
- [x] **ACTION** — In `src/extensions/budget-manager.ts`: register `pi.on('turn_end', ...)` — accumulate `event.message.usage.cost.total` against the active task budget. When accumulated ≥ budget: set `_exhausted = true`, emit `budget_exhausted` audit event. Register `pi.on('turn_start', ...)` — if `_exhausted`, inject the wrap-up instruction string into the context. Register `pi.on('agent_end', ...)` — clear closure state and delete `.task_budget.json`.
- [x] **GREEN** — Run `npx vitest run tests/budget/task-budget-enforcement.test.ts` → all scenarios pass including partial-delivery injection and budget clearance on agent_end.

---

### 9. budget_status() tool

- [x] **RED** — Write `tests/budget/budget-status.test.ts`: load the `budget-manager` extension, seed `usage` table with rows for today (operation_type: 'memory', cost_usd: 0.12) and this week. Call `budget_status({ period: 'today' })` → assert result contains today's total. Call `budget_status({ operationType: 'memory', period: 'last' })` → assert result mentions $0.12. Call with a model that has cost_usd = 0 → assert result says "cost unavailable". Run `npx vitest run tests/budget/budget-status.test.ts` → fails (tool not registered).
- [x] **ACTION** — Add `budget_status({ period, operationType })` tool to `src/extensions/budget-manager.ts`. Implements: `period = 'today'` → aggregate today's usage; `period = 'last'` + `operationType` → most recent row matching type; formats as human-readable string with USD + tokens. Detects zero-cost model from all rows having `cost_usd = 0`. Includes global limit context if configured.
- [x] **GREEN** — Run `npx vitest run tests/budget/budget-status.test.ts` → all TB-4 scenarios pass.

---

### 10. Budget settings REST endpoint

- [x] **RED** — Write `tests/budget/settings-api.test.ts`: start the test server with a budget config, call `GET /api/settings/budget` → assert response contains `limits` and `spend` objects with correct structure. Call `PUT /api/settings/budget` with `{ daily_cost_usd: 15.0 }` → assert `config.json` is updated and the next `GET` returns the new value. Run `npx vitest run tests/budget/settings-api.test.ts` → fails (endpoint does not exist).
- [x] **ACTION** — Add `app.get('/api/settings/budget', ...)` and `app.put('/api/settings/budget', ...)` to `src/server.ts`. GET: return current `config.budget` merged with today's spend aggregates from `usage`. PUT: merge partial budget config into `config.json` via `saveConfig()`, reload the in-memory config reference. No server restart needed for limit changes.
- [x] **GREEN** — Run `npx vitest run tests/budget/settings-api.test.ts tests/server.test.ts` → all pass.

---

### 11. Settings tab in webchat

- [x] **RED** — Check: `webchat/index.html` does not contain a "Settings" tab element and `webchat/settings.js` does not exist. Assert both conditions. Run check → assertion passes (neither exists).
- [x] **ACTION** — Add a "Settings" tab to `webchat/index.html` alongside the existing Logs tab. Within the Settings tab, add a "Budget" section with: input fields for daily/session/turn limits (tokens and USD), warn threshold slider, current spend vs limit progress bars (loaded via `GET /api/settings/budget` on tab focus), Save button (`PUT /api/settings/budget`). Create `webchat/settings.js` with the fetch/render/save logic.
- [x] **GREEN** — Verify: `webchat/index.html` contains the Settings tab. `webchat/settings.js` exists and is referenced. Manually load the webchat, click Settings → Budget section is visible, inputs are pre-filled with current config, Save updates config without restart.

---

### 12. Roadmap update

- [x] **RED** — Check: `agent-roadmap.md` shows "Token budget & overspend protection" as `🔄 in progress [token-budget]` (set during planning). `decisions.md` does not yet contain the 4 token-budget decisions.
- [x] **ACTION** — Add to `reespec/decisions.md`: (1) operation_type via workspace meta file pattern; (2) per-task budget is extension-scoped, not orchestrator-scoped; (3) pi's ModelRegistry is the authoritative pricing source — no custom table; (4) budget_status vs check_budget distinction.
- [x] **GREEN** — Verify: `agent-roadmap.md` contains `🔄 in progress [token-budget]`. `decisions.md` contains the 4 new decisions.

---

## Gap fixes (post-evaluation 2026-05-07)

### G1. Wire budget-manager into extension loader

- [x] **RED** — `grep budget-manager src/extensions/loader.ts` → 0 results
- [x] **ACTION** — Added `budget-manager` always-on factory to `getBundledFactories()` in `loader.ts`; uses `makeBudgetManagerExtension(pi, { workspacePath: process.cwd(), config })`.
- [x] **GREEN** — `tests/budget/loader-wiring.test.ts` passes; set_budget/check_budget/budget_status registered by loader.

### G2. Fix TB-3-D: use before_agent_start for wrap-up injection

- [x] **RED** — Updated `task-budget-enforcement.test.ts` to assert `before_agent_start` handler exists and returns `{ systemPrompt }` containing the wrap-up instruction; test failed (only `turn_start` registered).
- [x] **ACTION** — Replaced `pi.on('turn_start', ...)` with `pi.on('before_agent_start', ...)` in `budget-manager.ts`; returns `{ systemPrompt: existingPrompt + instruction }` using pi's correct API.
- [x] **GREEN** — All 3 task-budget-enforcement tests pass.

### G3. Fix TB-2-D: notify owner via channel on budget warning

- [x] **RED** — `tests/budget/budget-warning-notification.test.ts` fails; adapter.send not called with warning text.
- [x] **ACTION** — Added `this._reply(msg, \`⚠️ Budget warning: ${budgetResult.warning}\`)` in the warning branch of `orchestrator.ts _runTurn()`.
- [x] **GREEN** — Warning notification test passes; orchestrator tests unaffected.

### G4. Fix TB-3-C: check_budget shows actual spend in global section

- [x] **RED** — `tests/budget/check-budget-global.test.ts` fails; `_buildGlobalSection` returns limits only, no spend data.
- [x] **ACTION** — Made `_buildGlobalSection` async; queries `usage` table for today's spend via dynamic import; returns "Daily global: $X.XX of $Y.YY (Z% used)".
- [x] **GREEN** — Both check-budget-global tests pass; budget-manager tests unaffected.

### G5. Fix TB-2-B: daily limit scoped to context_id

- [x] **RED** — `tests/budget/budget-guard-context-scope.test.ts` fails; ctx2's tokens incorrectly block ctx1.
- [x] **ACTION** — Added `context_id = ?` to both daily token and daily cost queries in `src/budget/guard.ts`.
- [x] **GREEN** — All 3 context-scope tests pass; existing guard tests unaffected.

### G6. Fix TB-5-B: add progress bar to settings UI

- [x] **RED** — `grep progress webchat/index.html webchat/settings.js` → 0 results.
- [x] **ACTION** — Added `<progress id="budget-progress-bar">` element with label to `index.html`; updated `settings.js` to populate value/max/label from GET response.
- [x] **GREEN** — progress element present in both files.

### G7. Fix TB-5-C: orchestrator config updated live on PUT

- [x] **RED** — `tests/budget/settings-live-update.test.ts` fails; `Orchestrator.prototype.updateBudgetConfig` is undefined.
- [x] **ACTION** — Added `updateBudgetConfig(budget)` method to `Orchestrator` class; PUT handler in `server.ts` calls `_orchestrator.updateBudgetConfig(body)` after saving to disk.
- [x] **GREEN** — Live update test passes; settings-api tests unaffected.

---

## Gap fixes (post-evaluation 2026-05-08)

### G8. Feasibility check guidance in set_budget

- [x] **RED** — Write `tests/budget/feasibility-check.test.ts`: assert `set_budget` tool description contains 'feasib' keyword AND return value includes feasibility reminder. Run `npx vitest run tests/budget/feasibility-check.test.ts` → 3 tests fail (description and return message have no feasibility language).
- [x] **ACTION** — Updated `src/extensions/budget-manager.ts`: extended `set_budget` tool description with explicit IMPORTANT instruction telling the agent to assess feasibility immediately after setting the budget and warn the owner if insufficient; updated return message to include "Before proceeding, assess whether this budget is sufficient and realistic…".
- [x] **GREEN** — Run `npx vitest run tests/budget/feasibility-check.test.ts tests/budget/budget-manager.test.ts` → all 7 tests pass.

### G9. Settings UI: add session_tokens and turn_tokens fields

- [x] **RED** — `grep -c "session_tokens\|turn_tokens" webchat/index.html webchat/settings.js` → 0 results in both files.
- [x] **ACTION** — Added `<input id="budget-session-tokens">` and `<input id="budget-turn-tokens">` fields to the Budget section in `webchat/index.html`; updated `webchat/settings.js` to declare `sessionTokensEl` and `turnTokensEl` DOM refs, populate them from GET response, and include `session_tokens`/`turn_tokens` in PUT payload with null-on-empty handling.
- [x] **GREEN** — `grep -n "session-tokens\|turn-tokens" webchat/index.html webchat/settings.js` → 2 lines in index.html (input elements), 4 lines in settings.js (ref, load, save×2).

### G10. Session spend scoped to server start time

- [x] **RED** — Write `tests/budget/session-spend-scope.test.ts`: insert a usage row 1 hour before server module load (today's date, so it appears in today spend), start server, GET /api/settings/budget → assert `session_cost_usd = 0` and `session_tokens = 0` (pre-start row excluded). Run → 2 tests fail (session values equal today values).
- [x] **ACTION** — Updated `GET /api/settings/budget` handler in `src/server.ts`: added `sessionStartTs` derived from module-level `startTime` (`new Date(startTime).toISOString().replace('T', ' ').slice(0, 19)`); added a separate SQL query `WHERE created_at >= ?` bound to `sessionStartTs` for `session_cost_usd` and `session_tokens`; today query unchanged.
- [x] **GREEN** — Run `npx vitest run tests/budget/session-spend-scope.test.ts tests/budget/settings-api.test.ts` → all 4 tests pass. Full budget suite: 17 files, 46 tests pass.
