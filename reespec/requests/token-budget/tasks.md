# Tasks: Token Budget & Overspend Protection

Execution order follows dependency flow:
schema → tracking → global guard → agentic tools → introspection → settings UI → roadmap

**Depends on**: `observability-system` must be executed first (audit event stream, emitEvent).

---

### 1. Budget config schema

- [ ] **RED** — Write `tests/budget/budget-config.test.ts`: import `ConfigSchema` from `@src/config.ts` and parse `{ budget: { daily_cost_usd: 5.0, warn_threshold: 0.9 } }` → assert parsed value has `daily_cost_usd = 5.0` and `warn_threshold = 0.9`. Parse `{}` → assert all budget fields default to `null` except `warn_threshold` which defaults to `0.8`. Run `npx vitest run tests/budget/budget-config.test.ts` → fails (no budget schema yet).
- [ ] **ACTION** — Add `BudgetConfigSchema` to `src/config.ts`: `z.object({ daily_tokens: z.number().int().nullable().default(null), daily_cost_usd: z.number().nullable().default(null), session_tokens: z.number().int().nullable().default(null), session_cost_usd: z.number().nullable().default(null), turn_tokens: z.number().int().nullable().default(null), turn_cost_usd: z.number().nullable().default(null), warn_threshold: z.number().default(0.8) })`. Add `budget: BudgetConfigSchema.default({})` to `ConfigSchema`.
- [ ] **GREEN** — Run `npx vitest run tests/budget/budget-config.test.ts tests/config.test.ts` → all pass.

---

### 2. Usage table migration (cost_usd + operation_type)

- [ ] **RED** — Write `tests/budget/budget-schema.test.ts`: create an in-memory DB, call `runBudgetMigration(db)` (does not exist yet) → import fails. Run `npx vitest run tests/budget/budget-schema.test.ts` → fails.
- [ ] **ACTION** — Add `runBudgetMigration(db)` to `src/db/schema.ts`: add `cost_usd REAL NOT NULL DEFAULT 0` and `operation_type TEXT NOT NULL DEFAULT 'user_message'` to the `usage` table via `ALTER TABLE ADD COLUMN IF NOT EXISTS` pattern. Wire the call into `openDatabase()` after existing migrations.
- [ ] **GREEN** — Run `npx vitest run tests/budget/budget-schema.test.ts` → migration runs, columns exist, idempotent (safe to call twice).

---

### 3. Token-meter persists cost and operation_type

