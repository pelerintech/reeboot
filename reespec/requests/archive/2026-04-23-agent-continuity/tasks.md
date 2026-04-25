# Tasks: Agent Continuity

Read before starting: `brief.md`, `design.md`, `specs/`

---

## Area A — Session Resume

### 1. Fix session file filter in getResumedSessionPath

- [x] **RED** — Write `reeboot/tests/session-resume.test.ts`: create a tmp sessions dir,
      write two fake `.jsonl` files with ISO-timestamp names (modify the older one to be
      outside the inactivity window), call `getResumedSessionPath(contextId, windowMs, tmpDir)`,
      assert it returns the newer file's path. Also assert it returns `null` when the newer
      file is outside the window. Also assert it returns `null` when only `session-*.json`
      (old format) files exist. Run `vitest run reeboot/tests/session-resume.test.ts` →
      fails (current filter returns null for `.jsonl` files).
- [x] **ACTION** — In `reeboot/src/context.ts`, update `getResumedSessionPath`: change the
      filter from `f.startsWith('session-') && f.endsWith('.json')` to `f.endsWith('.jsonl')`.
      Keep the rest (sort, mtime check) unchanged.
- [x] **GREEN** — Run `vitest run reeboot/tests/session-resume.test.ts` → all assertions pass.

---

### 2. Verify unanswered message detection fires after resume fix

- [x] **RED** — In `reeboot/tests/session-resume.test.ts`, add: write a minimal JSONL session
      file with one user message entry and no assistant entry (use the real pi JSONL format:
      `{"type":"message","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}`).
      Call `scanSessionForUnansweredMessage(path)`, assert it returns the user message text.
      Write a second session file where the last message is from the assistant, assert it
      returns `null`. Run → fails (function may not parse the correct format).
- [x] **ACTION** — Read `reeboot/src/resilience/startup.ts` `scanSessionForUnansweredMessage`.
      The parsing logic already handles the JSONL format — verify it works end-to-end with
      real file content. Fix any edge case (e.g. empty file, malformed lines) if test reveals one.
- [x] **GREEN** — Run `vitest run reeboot/tests/session-resume.test.ts` → all assertions pass.

---

## Area B — Memory Extension

### 3. Move memory-manager to src/extensions and verify build

- [x] **RED** — Check: `reeboot/dist/extensions/memory-manager.js` does not exist.
      Run `ls reeboot/dist/extensions/memory-manager.js` → exits non-zero (file absent).
- [x] **ACTION** — Copy `reeboot/extensions/memory-manager.ts` to
      `reeboot/src/extensions/memory-manager.ts`. Run `npm run build` in `reeboot/`.
- [x] **GREEN** — Run `ls reeboot/dist/extensions/memory-manager.js` → file exists and is
      non-empty. Run `npm run build` exits 0 with no TypeScript errors.

---

### 4. Fix memory extension: config argument + internal require() wiring

- [x] **RED** — Write `reeboot/tests/extensions/memory-wiring.test.ts`: build a minimal mock
      pi API (same pattern as existing `memory-manager.test.ts`). Call
      `makeMemoryExtension(pi, config, tmpDir)` with a config containing
      `memory.memoryCharLimit: 999`. Trigger `before_agent_start`. Assert the injected block
      references `999` as the char limit (not the hardcoded `2200` default). Run →
      fails (function ignores config argument, uses `pi.getConfig?.() ?? {}`).
- [x] **ACTION** — Update `makeMemoryExtension` signature in
      `reeboot/src/extensions/memory-manager.ts` to accept `(pi, config, memoriesDirOverride?)`.
      Replace `(pi as any).getConfig?.() ?? {}` with the passed `config`. Replace
      `(pi as any).getDb?.()` with `require('../db/index.js').getDb()`. Replace
      `(pi as any).getScheduler?.()` with `require('../scheduler-registry.js').globalScheduler`.
      Update the default export to forward the `config` argument.
      Update `reeboot/src/extensions/loader.ts`: change the memory factory call from
      `(mod.default as any)(pi)` to `(mod.default as any)(pi, config)`.
- [x] **GREEN** — Run `vitest run reeboot/tests/extensions/memory-wiring.test.ts` → passes.
      Run `vitest run reeboot/tests/extensions/memory-manager.test.ts` → existing tests still pass.

---

### 5. Make session_search always-on regardless of memory.enabled

- [x] **RED** — In `reeboot/tests/extensions/memory-wiring.test.ts`, add: build mock pi,
      call `makeMemoryExtension(pi, { memory: { enabled: false } }, tmpDir)`. Assert
      `session_search` IS in the registered tools. Assert `memory` tool is NOT registered.
      Run → fails (current code gates entire factory on memoryEnabled).
