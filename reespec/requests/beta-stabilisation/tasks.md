# Tasks — beta-stabilisation

---

## 1. Add `sdk` and `ree` to Zod ConfigSchema

- [ ] **RED** — Write `tests/config-schema-ree.test.ts`:
  - Assert that `ConfigSchema.parse({ "sdk": "ree", "ree": { "maxChats": 50 } })` returns an object with `sdk === "ree"` and `ree.maxChats === 50`
  - Assert that `ConfigSchema.parse({})` returns `sdk === "pi"` and a default `ree` object
  - Assert that `ConfigSchema.parse({ "sdk": "ree" })` without `ree` field returns defaults for `ree.maxChats`, `ree.idleTtlMs`, etc.
  - Assert that `loadConfig()` on a config JSON with `"sdk": "ree"` preserves the field (not stripped)
  - Run: `npx vitest run tests/config-schema-ree.test.ts` → test fails (ConfigSchema has no sdk/ree fields)
- [ ] **ACTION** — In `src/config.ts`:
  - Add `ReeConfigSchema` before `ConfigSchema` with fields: `maxChats`, `idleTtlMs`, `maxHistoryPerChat`, `systemPrompt`, `maxIterations`, optional `model` (ModelConfigSchema), optional `mcp` (McpConfigSchema)
  - Add `sdk: z.enum(['pi', 'ree']).default('pi')` to `ConfigSchema`
  - Add `ree: ReeConfigSchema.default({})` to `ConfigSchema`
  - Add `ReeConfig` type export
  - In `src/agent-runner/index.ts`, update `createRunner()` to read `config.sdk` (typed) instead of `(config as any).sdk`
  - In `src/agent-runner/ree-runner.ts`, update `prompt()` to read `config.ree.systemPrompt`, `config.ree.maxIterations` (typed) instead of `(config as any).ree.xxx`
  - In `src/agent-runner/index.ts`, update the ReeRuntime options to read `config.ree.maxChats` etc. instead of `reeConfig.xxx`
  - In `src/runtime/ree-runtime.ts`, update `createTanStackClient()` and `initMcpClients()` to use typed `config.ree.*` with fallback to typed `config.agent.model` / `config.mcp.servers`
- [ ] **GREEN** — Run `npx vitest run tests/config-schema-ree.test.ts` → tests pass. Run full suite: `npx vitest run --reporter=verbose` → all existing tests still pass.

---

## 2. Strip env-var config generation from entrypoint

- [ ] **RED** — Check: `container/entrypoint.sh` contains `REEBOOT_PROVIDER` translation code after the config-exists check. Assertion fails — env var translation exists and should be removed.
- [ ] **ACTION** — Edit `container/entrypoint.sh`:
  - Keep Step 1 (REEBOOT_AGENTS_MD injection) and REEBOOT_HOST export
  - Keep Step 2 (if config exists, start directly)
  - Remove Step 3 entirely (the `FLAGS=""` block with all REEBOOT_* env var translations)
  - Add error message after Step 2: if config missing, print instructions and `exit 1`
- [ ] **GREEN** — Verify:
  - `grep -c "REEBOOT_PROVIDER\|REEBOOT_API_KEY\|REEBOOT_MODEL" container/entrypoint.sh` is 0 (no env var translation)
  - `grep -c "exit 1" container/entrypoint.sh` is at least 1 (config-missing handler)
  - `grep -c "REEBOOT_AGENTS_MD" container/entrypoint.sh` is at least 1 (preserved)
  - `grep -c "REEBOOT_HOST" container/entrypoint.sh` is at least 1 (preserved)
  - Run `tests/entrypoint.test.ts` if it exists: `npx vitest run tests/entrypoint.test.ts` passes

---

## 3. Add `action: 'cancel'` to IncomingMessage and wire cancel through orchestrator