- [ ] **RED** — Write `tests/budget/token-meter-cost.test.ts`: mock a pi `agent_end` event where `messages[last].usage.cost.total = 0.042`, trigger the token-meter handler, query the `usage` table → assert `cost_usd = 0.042`. Assert `operation_type = 'user_message'` when no meta file exists, and `operation_type = 'scheduler'` when `.reeboot_turn_meta.json` has `operationType: 'scheduler'`. Run `npx vitest run tests/budget/token-meter-cost.test.ts` → fails (token-meter doesn't read cost or meta file).
- [ ] **ACTION** — Update `src/extensions/token-meter.ts`: (1) read `usage.cost.total` from the last assistant message and persist as `cost_usd`; (2) read `operationType` from `.reeboot_turn_meta.json` in `ctx.cwd` (default `'user_message'` if absent); (3) include both new columns in the `INSERT INTO usage` statement. Update the prepared statement to include `cost_usd` and `operation_type`.
- [ ] **GREEN** — Run `npx vitest run tests/budget/token-meter-cost.test.ts` → all assertions pass. Run `npx vitest run tests/extensions/` → existing extension tests pass.

---

### 4. Orchestrator writes turn meta before dispatch

- [ ] **RED** — Write `tests/budget/turn-meta.test.ts`: mock an orchestrator dispatch for a message with `channelType = 'scheduler'`, check the context workspace for `.reeboot_turn_meta.json` → assert file does not exist before dispatch, assert it exists with `operationType = 'scheduler'` after dispatch begins. Run `npx vitest run tests/budget/turn-meta.test.ts` → fails (orchestrator doesn't write meta).
- [ ] **ACTION** — In `src/orchestrator.ts _runTurn()`, before calling `runner.prompt()`, write `.reeboot_turn_meta.json` to the runner's workspace path with `{ operationType, turnId }`. Map `channelType` to `operationType`: `scheduler→scheduler`, `heartbeat→heartbeat`, `recovery→recovery`, `memory→memory`, all others→`user_message`. Read workspace path from runner context.
- [ ] **GREEN** — Run `npx vitest run tests/budget/turn-meta.test.ts tests/orchestrator.test.ts` → all pass.

---

### 5. BudgetGuard — global limit pre-dispatch check

- [ ] **RED** — Write `tests/budget/budget-guard.test.ts`: import `BudgetGuard` from `@src/budget/guard.ts` (does not exist) → fails. Run `npx vitest run tests/budget/budget-guard.test.ts` → test fails.
- [ ] **ACTION** — Create `src/budget/guard.ts`: export `BudgetGuard` class with `check(db, contextId, config): BudgetCheckResult`. Implements: (a) null limits → `{ ok: true }` immediately; (b) daily token/cost query via `SUM(input_tokens + output_tokens)` and `SUM(cost_usd)` WHERE `created_at >= date('now', 'start of day')`; (c) session query using last session boundary; (d) turn check using most recent row; (e) warn threshold check. Track last-warned threshold in an in-memory Set to avoid repeated warn events.
- [ ] **GREEN** — Run `npx vitest run tests/budget/budget-guard.test.ts` → all TB-2 scenarios pass (no limits, daily block, daily warn, session block, turn block).

---

### 6. Wire BudgetGuard into orchestrator

- [ ] **RED** — Write `tests/budget/budget-guard-wiring.test.ts`: configure orchestrator with `budget.daily_tokens = 100`, insert a `usage` row with 200 tokens today, send a message → assert orchestrator replies with a budget-exceeded message instead of dispatching to the runner. Run `npx vitest run tests/budget/budget-guard-wiring.test.ts` → fails (no guard in orchestrator).
- [ ] **ACTION** — In `src/orchestrator.ts _runTurn()`, call `BudgetGuard.check(db, contextId, config)` after the disk space check and before `runner.prompt()`. If `ok = false`: call `_reply(msg, reason)` and return. If `warning`: emit a `budget_warning` event via `emitEvent()`, broadcast warning to all channels via `broadcastToAllChannels()`. Pass full config to orchestrator constructor and store as `_config`.
- [ ] **GREEN** — Run `npx vitest run tests/budget/budget-guard-wiring.test.ts tests/orchestrator.test.ts` → all pass.

---

### 7. Budget-manager extension — set_budget and check_budget tools

- [ ] **RED** — Write `tests/budget/budget-manager.test.ts`: load the `budget-manager` extension in a mock pi context, call `set_budget({ amount: 5, unit: 'usd' })` tool → assert confirmation returned and `.task_budget.json` written to workspace. Call `check_budget()` → assert structured result with `{ spent: 0, budget: 5, remaining: 5, percentUsed: 0 }`. Run `npx vitest run tests/budget/budget-manager.test.ts` → fails (extension does not exist).
- [ ] **ACTION** — Create `src/extensions/budget-manager.ts`: register `set_budget(amount, unit)` tool — stores budget in closure, writes `.task_budget.json`. Register `check_budget()` tool — reads closure state, queries current accumulated cost, returns structured result including global limits from config. Wire into the extension loader (always-on). Pass config and db as constructor args.
- [ ] **GREEN** — Run `npx vitest run tests/budget/budget-manager.test.ts` → all assertions pass.

---

### 8. Per-task budget enforcement via turn_end accumulation

- [ ] **RED** — Write `tests/budget/task-budget-enforcement.test.ts`: set a $1.00 task budget via the extension, simulate three `turn_end` events each costing $0.40 → assert that after the third event (total $1.20), the next `turn_start` receives an injected wrap-up instruction. Assert the budget is cleared after `agent_end`. Run `npx vitest run tests/budget/task-budget-enforcement.test.ts` → fails (turn_end handler not implemented).
- [ ] **ACTION** — In `src/extensions/budget-manager.ts`: register `pi.on('turn_end', ...)` — accumulate `event.message.usage.cost.total` against the active task budget. When accumulated ≥ budget: set `_exhausted = true`, emit `budget_exhausted` audit event. Register `pi.on('turn_start', ...)` — if `_exhausted`, inject the wrap-up instruction string into the context. Register `pi.on('agent_end', ...)` — clear closure state and delete `.task_budget.json`.
- [ ] **GREEN** — Run `npx vitest run tests/budget/task-budget-enforcement.test.ts` → all scenarios pass including partial-delivery injection and budget clearance on agent_end.

---

### 9. budget_status() tool

- [ ] **RED** — Write `tests/budget/budget-status.test.ts`: load the `budget-manager` extension, seed `usage` table with rows for today (operation_type: 'memory', cost_usd: 0.12) and this week. Call `budget_status({ period: 'today' })` → assert result contains today's total. Call `budget_status({ operationType: 'memory', period: 'last' })` → assert result mentions $0.12. Call with a model that has cost_usd = 0 → assert result says "cost unavailable". Run `npx vitest run tests/budget/budget-status.test.ts` → fails (tool not registered).
- [ ] **ACTION** — Add `budget_status({ period, operationType })` tool to `src/extensions/budget-manager.ts`. Implements: `period = 'today'` → aggregate today's usage; `period = 'last'` + `operationType` → most recent row matching type; formats as human-readable string with USD + tokens. Detects zero-cost model from all rows having `cost_usd = 0`. Includes global limit context if configured.
- [ ] **GREEN** — Run `npx vitest run tests/budget/budget-status.test.ts` → all TB-4 scenarios pass.

---

### 10. Budget settings REST endpoint

- [ ] **RED** — Write `tests/budget/settings-api.test.ts`: start the test server with a budget config, call `GET /api/settings/budget` → assert response contains `limits` and `spend` objects with correct structure. Call `PUT /api/settings/budget` with `{ daily_cost_usd: 15.0 }` → assert `config.json` is updated and the next `GET` returns the new value. Run `npx vitest run tests/budget/settings-api.test.ts` → fails (endpoint does not exist).
- [ ] **ACTION** — Add `app.get('/api/settings/budget', ...)` and `app.put('/api/settings/budget', ...)` to `src/server.ts`. GET: return current `config.budget` merged with today's spend aggregates from `usage`. PUT: merge partial budget config into `config.json` via `saveConfig()`, reload the in-memory config reference. No server restart needed for limit changes.
- [ ] **GREEN** — Run `npx vitest run tests/budget/settings-api.test.ts tests/server.test.ts` → all pass.

---

### 11. Settings tab in webchat

- [ ] **RED** — Check: `webchat/index.html` does not contain a "Settings" tab element and `webchat/settings.js` does not exist. Assert both conditions. Run check → assertion passes (neither exists).
- [ ] **ACTION** — Add a "Settings" tab to `webchat/index.html` alongside the existing Logs tab. Within the Settings tab, add a "Budget" section with: input fields for daily/session/turn limits (tokens and USD), warn threshold slider, current spend vs limit progress bars (loaded via `GET /api/settings/budget` on tab focus), Save button (`PUT /api/settings/budget`). Create `webchat/settings.js` with the fetch/render/save logic.
- [ ] **GREEN** — Verify: `webchat/index.html` contains the Settings tab. `webchat/settings.js` exists and is referenced. Manually load the webchat, click Settings → Budget section is visible, inputs are pre-filled with current config, Save updates config without restart.

---

### 12. Roadmap update

- [ ] **RED** — Check: `agent-roadmap.md` shows "Token budget & overspend protection" as `💡 idea`. Assert the condition. Run check → item is still `💡 idea`.
- [ ] **ACTION** — Update `agent-roadmap.md`: mark "Token budget & overspend protection" as `🔄 in progress [token-budget]`. Add to `reespec/decisions.md`: (1) operation_type via workspace meta file pattern; (2) per-task budget is extension-scoped, not orchestrator-scoped; (3) pi's ModelRegistry is the authoritative pricing source — no custom table; (4) budget_status vs check_budget distinction.
- [ ] **GREEN** — Verify: `agent-roadmap.md` contains `🔄 in progress [token-budget]`. `decisions.md` contains the 4 new decisions.