- [x] **ACTION** — In `reeboot/src/extensions/loader.ts`: remove the `if (memoryEnabled)`
      guard around the memory factory (or change it to always push the factory). Pass
      `memoryEnabled` into `makeMemoryExtension` via config so the function gates only the
      `memory` tool and `before_agent_start` hook internally.
- [x] **GREEN** — Run `vitest run reeboot/tests/extensions/memory-wiring.test.ts` → passes.

---

## Area C — Messages Persistence

### 6. Schema migration: add origin columns to tasks table

- [x] **RED** — Write `reeboot/tests/messages-persistence.test.ts`: open in-memory SQLite,
      run `runResilienceMigration(db)`. Assert `tasks` table has columns `origin_channel`
      and `origin_peer`. Run `vitest run reeboot/tests/messages-persistence.test.ts` →
      fails (columns don't exist yet).
- [x] **ACTION** — In `reeboot/src/db/schema.ts`, inside `runResilienceMigration`, add
      guarded `ALTER TABLE` statements for `origin_channel TEXT` and `origin_peer TEXT`
      (use the existing `table_info` pragma guard pattern already used for the `catchup` column).
- [x] **GREEN** — Run `vitest run reeboot/tests/messages-persistence.test.ts` → passes.

---

### 7. Write user message to DB after turn dispatch

- [x] **RED** — In `reeboot/tests/messages-persistence.test.ts`, add: create a mock runner
      that resolves immediately, set up an orchestrator with an in-memory DB, dispatch a
      message with `channelType: 'whatsapp'`, `peerId: '+40X'`, `content: 'hello'`. After
      turn completes, query `messages` table. Assert one row with `role: 'user'`,
      `content: 'hello'`, `channel: 'whatsapp'`, `peer_id: '+40X'`. Run → fails (nothing
      writes to messages).
- [x] **ACTION** — In `reeboot/src/orchestrator.ts` `_runTurn()`: after dispatching and
      before `closeTurn`, insert the user message row via `this._db?.prepare(...).run(...)`.
      Skip for `channelType: 'scheduler'` and `'recovery'` turns.
- [x] **GREEN** — Run `vitest run reeboot/tests/messages-persistence.test.ts` → passes.

---

### 8. Write assistant message to DB on successful turn

- [x] **RED** — In `reeboot/tests/messages-persistence.test.ts`, add: mock runner that
      emits a `text_delta` event producing `responseText = 'world'`. Dispatch, await.
      Assert a second row exists with `role: 'assistant'`, `content: 'world'`. Run → fails.
- [x] **ACTION** — In `reeboot/src/orchestrator.ts` `_runTurn()`: after the success break,
      insert the assistant message row (only when `responseText` is non-empty and turn succeeded).
- [x] **GREEN** — Run `vitest run reeboot/tests/messages-persistence.test.ts` → passes.

---

## Area D — Channel Context

### 9. Inject channel context header into every prompt

- [x] **RED** — Write `reeboot/tests/channel-context.test.ts`: set up an orchestrator with
      a mock runner that captures the string passed to `runner.prompt()`. Publish a message
      with `channelType: 'whatsapp'` and `peerId: '+40X'` and `content: 'hi'`. Assert the
      captured prompt starts with `[channel: whatsapp | peer: +40X]`. Assert a message
      with `channelType: 'scheduler'` does NOT have the header prepended. Run `vitest run
      reeboot/tests/channel-context.test.ts` → fails.
- [x] **ACTION** — In `reeboot/src/orchestrator.ts` `_runTurn()`: before calling
      `runner.prompt()`, build `promptContent`. If `msg.channelType` is not in
      `['scheduler', 'recovery']`, prepend `[channel: ${msg.channelType} | peer: ${msg.peerId}]\n`.
- [x] **GREEN** — Run `vitest run reeboot/tests/channel-context.test.ts` → passes.

---

## Area E — Unified Scheduling

### 10. Add origin_channel and origin_peer to schedule_task tool

- [x] **RED** — Write `reeboot/tests/unified-scheduling.test.ts`: get the scheduler tools
      via `createSchedulerTools(db, mockScheduler)`. Call `schedule_task` with
      `{ schedule: 'in 1 hour', prompt: 'test', origin_channel: 'whatsapp', origin_peer: '+40X' }`.
      Query the `tasks` table. Assert `origin_channel = 'whatsapp'` and `origin_peer = '+40X'`
      on the created row. Run `vitest run reeboot/tests/unified-scheduling.test.ts` → fails
      (columns don't exist in schema or tool doesn't accept them).
- [x] **ACTION** — In `reeboot/src/scheduler.ts` `createSchedulerTools`: add
      `origin_channel` and `origin_peer` as optional parameters to `schedule_task`. Include
      them in the `INSERT` statement. Update the TypeBox schema accordingly.
      Update `reeboot/src/extensions/scheduler-tool.ts` to forward the two new optional
      parameters from the tool registration to `createSchedulerTools`.
- [x] **GREEN** — Run `vitest run reeboot/tests/unified-scheduling.test.ts` → passes.

---

### 11. Enrich scheduler-fired prompt with routing instructions

- [x] **RED** — In `reeboot/tests/unified-scheduling.test.ts`, add: insert a task row with
      `origin_channel: 'whatsapp'`, `origin_peer: '+40X'`, `prompt: 'remind user to drink water'`,
      `next_run` = now. In `server.ts` the `schedulerOrchestrator.handleScheduledTask` builds
      the enriched prompt — extract that logic into a pure function `buildScheduledPrompt(task)`
      in `scheduler.ts`. Call it directly in the test. Assert the returned string contains
      the original prompt, `whatsapp`, `+40X`, and `send_message`. Run → fails (function
      doesn't exist yet).
- [x] **ACTION** — In `reeboot/src/scheduler.ts`: add `buildScheduledPrompt(task: TaskRow): string`
      that returns the enriched prompt. If `origin_channel` and `origin_peer` are set, include
      them and instruct the agent to call `send_message`. If null, instruct broadcast.
      In `reeboot/src/server.ts` `schedulerOrchestrator.handleScheduledTask`: use
      `buildScheduledPrompt` to build the content, pass `origin_channel`/`origin_peer` in
      the `raw` field of `createIncomingMessage`.
- [x] **GREEN** — Run `vitest run reeboot/tests/unified-scheduling.test.ts` → passes.

---

### 12. Route scheduler reply to origin channel, not fake adapter

- [x] **RED** — In `reeboot/tests/unified-scheduling.test.ts`, add: create a mock adapter
      for `whatsapp` that records calls to `send()`. Set up an orchestrator with that adapter.
      Publish a message with `channelType: 'scheduler'`, `peerId: 'scheduler'`,
      `raw: { origin_channel: 'whatsapp', origin_peer: '+40X' }`, and a non-empty
      `responseText` produced by a mock runner. After the turn, assert `adapter.send` was
      called with peer `+40X`. Run → fails (current `_reply` does `_adapters.get('scheduler')`
      which is null → nothing sent).
- [x] **ACTION** — In `reeboot/src/orchestrator.ts` `_reply()`: add a branch — if
      `msg.channelType === 'scheduler'`, read `origin_channel` and `origin_peer` from
      `msg.raw`. If `origin_channel` is set, look up `_adapters.get(origin_channel)` and
      send to `origin_peer`. Otherwise, broadcast to all adapters.
- [x] **GREEN** — Run `vitest run reeboot/tests/unified-scheduling.test.ts` → passes.

---

### 13. Remove timer tool, verify heartbeat still works

- [x] **RED** — Write a test in `reeboot/tests/unified-scheduling.test.ts`: build a mock pi,
      load the scheduler extension. Assert the registered tool list does NOT include `timer`.
      Assert it DOES include `heartbeat`, `schedule_task`, `list_tasks`, `cancel_task`. Run →
      fails (`timer` is currently registered).
- [x] **ACTION** — In `reeboot/src/extensions/scheduler-tool.ts`: remove the `pi.registerTool`
      block for `timer`. Keep `TimerManager` class (still used by heartbeat internally if needed)
      and the sleep interceptor bash hook. Do NOT touch heartbeat registration.
- [x] **GREEN** — Run `vitest run reeboot/tests/unified-scheduling.test.ts` → passes.
      Run full test suite `vitest run` → no regressions.

---

## Area F — Integration smoke

### 14. End-to-end: memory files created on startup with real config

- [x] **RED** — Check: `~/.reeboot/memories/MEMORY.md` does not exist (confirmed in audit).
      Run `ls ~/.reeboot/memories/MEMORY.md` → exits non-zero.
- [x] **ACTION** — Start reeboot with `memory.enabled: true` (already set in config.json).
      The memory extension now loads correctly (Tasks 3–5), initialises the memories dir,
      and creates MEMORY.md and USER.md.
- [x] **GREEN** — Run `ls ~/.reeboot/memories/MEMORY.md ~/.reeboot/memories/USER.md` →
      both files exist. Run `vitest run` → full suite passes with no regressions.
