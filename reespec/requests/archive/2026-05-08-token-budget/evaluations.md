## Evaluation — 2026-05-07 00:08

### TB-1-A: Usage table has cost_usd and operation_type columns
verdict:  ✅ SATISFIED
reason:   runBudgetMigration(db) in src/db/schema.ts adds both columns via ALTER TABLE,
          defaults match spec (0 and 'user_message'), wired into openDatabase(),
          idempotency confirmed by two-call test in tests/budget/budget-schema.test.ts.

### TB-1-B: Token-meter persists cost
verdict:  ✅ SATISFIED
reason:   src/extensions/token-meter.ts reads m.usage.cost?.total and inserts it as
          cost_usd; test in tests/budget/token-meter-cost.test.ts confirms 0.042 is
          persisted; input_tokens and output_tokens still written in the same INSERT.

### TB-1-C: Token-meter reads operation_type from workspace meta file
verdict:  ✅ SATISFIED
reason:   token-meter.ts reads .reeboot_turn_meta.json from ctx.cwd and extracts
          operationType, defaults to 'user_message' when file is absent. Both paths
          verified by tests/budget/token-meter-cost.test.ts.

### TB-1-D: Orchestrator writes turn meta before dispatch
verdict:  ✅ SATISFIED
reason:   src/orchestrator.ts _runTurn() calls mkdirSync + writeFileSync to write
          .reeboot_turn_meta.json before runner.prompt(); channelType mapping to
          operationType verified (scheduler→scheduler, memory→memory, web→user_message)
          in tests/budget/turn-meta.test.ts.

### TB-2-A: No limits = no enforcement
verdict:  ✅ SATISFIED
reason:   src/budget/guard.ts short-circuits with { ok: true } when all limit fields
          are null; verified by tests/budget/budget-guard.test.ts TB-2-A case.

### TB-2-B: Daily token limit blocks when breached
verdict:  ⚠️ PARTIAL
reason:   Block fires and reason string matches spec format; however the daily token
          query does not filter by context_id — it sums ALL contexts' tokens for the
          day. Spec GIVEN states "105000 tokens consumed today for this context",
          implying a per-context daily check. The intent is ambiguous but the
          implementation diverges from the example setup.
focus:    src/budget/guard.ts lines 54-68 — daily_tokens query lacks WHERE context_id = ?

### TB-2-C: Daily cost limit blocks when breached
verdict:  ✅ SATISFIED
reason:   BudgetGuard returns ok:false with reason containing $5.42 / $5.00 when
          cost_usd sum exceeds daily_cost_usd; verified in budget-guard.test.ts.

### TB-2-D: Warn threshold fires before hard stop
verdict:  ⚠️ PARTIAL
reason:   Warning is returned and audit event (budget_warning) is emitted; once-per-
          crossing suppression via _warnedKeys is implemented. However the spec
          requires "the owner is notified once per threshold crossing" — the warning
          branch in orchestrator.ts (lines 252-263) only calls emitEvent(), it never
          calls _reply() or broadcastToAllChannels(). Owner receives no channel message.
focus:    src/orchestrator.ts lines 252-263 — warning branch emits audit event only,
          no _reply/broadcast to notify owner via channel

### TB-2-E: Session limit checks current session spend
verdict:  ✅ SATISFIED
reason:   Session check filters by context_id and uses today's date as session boundary
          (documented approximation); returns ok:false with correct reason format;
          verified in budget-guard.test.ts TB-2-E case.

### TB-2-F: Turn limit uses last turn's actual cost
verdict:  ✅ SATISFIED
reason:   BudgetGuard queries most recent usage row for context_id, compares
          input_tokens + output_tokens against turn_tokens, returns correct reason
          format; verified in budget-guard.test.ts TB-2-F case.

### TB-3-A: set_budget registers a task budget
verdict:  ✅ SATISFIED
reason:   set_budget tool stores budget in closure, writes .task_budget.json with
          { amount, unit, startCost: 0 }, returns "Budget set: $5.00 for this task"
          and "Budget set: 500k tokens for this task" as required; verified in
          tests/budget/budget-manager.test.ts.