- [ ] **RED** — Write `tests/cancel-signal.test.ts`:
  - Assert `createIncomingMessage({ action: 'cancel', ... })` produces a message with `action === 'cancel'`
  - Mock an orchestrator with a busy context and a spy on `runner.abort()`: when a cancel message arrives for the busy context, assert `runner.abort()` is called
  - Mock an orchestrator with an idle context: when a cancel message arrives, assert `runner.abort()` is NOT called
  - Run: `npx vitest run tests/cancel-signal.test.ts` → test fails (no action field, no orchestrator handling)
- [ ] **ACTION** — In `src/channels/interface.ts`:
  - Add `action?: 'cancel'` to `IncomingMessage` interface
  - In `src/orchestrator.ts`, in `_handleMessage()`, before queueing: if `state.busy && msg.action === 'cancel'`, call `this._runners.get(contextId)?.abort()` and return
  - Also add: if `msg.action === 'cancel' && !state.busy`, silently ignore (nothing to cancel)
  - In `src/server.ts`, update the cancel handler in the WS `onMessage`:
    - Remove `__cancel__` magic string
    - Publish `createIncomingMessage({ channelType: 'web', peerId, content: '', raw: null, action: 'cancel' })`
- [ ] **GREEN** — Run `npx vitest run tests/cancel-signal.test.ts` → tests pass. Run full suite: `npx vitest run --reporter=verbose` → passes.

---

## 4. Fix WS send function — no-op wsSend, rely on streaming events

- [ ] **RED** — Write test in `tests/web-channel-routing.test.ts` (add to existing file):
  - Create a mock WebAdapter peer with spies on ws.send
  - When `adapter.send(peerId, content)` is called, assert NO ws.send() call was made (wsSend is a no-op)
  - When `adapter.sendEvent(peerId, { type: 'text_delta', delta: 'Hello' })` is called, assert ws.send() was called once with the correct JSON
  - Run: `npx vitest run tests/web-channel-routing.test.ts` → test fails (wsSend currently fabricates events)
- [ ] **ACTION** — In `src/server.ts`, in the WS handler's `onOpen`:
  - Change `wsSend` to an empty async function: `const wsSend = async () => {}`
  - Keep `wsEvent` as-is (forwards RunnerEvents through sendEvent)
  - Optionally: also add a comment explaining why wsSend is a no-op
- [ ] **GREEN** — Run `npx vitest run tests/web-channel-routing.test.ts` → test passes. Run full suite: passes.

---

## 5. Fill web-channel-routing test gaps

- [ ] **RED** — Add tests to `tests/web-channel-routing.test.ts` for:
  - **WS→bus integration**: mock `_bus.publish`, simulate WS message `{ type: "message", content: "hello" }`, assert `_bus.publish` was called with matching IncomingMessage
  - **Cancel via bus**: mock `_bus.publish`, simulate WS message `{ type: "cancel" }`, assert `_bus.publish` was called with `action: 'cancel'`
  - **History persistence**: mock a runner that records conversation, publish two sequential messages via bus, assert same runner was used twice AND second prompt includes first prompt's content (via the channel header injected by orchestrator)
  - Run: `npx vitest run tests/web-channel-routing.test.ts` → new tests fail (no integration tests exist)
- [ ] **ACTION** — Implement each test case in the existing test file:
  - WS→bus: spy on `MessageBus.prototype.publish` or use a mock bus, simulate WS message flow through server.ts's onMessage (or factor out the message handling logic)
  - Cancel: same approach with `{ type: "cancel" }`
  - History: use the orchestrator's mock runner setup (already present in the test file for the session persistence test)
  - Note: these tests exercise the WS handler logic, which is inline in `server.ts`. If the WS handler is not easily testable via import, consider extracting the message handling into a testable function or using a server test helper. For v1, test via the orchestrator+bus path (already tested) and add a unit test for the WS handler's onMessage that calls the factoring.
- [ ] **GREEN** — Run `npx vitest run tests/web-channel-routing.test.ts` → all tests pass.

---

## 6. Generate unique peer ID per WS connection

