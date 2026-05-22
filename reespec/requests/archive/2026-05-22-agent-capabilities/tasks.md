# Tasks: Agent Capabilities Discovery & Memory Fix

---

### 1. Capabilities extension skeleton + before_agent_start registration

- [x] **RED** — Write `reeboot/tests/extensions/capabilities.test.ts`: create a mock `pi` with `getAllTools()` returning `[]`, call `makeCapabilitiesExtension(pi, {})`, fire a `before_agent_start` event, assert the returned `systemPrompt` contains a minimal capabilities block. Run `npx vitest run tests/extensions/capabilities.test.ts` → test fails (module `capabilities` does not exist).
- [x] **ACTION** — Create `reeboot/src/extensions/capabilities.ts` exporting `makeCapabilitiesExtension` and `default` factory. Register a `before_agent_start` handler that calls `pi.getAllTools()`, filters out built-ins (heuristic: source path contains `pi-coding-agent` core tools), and appends a minimal block to `event.systemPrompt`.
- [x] **GREEN** — Run `npx vitest run tests/extensions/capabilities.test.ts` → test passes.

---

### 2. Built-in tool filtering

- [x] **RED** — Extend `reeboot/tests/extensions/capabilities.test.ts`: mock `pi.getAllTools()` returning a mix of built-in tools (`bash`, `read` with source path from `pi-coding-agent` core) and custom tools (`memory`, `session_search` with source path from reeboot). Fire `before_agent_start`, assert the returned system prompt contains `memory` and `session_search` but NOT `bash` or `read`. Run → test fails (filter logic not implemented).
- [x] **ACTION** — Implement `isBuiltInTool(tool)` in `capabilities.ts` using source path heuristic. Ensure the filter correctly excludes pi core tools while including reeboot bundled, user, MCP, and skill tools.
- [x] **GREEN** — Run `npx vitest run tests/extensions/capabilities.test.ts` → test passes.

---

### 3. Structured capabilities block with descriptions and hints

- [x] **RED** — Extend the test: mock `pi.getAllTools()` returning tools with `name`, `description`, and `sourceInfo`. Fire `before_agent_start`, assert the system prompt contains a structured block with tool names, descriptions, and usage hints (e.g. "Use `memory` to add facts to persistent memory"). Run → test fails (block is minimal/plain text).
- [x] **ACTION** — Implement `buildCapabilitiesBlock(tools)` in `capabilities.ts` that groups tools by source category (bundled / user / mcp / skill), renders each tool as `• name — description. Usage hint.`, and caps at 30 tools with a "… and N more" suffix.
- [x] **GREEN** — Run `npx vitest run tests/extensions/capabilities.test.ts` → test passes.

---

### 4. Capabilities extension wired into loader

- [x] **RED** — Write `reeboot/tests/extensions/loader.test.ts` (or extend existing): assert that `getBundledFactories(config)` returns a factory whose name or path includes `capabilities`. Run → test fails (capabilities not in loader).
- [x] **ACTION** — Add the capabilities factory to `getBundledFactories` in `reeboot/src/extensions/loader.ts`, placed after budget-manager and observability (so all other tools are registered first and visible to `getAllTools()`).
- [x] **GREEN** — Run `npx vitest run tests/extensions/loader.test.ts` → test passes.

---

### 5. Observability: capabilities_injected event

- [x] **RED** — Extend `capabilities.test.ts`: mock `emitEvent` via a spy, fire `before_agent_start`, assert `emitEvent` was called with `type: 'capabilities_injected'` and payload containing `toolCount`, `toolNames`, `sourceBreakdown`. Run → test fails (no event emission).
- [x] **ACTION** — In `capabilities.ts`, import `emitEvent` from `../observability/events.js` (or use a lazy require pattern matching existing code), call it from the `before_agent_start` handler with the structured payload. Handle `getDb()` not being ready (graceful degradation per existing pattern).
- [x] **GREEN** — Run `npx vitest run tests/extensions/capabilities.test.ts` → test passes.

---

### 6. Memory consolidation race condition fix