### TB-3-B: turn_end accumulates cost against the task budget
verdict:  ✅ SATISFIED
reason:   budget-manager.ts registers pi.on('turn_end') and accumulates
          event.message.usage.cost.total against _taskBudget.spent; two-event
          accumulation ($0.40 + $0.80 = $1.20) verified in
          tests/budget/task-budget-enforcement.test.ts.

### TB-3-C: check_budget returns current spend vs limits
verdict:  ⚠️ PARTIAL
reason:   Task budget line ("Task budget: $X.XX spent of $Y.YY (Z% used, $W.WW
          remaining)") is correct. The spec requires "Daily global: $2.84 of $10.00
          (28% used)" — actual current spend vs configured limit. However
          _buildGlobalSection() (budget-manager.ts) only reads the configured limit
          from config, never queries the usage table. The global section shows
          "Daily cost limit: $10.00" with no actual spend figure.
focus:    src/extensions/budget-manager.ts _buildGlobalSection() — must query
          usage table for actual today spend to satisfy the spec's format

### TB-3-D: Budget exhaustion injects wrap-up instruction
verdict:  ❌ UNSATISFIED
reason:   The spec requires injecting a wrap-up instruction into the agent context on
          the next turn_start. The implementation calls ctx.injectSystemPrompt(instruction)
          inside pi.on('turn_start', ...), but pi's ExtensionContext type (types.d.ts line
          207-240) has no injectSystemPrompt method. The turn_start ExtensionHandler has
          return type void — no mechanism to inject prompts. The call is guarded by
          typeof ctx.injectSystemPrompt === 'function', which will always be false,
          silently dropping the injection. Audit event is emitted but wrap-up is never
          delivered to the agent.
focus:    src/extensions/budget-manager.ts turn_start handler — injectSystemPrompt
          does not exist in pi's API; correct hook is before_agent_start returning
          { systemPrompt }

### TB-3-E: Budget cleared after task completes
verdict:  ✅ SATISFIED
reason:   pi.on('agent_end') resets _taskBudget = null and _exhausted = false, and
          deletes .task_budget.json from workspace; verified in
          tests/budget/task-budget-enforcement.test.ts TB-3-E case.

### TB-4-A: Daily spend query
verdict:  ✅ SATISFIED
reason:   budget_status({ period: 'today' }) returns "Today: $X.XX spent (Xk tokens
          input / Xk tokens output)" with "— no daily limit set" or remaining/pct
          when limit is configured; verified in tests/budget/budget-status.test.ts.

### TB-4-B: Operation-type filtered query
verdict:  ✅ SATISFIED
reason:   budget_status({ operationType: 'memory', period: 'last' }) returns "Last
          memory run: $0.12 (8k tokens)" and "No memory operations found" when absent;
          verified in tests/budget/budget-status.test.ts.

### TB-4-C: Provider without pricing returns token-only summary
verdict:  ✅ SATISFIED
reason:   When all rows have cost_usd = 0 and tokens > 0, _buildStatusSummary returns
          the token-only format with "(cost unavailable for this model)"; verified in
          tests/budget/budget-status.test.ts TB-4-C case.

### TB-4-D: budget_status answers common natural language queries
verdict:  ✅ SATISFIED
reason:   budget_status tool is registered with a description enabling natural language
          use; returns structured human-readable output covering cost, tokens, and
          remaining limits suitable for any channel relay.

### TB-5-A: Settings tab exists in the webchat
verdict:  ✅ SATISFIED
reason:   webchat/index.html contains a "Settings" tab button and a #tab-settings-panel
          with a Budget section including input fields for daily/session/turn limits
          (tokens and USD) and warn threshold.