- [ ] **RED** — Write `tests/ws-peer-id.test.ts`:
  - Simulate two concurrent WebSocket connections to the WS handler
  - Assert each connection gets a different `sessionId` in the `connected` event
  - Assert `webAdapter._eventCallbacks` has two entries after both connect
  - Assert unregistering one peer leaves the other's registration intact
  - Run: `npx vitest run tests/ws-peer-id.test.ts` → fails (currently uses contextId as peerId for all connections)
- [ ] **ACTION** — In `src/server.ts`, in the WS handler's `onOpen`:
  - Generate `const sessionId = nanoid()` per connection
  - Register peer with `webAdapter.registerPeer(sessionId, wsSend, wsEvent)` instead of `webAdapter.registerPeer(contextId, ...)`
  - Send `{ type: 'connected', contextId, sessionId }` in the connected event
  - In `onMessage` and `onClose`, use `sessionId` (captured in closure) instead of `contextId` for peer operations
- [ ] **GREEN** — Run `npx vitest run tests/ws-peer-id.test.ts` → passes. Run full suite: passes.

---

## 7. Add session_search tool for ree mode

- [ ] **RED** — Write `tests/ree-session-search.test.ts`:
  - Mock a ree adapter with `getCurrentChatId()` returning 'test-chat'
  - Simulate registering the ree session_search extension using `getReeFactories`
  - Assert a tool named `session_search` is registered on the adapter
  - Run: `npx vitest run tests/ree-session-search.test.ts` → fails (no ree session_search tool exists)
- [ ] **ACTION** — In `src/extensions/ree-session-search.ts`:
  - Create a new extension file that exports a factory function: `makeReeSessionSearch(api, config, reeHistoryDb) => void`
  - The factory registers a tool named `session_search` with the same description as the pi version
  - Tool's `execute` reads `api.getCurrentChatId()`, queries `chat_messages` table via FTS, returns results scoped to current chat
  - In `src/extensions/loader.ts`, in `getReeFactories`, add this as a fifth factory (after capabilities)
  - In `src/extensions/ree-adapter.ts`, add `getCurrentChatId()` method to `ReeExtensionAdapter` that returns the chat's ID
  - Add `getCurrentChatId(): string | undefined` to the `ExtensionAPI` interface in `extension-api.ts` — pi adapter returns `undefined`
- [ ] **GREEN** — Run `npx vitest run tests/ree-session-search.test.ts` → passes. Run full suite: passes.

---

## 8. Guard pi-specific API routes in ree mode

- [ ] **RED** — Write `tests/api-ree-guards.test.ts`:
  - Mock a ree-mode server (config with `sdk: "ree"`)
  - Call `GET /api/contexts` → assert response is `[]`
  - Call `GET /api/tasks` → assert response is `[]`
  - Call `GET /api/contexts/main/sessions` → assert response is `[]`
  - Call `GET /api/health` → assert it still works (200 with status ok)
  - Call `GET /api/channels` → assert it still works
  - Run: fails (endpoints query DB directly, return data or crash)
- [ ] **ACTION** — In `src/server.ts`:
  - Add a helper function `isReeMode()` that checks `(appConfig as any)?.sdk === 'ree'`
  - In the three endpoints (`/api/contexts`, `/api/tasks`, `/api/contexts/:id/sessions`), add an early return of `c.json([])` if `isReeMode()`
  - Leave all other endpoints unchanged
- [ ] **GREEN** — Run `npx vitest run tests/api-ree-guards.test.ts` → passes. Run full suite: passes.

---

## 9. Commit all changes

- [ ] **RED** — Check: `git status --short` shows uncommitted changes. Assertion fails — working tree is dirty.
- [ ] **ACTION** — Run the full test suite: `npx vitest run --reporter=verbose` → confirm all tests pass. Then `git add -A && git commit -m "feat: beta stabilisation — config schema, cancel signal, WS streaming fix, peer ID, ree session_search, API guards, entrypoint cleanup"`.
  - If tests fail, fix failures before committing.
  - Include deleted archive requests (sdk-pluggability, webchat-ui) in the commit.
- [ ] **GREEN** — Verify: `git status --short` is empty. `git log --oneline -1` shows the commit message.