- [x] **RED** — Write `reeboot/tests/extensions/memory-consolidation-race.test.ts`: create a mock scheduler with a `registerJob` spy. Call `makeMemoryExtension(pi, { memory: { enabled: true, consolidation: { enabled: true, schedule: '0 2 * * *' } } })`. Assert that `registerJob` was NOT called during factory invocation (the race). Then fire a `session_start` event. Assert `registerJob` IS called with the correct job id. Run → test fails (job registers at load time, not at session_start).
- [x] **ACTION** — In `memory-manager.ts`: remove the `globalScheduler.registerJob` call from `makeMemoryExtension`. Add a `pi.on('session_start', ...)` handler that lazily requires `../scheduler-registry.js`, checks if `globalScheduler` is not `noopScheduler`, and registers the consolidation job with a guard against double-registration.
- [x] **GREEN** — Run `npx vitest run tests/extensions/memory-consolidation-race.test.ts` → test passes. Also run `npx vitest run tests/extensions/memory-manager.test.ts` → all existing tests pass.

---

### 7. No double-registration on session reload

- [x] **RED** — Extend `memory-consolidation-race.test.ts`: fire `session_start` twice. Assert `registerJob` is called exactly once. Run → test fails (no guard implemented).
- [x] **ACTION** — Add a module-level `_consolidationRegistered` flag in `memory-manager.ts`. Set it to `true` after first successful registration. Check it before registering.
- [x] **GREEN** — Run `npx vitest run tests/extensions/memory-consolidation-race.test.ts` → test passes.

---

### 8. Consolidation disabled / memory disabled guards

- [x] **RED** — Extend the race test with two cases: (a) `consolidation.enabled: false`, assert `registerJob` never called; (b) `memory.enabled: false`, assert `registerJob` never called and no error thrown. Run → test fails (no guards).
- [x] **ACTION** — Gate the `session_start` handler: only register if `memoryConfig.enabled && memoryConfig.consolidation?.enabled`. When memory is disabled, the `session_start` handler is not registered at all (or early-returns).
- [x] **GREEN** — Run `npx vitest run tests/extensions/memory-consolidation-race.test.ts` → test passes.

---

### 9. End-to-end: capabilities extension in compiled output

- [x] **RED** — Run `npm run build` in the reeboot package root. Assert `reeboot/dist/extensions/capabilities.js` exists. Run → test fails (file does not exist because `capabilities.ts` is not compiled).
- [x] **ACTION** — `npm run build` will pick up `src/extensions/capabilities.ts` automatically via `tsconfig.json` rootDir. Verify `dist/extensions/capabilities.js` and `.d.ts` are produced.
- [x] **GREEN** — Assert `dist/extensions/capabilities.js` exists and is non-empty. Assertion passes.

---

### 10. Full test suite passes

- [x] **RED** — Run `npx vitest run` across the reeboot test suite. Check for failures related to capabilities or memory-manager. Run → may fail if new tests break existing assumptions.
- [x] **ACTION** — Fix any regressions. Ensure the capabilities extension doesn't interfere with other extensions' `before_agent_start` handlers (chaining works correctly). Ensure memory-manager tests still pass after removing load-time registration.
- [x] **GREEN** — Run `npx vitest run` → all tests pass.

---

### 11. Update decisions.md

- [x] **RED** — Check `reeboot/decisions.md`: no entry exists for centralized tool discovery or memory consolidation scheduler race fix. Assertion fails.
- [x] **ACTION** — Append two entries to `reeboot/decisions.md`: (1) Centralized capabilities discovery extension replaces per-tool promptSnippet as the canonical tool-advertisement mechanism. (2) Memory consolidation job registration moved from extension load time to session_start to avoid noopScheduler race.
- [x] **GREEN** — Verify `reeboot/decisions.md` contains both entries. Assertion passes.

---

### 12. Documentation update

- [x] **RED** — Check `reeboot/docs/` for any page mentioning `promptSnippet` or memory tool visibility. Check `reeboot/README.md` for memory troubleshooting. Assert no guidance exists on how the agent discovers tools or why memory might not work. Assertion fails.
- [x] **ACTION** — Add a brief note to `reeboot/README.md` or relevant docs page: "The agent discovers all registered tools automatically via the capabilities extension. If memory is not working, check that `memory.enabled: true` is set in config.json and the `capabilities_injected` event appears in the observability stream."
- [x] **GREEN** — Verify the docs mention tool discovery and memory troubleshooting. Assertion passes.