### TB-5-B: Current spend is shown alongside limits
verdict:  ⚠️ PARTIAL
reason:   Spend text is rendered in #budget-spend-summary (e.g. "Today: $2.84 spent
          — $7.16 of $10.00 remaining (28%)"). However the spec requires "with a
          progress bar or indicator" — neither a <progress> element, a visual bar,
          nor any percentage-width div is present in index.html or settings.js.
focus:    webchat/settings.js load() function — text summary only, no visual
          progress bar or indicator element

### TB-5-C: Saving budget limits updates config and takes effect
verdict:  ⚠️ PARTIAL
reason:   PUT /api/settings/budget updates _mutableConfig in server.ts and saves to
          config.json. The spec requires "the in-memory BudgetGuard config is updated
          immediately". BudgetGuard.check() reads from this._config on the _orchestrator
          instance, which is constructed at startup and never updated. No path from
          server.ts PUT handler → _orchestrator._config exists; the guard continues
          using stale config until restart.
focus:    src/server.ts PUT /api/settings/budget handler — _orchestrator._config is
          never refreshed; needs orchestrator.updateConfig() or equivalent

### TB-5-D: GET /api/settings/budget returns current config and spend
verdict:  ✅ SATISFIED
reason:   GET /api/settings/budget returns { limits, spend } with today_cost_usd,
          today_tokens, session_cost_usd, session_tokens; verified in
          tests/budget/settings-api.test.ts.

### Extension loader wiring (Acceptance Criteria 4–8)
verdict:  ❌ UNSATISFIED
reason:   Brief acceptance criteria 4–8 all require set_budget, check_budget, and
          budget_status tools to be "available to the agent". src/extensions/loader.ts
          registers 13 bundled extensions but budget-manager is absent. In production
          (and in any test that uses the real loader), none of the TB-3/TB-4 tools
          are ever loaded into the agent session. The tests in tests/budget/ call
          makeBudgetManagerExtension() directly, bypassing the loader entirely.
focus:    src/extensions/loader.ts — budget-manager factory is never pushed to the
          factories array; AC 4/5/6/7/8 cannot be satisfied until wired

## Triage

✅ Safe to skip: TB-1-A, TB-1-B, TB-1-C, TB-1-D, TB-2-A, TB-2-C, TB-2-E, TB-2-F, TB-3-A, TB-3-B, TB-3-E, TB-4-A, TB-4-B, TB-4-C, TB-4-D, TB-5-A, TB-5-D

⚠️ Worth a look:
- **TB-2-B** — daily token query not scoped to context_id; may need `WHERE context_id = ?` added
- **TB-2-D** — owner notification on warning: audit event emitted but no channel message sent; add `_reply` or `broadcastToAllChannels` in the warning branch
- **TB-3-C** — `check_budget()` global section shows configured limits only, not actual spend; `_buildGlobalSection` must query the usage table
- **TB-5-B** — spend summary is text-only; spec requires a progress bar or visual indicator element
- **TB-5-C** — PUT updates `_mutableConfig` in server.ts but not `_orchestrator._config`; BudgetGuard continues using stale config until restart

❌ Must fix:
- **TB-3-D** — wrap-up injection: `ctx.injectSystemPrompt()` does not exist in pi's ExtensionAPI; the condition is always false; no instruction ever reaches the agent; correct mechanism is `pi.on('before_agent_start')` returning `{ systemPrompt }`
- **Extension loader wiring** — `budget-manager` is absent from `loader.ts`; all TB-3/TB-4 capabilities are unreachable in production; affects AC 4, 5, 6, 7, 8

---

## Evaluation — 2026-05-08 00:25

### TB-1: Usage Tracking

verdict:  ✅ SATISFIED
reason:   All four scenarios satisfied. `runBudgetMigration(db)` adds `cost_usd REAL NOT NULL DEFAULT 0` and `operation_type TEXT NOT NULL DEFAULT 'user_message'` idempotently (`reeboot/src/db/schema.ts`). `token-meter.ts` persists `m.usage.cost?.total ?? 0` as `cost_usd` alongside input/output tokens, reads `operationType` from `.reeboot_turn_meta.json` (defaulting to `'user_message'`), and the orchestrator writes the meta file before `runner.prompt()` is called (`reeboot/src/orchestrator.ts` lines 283-285).

---

### TB-2: Global Limits

verdict:  ✅ SATISFIED
reason:   All six scenarios (A-F) implemented in `reeboot/src/budget/guard.ts`. No-limit short-circuit (`hasAnyLimit` check) returns immediately with no DB queries. Daily token/cost blocks return correct reason strings. Warn threshold fires before hard stop with `_warnedKeys` dedup preventing per-turn spam. Session and turn limits all present. Orchestrator wires `BudgetGuard.check()` pre-dispatch, calls `this._reply()` on block, and emits `budget_breached`/`budget_warning` audit events.

---

### TB-3: Agentic Per-Task Budget

verdict:  ⚠️ PARTIAL
reason:   TB-3-A through TB-3-E are all implemented and pass their tests: `set_budget` stores closure + writes `.task_budget.json`; `turn_end` accumulates USD cost; `check_budget` returns structured task + global sections; `before_agent_start` injects the wrap-up instruction when exhausted and emits `budget_exhausted`; `agent_end` clears closure and deletes file. However, the brief states "Feasibility check — agent briefly reasons about whether the budget is realistic for the task. If clearly insufficient (e.g. $0.30 for a multi-source research task), it warns the owner before starting and offers to proceed or abort" — no code, prompt template, or agent instruction implements this behavior. `set_budget` simply confirms the budget without any feasibility assessment.
focus:    `reeboot/src/extensions/budget-manager.ts` — `set_budget` tool handler; also check system prompt templates (`reeboot/templates/`) for any feasibility reasoning guidance

---

### TB-4: Channel-Accessible Spend Introspection

verdict:  ✅ SATISFIED
reason:   `budget_status` tool implemented in `reeboot/src/extensions/budget-manager.ts`. TB-4-A: `period='today'` returns correct human-readable summary with remaining/limit if configured, or "no daily limit set". TB-4-B: `period='last'` + `operationType='memory'` queries most recent matching row and returns "No memory operations found" when absent. TB-4-C: `allZeroCost = row.total_cost === 0 && (row.total_input + row.total_output) > 0` correctly emits "cost unavailable for this model" rather than $0.00. TB-4-D: tool returns sufficient data for natural language relay. All five budget-status tests pass.

---

### TB-5: Settings Tab UI

verdict:  ⚠️ PARTIAL
reason:   Two gaps. First, TB-5-A: the brief specifies "Per-session token cap" and "Per-turn token cap" as configurable in the Settings tab — `session_tokens` and `turn_tokens` are present in the config schema (`reeboot/src/config.ts` lines 237, 239) but there are no corresponding input fields in the Settings form (`reeboot/webchat/index.html` / `settings.js`); only `session_cost_usd` and `turn_cost_usd` are exposed via the UI. Second, TB-5-D: the spec shows `session_cost_usd` and `session_tokens` as distinct from today values — but `GET /api/settings/budget` returns `spend.session_cost_usd = row.cost` and `spend.session_tokens = row.tokens` using the same today-scoped query (`reeboot/src/server.ts` lines 558-560), making session spend identical to today spend regardless of how many sessions occurred. TB-5-B and TB-5-C are satisfied (progress bar present, save triggers live `updateBudgetConfig`).
focus:    `reeboot/webchat/index.html` — add `session_tokens` and `turn_tokens` form fields; `reeboot/src/server.ts` `/api/settings/budget` handler — session spend needs true session-scoped query

---

## Triage

✅ Safe to skip:   TB-1 (usage tracking), TB-2 (global limits), TB-4 (introspection)
⚠️  Worth a look:
- **TB-3** — `set_budget` performs no feasibility check; brief explicitly requires the agent to warn the owner when a budget is clearly insufficient before starting work
- **TB-5** — Settings tab missing `session_tokens` and `turn_tokens` input fields; session spend returned by `GET /api/settings/budget` is today-scoped not session-scoped

---
