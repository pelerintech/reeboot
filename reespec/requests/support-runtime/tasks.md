# Tasks — support-runtime

## 1. SupportExtensionAdapter — implements ExtensionAPI

- [ ] **RED** — Write `tests/runtime/support-adapter.test.ts`:
      - Assert `SupportExtensionAdapter` exists and `instanceof`/`implements` check passes (all required methods present: registerTool, on, getAllTools, getActiveTools, registerCommand).
      - Run `vitest run tests/runtime/support-adapter.test.ts` → fails (module `../../src/extensions/support-adapter.js` does not exist).
- [ ] **ACTION** — Create `reeboot/src/extensions/support-adapter.ts`:
      - `SupportExtensionAdapter` class implementing `ExtensionAPI`.
      - Constructor `(chat: SupportChat, context: ExtensionContext)`.
      - `registerTool()` adds to chat's tool registry.
      - `on()` subscribes to chat's EventEmitter, returns a **real** unsubscribe (calls `emitter.off`).
      - `getAllTools()`/`getActiveTools()` read from chat's tool registry.
      - `registerCommand()` stores command on chat.
      - `setSessionName`/`getSessionName`/`sendMessage` operate on chat-local state.
      - `context` property returns the provided ExtensionContext.
- [ ] **GREEN** — Run `vitest run tests/runtime/support-adapter.test.ts` → the "implements ExtensionAPI" test passes (all methods present). Compiles with `tsc --noEmit`.

## 2. SupportExtensionAdapter — real unsubscribe

- [ ] **RED** — Add to `tests/runtime/support-adapter.test.ts`:
      - Register a handler via `adapter.on('tool_call', handler)`.
      - Call the returned unsubscribe.
      - Emit `tool_call` on the chat.
      - Assert handler was NOT called (toHaveBeenCalledTimes(0)).
      - Run → fails (unsubscribe is not yet implemented or is a no-op).
- [ ] **ACTION** — Implement real unsubscribe in `support-adapter.ts`:
      - `on()` calls `chat.emitter.on(event, wrappedHandler)`, stores the mapping.
      - Returned unsubscribe calls `chat.emitter.off(event, wrappedHandler)` and removes from the internal map.
      - Verify handler receives typed events (ToolCallEvent with `args`, not `input`).
- [ ] **GREEN** — Run `vitest run tests/runtime/support-adapter.test.ts` → the unsubscribe test passes. Handler is not called after unsubscribe.

## 3. SupportExtensionAdapter — selective unsubscribe and disposed-chat guard

- [ ] **RED** — Add to `tests/runtime/support-adapter.test.ts`:
      - Register h1 and h2 on the same event (`turn_end`). Unsubscribe h1. Emit. Assert h2 called, h1 not called.
      - Dispose the chat. Call `adapter.on('tool_call', ...)`. Assert it throws a descriptive error.
      - Run → fails (selective removal / disposed guard not implemented).
- [ ] **ACTION** — Ensure `on()`'s unsubscribe removes only the targeted wrapped handler (each `on()` call creates a distinct wrapped handler reference). Add a disposed-flag check on the chat that throws before subscribing.
- [ ] **GREEN** — Run → both tests pass. Selective removal works; disposed chat throws.

## 4. SupportChat — isolated state and event emission

- [ ] **RED** — Write `tests/runtime/support-chat.test.ts`:
      - Create two `SupportChat` instances. Register a tool on chatA's adapter. Assert chatB's tool registry is empty.
      - Run → fails (`SupportChat` does not exist).
- [ ] **ACTION** — Create `reeboot/src/runtime/support-chat.ts`:
      - `SupportChat` class with: chatId, sessionId, EventEmitter, tool registry (Map), message history (bounded array), AbortController, outgoing message queue, sessionName, disposed flag.
      - `dispose()` emits `session_shutdown` then removes all listeners.
      - `reset()` emits `session_shutdown` (reason 'new') and clears history.
      - Constructor accepts `(chatId, options: { maxHistory, context, config })`.
- [ ] **GREEN** — Run `tests/runtime/support-chat.test.ts` → the isolation test passes. Two chats have independent tool registries.

## 5. SupportChat — emits reeboot-shaped events

- [ ] **RED** — Add to `tests/runtime/support-chat.test.ts`:
      - For each event type (before_agent_start, turn_end, session_shutdown, tool_call, tool_result, after_provider_response): register a handler, emit the event via `chat.emit(...)`, assert the handler received an object with the correct `type` field and the reeboot-defined fields (e.g. turn_end has turnId/sessionId/usage, tool_call has args, after_provider_response has contextId/provider).
      - Run → fails (emit methods not implemented or shapes wrong).
- [ ] **ACTION** — Add typed emit helpers to `SupportChat`:
      - `emitBeforeAgentStart(payload)`, `emitTurnEnd(payload)`, `emitSessionShutdown(reason)`, `emitToolCall(payload)`, `emitToolResult(payload)`, `emitAfterProviderResponse(payload)`.
      - Each constructs the reeboot-defined event shape (adding sessionId/contextId/turnId where the chat owns them).
- [ ] **GREEN** — Run → all event-shape tests pass. Each handler receives the correct reeboot-typed event.

## 6. SupportChat — bounded history and per-chat AbortController

- [ ] **RED** — Add to `tests/runtime/support-chat.test.ts`:
      - Create a chat with `maxHistory: 5`. Append 10 messages. Assert history.length === 5 and contains the 5 most recent (FIFO).
      - Create two chats. Abort chatA. Assert chatB's signal is not aborted.
      - Run → fails (maxHistory cap not enforced / shared AbortController).
- [ ] **ACTION** — Implement `appendMessage()` with FIFO eviction when history exceeds `maxHistory`. Ensure each `SupportChat` creates its own `AbortController` (not shared).
- [ ] **GREEN** — Run → both tests pass. History is bounded; abort is per-chat.

## 7. SupportRuntime — creates, tracks, and disposes chats

- [ ] **RED** — Write `tests/runtime/support-runtime.test.ts`:
      - Create a `SupportRuntime`. Call `createChat('c1', {})`. Assert `getChat('c1')` returns a chat and `chatCount === 1`.
      - Call `disposeChat('c1')`. Assert `getChat('c1')` is undefined and `chatCount === 0`.
      - Run → fails (`SupportRuntime` does not exist).
- [ ] **ACTION** — Create `reeboot/src/runtime/support-runtime.ts`:
      - `SupportRuntime` class with: chat registry (Map), shared config/model client, extension factory list.
      - `createChat(chatId, options)` → creates a `SupportChat`, stores it, returns it.
      - `disposeChat(chatId)` → calls chat.dispose(), removes from registry.
      - `getChat(chatId)`, `chatCount` getter.
      - `shutdown()` → disposes all chats.
      - Constructor accepts `(options: { config, maxChats, idleTtlMs, maxHistoryPerChat })`.
- [ ] **GREEN** — Run → create/dispose/track tests pass. Compiles with `tsc --noEmit`.

## 8. SupportRuntime — chat isolation and shared resources

- [ ] **RED** — Add to `tests/runtime/support-runtime.test.ts`:
      - Create two chats (chatA, chatB). Register a handler on chatA. Emit on chatA. Assert chatB's handler (if any) was not called.
      - Create 50 chats. Assert the runtime holds one shared config object (reference equality), not 50 copies.
      - Run → fails (isolation or shared-config not verified/implemented).
- [ ] **ACTION** — Ensure `createChat` gives each chat its own emitter/registry but shares the runtime's config/factory references (pass by reference, not copy). Verify chat emitters are distinct instances.
- [ ] **GREEN** — Run → isolation and shared-resource tests pass.

## 9. SupportRuntime — idle eviction and chat limit

- [ ] **RED** — Add to `tests/runtime/support-runtime.test.ts`:
      - Create a runtime with `idleTtlMs: 50`. Create a chat. Wait 80ms. Run `runtime.sweepIdle()`. Assert the chat was disposed and removed.
      - Create a runtime with `maxChats: 2`. Create 2 chats. Attempt a 3rd. Assert it throws OR evicts the oldest idle chat, and `chatCount` never exceeds 2.
      - Run → fails (eviction / limit not implemented).
- [ ] **ACTION** — Implement `sweepIdle()` (check `lastActivityAt` per chat, dispose if exceeded `idleTtlMs`). Track `lastActivityAt` on each chat (updated on prompt). Enforce `maxChats` in `createChat` (evict oldest idle, or throw if none idle).
- [ ] **GREEN** — Run → idle eviction and chat-limit tests pass. Use fake timers if needed for the TTL test.

## 10. SupportAgentRunner — implements AgentRunner

- [ ] **RED** — Write `tests/runtime/support-runner.test.ts`:
      - Assert `SupportAgentRunner` implements `AgentRunner` (prompt, abort, dispose, reset methods present).
      - Run → fails (`support-runner.js` does not exist).
- [ ] **ACTION** — Create `reeboot/src/agent-runner/support-runner.ts`:
      - `SupportAgentRunner` class implementing `AgentRunner`.
      - Constructor `(runtime: SupportRuntime, context: ContextConfig, config: Config)`.
      - `prompt()` creates/gets a `SupportChat` from the runtime, runs the agent loop (stub for now — just emits events and resolves).
      - `abort()` triggers the chat's AbortController.
      - `dispose()` disposes the chat permanently.
      - `reset()` resets the chat (clears history, emits session_shutdown 'new').
- [ ] **GREEN** — Run → the "implements AgentRunner" test passes. Compiles with `tsc --noEmit`.

## 11. SupportAgentRunner — prompt() runs a turn with mock LLM

- [ ] **RED** — Add to `tests/runtime/support-runner.test.ts`:
      - Create a runner with a mock LLM client that returns a text response (no tool calls).
      - Call `prompt('hello', onEvent)`.
      - Assert the chat emitted before_agent_start, after_provider_response, turn_end, agent_end.
      - Assert onEvent received a text_delta and a message_end RunnerEvent.
      - Run → fails (agent loop not implemented).
- [ ] **ACTION** — Create `reeboot/src/runtime/agent-loop.ts`:
      - `runAgentLoop(chat, llmClient, content, signal)` function.
      - Emits before_agent_start → calls LLM → emits after_provider_response → if tool calls, emit tool_call/tool_result, execute tools (thread signal), feed results back → emit turn_end → emit agent_end.
      - For this task: LLM client is injected (mockable). Non-streaming.
      - `SupportAgentRunner.prompt()` calls `runAgentLoop` and translates chat events to RunnerEvents via onEvent.
- [ ] **GREEN** — Run → the mock-LLM turn test passes. All events fire in order.

## 12. SupportAgentRunner — tool execution and feedback loop

- [ ] **RED** — Add to `tests/runtime/support-runner.test.ts`:
      - Mock LLM returns a tool call on the first call, then a text response on the second.
      - Call `prompt('use the tool', onEvent)`.
      - Assert tool_call and tool_result events fired. Assert the tool's execute() was called with the chat's AbortSignal. Assert onEvent received tool_call_start and tool_call_end RunnerEvents. Assert a second LLM call happened (tool result fed back).
      - Run → fails (tool execution loop not implemented).
- [ ] **ACTION** — Implement the tool-execution branch of `runAgentLoop`: parse tool calls from LLM response, look up tool in chat registry, call `tool.execute(toolCallId, args, signal, onUpdate, ctx)`, emit tool_call before and tool_result after, append result to history, loop back to LLM.
- [ ] **GREEN** — Run → tool execution test passes. Tool result is fed back for a second LLM call.

## 13. SupportAgentRunner — abort cancels in-flight prompt

- [ ] **RED** — Add to `tests/runtime/support-runner.test.ts`:
      - Mock LLM that hangs (never resolves). Start `prompt()`. Call `abort()`. Assert the prompt rejects with AbortError. Assert the AbortSignal passed to the LLM client was aborted.
      - Create two runners (runnerA, runnerB) with hanging LLMs. Abort runnerA. Assert runnerB's signal is NOT aborted and its prompt is still pending (not rejected).
      - Run → fails (abort propagation not implemented).
- [ ] **ACTION** — `prompt()` creates a per-prompt AbortController linked to the chat's signal. `abort()` triggers it. Thread the signal into the LLM fetch and every `tool.execute()`. The LLM call and tool executions check `signal.aborted` and reject/stop.
- [ ] **GREEN** — Run → abort tests pass. Cancellation is per-chat (runnerB unaffected by runnerA's abort).

## 14. SupportAgentRunner — dispose and reset lifecycle

- [ ] **RED** — Add to `tests/runtime/support-runner.test.ts`:
      - `dispose()`: assert chat's session_shutdown emitted (reason 'quit'), listeners removed. Assert subsequent `prompt()` throws.
      - `reset()`: assert session_shutdown emitted (reason 'new'), history cleared, next prompt() works.
      - Run → fails (lifecycle not fully wired).
- [ ] **ACTION** — `dispose()` calls `runtime.disposeChat(chatId)`, sets a disposed flag. `reset()` calls `chat.reset()`. Guard `prompt()` against disposed state.
- [ ] **GREEN** — Run → dispose/reset tests pass.

## 15. createRunner factory supports "support" mode

- [ ] **RED** — Add to `tests/runtime/support-runner.test.ts`:
      - Call `createRunner(context, { agent: { runner: 'support' } } as any)`. Assert the returned instance is a `SupportAgentRunner` (not PiAgentRunner).
      - Run → fails (createRunner throws "Unknown agent runner: support").
- [ ] **ACTION** — Update `reeboot/src/agent-runner/index.ts`:
      - Add a `case` for `runnerType === 'support'`.
      - Create a `SupportRuntime` (shared singleton or per-call), load the support extension subset, return a `SupportAgentRunner`.
      - The support subset is loaded via a new `getSupportFactories()` function in the loader (4 extensions only, no pi ResourceLoader).
- [ ] **GREEN** — Run → factory test passes. `config.agent.runner = 'support'` returns a SupportAgentRunner.

## 16. Support extension subset loader

- [ ] **RED** — Write `tests/runtime/extension-subset.test.ts`:
      - Call `getSupportFactories(config)`. Assert it returns 4 factories.
      - Import the 4 extension modules and verify they export the expected factory functions (makeObservabilityExtension, session-name default, token-meter default, capabilities default).
      - Run → fails (`getSupportFactories` does not exist).
- [ ] **ACTION** — Add `getSupportFactories(config)` to `reeboot/src/extensions/loader.ts`:
      - Returns factories for: observability, session-name, token-meter, capabilities (loaded last).
      - Each factory creates a `SupportExtensionAdapter` for its chat and calls the extension's init function.
      - No pi `DefaultResourceLoader` — these are plain factory functions.
- [ ] **GREEN** — Run → 4 factories returned, all extension modules importable.

## 17. observability runs unchanged on support adapter

- [ ] **RED** — Add to `tests/runtime/extension-subset.test.ts`:
      - Create a SupportChat + adapter + in-memory DB. Initialize observability via its factory.
      - Emit session_shutdown on the chat. Assert a row exists in session_events.
      - Emit after_provider_response. Assert a row exists in rate_limits.
      - Assert `observability.ts` was not modified (git diff empty vs sdk-pluggability commit).
      - Run → fails (factory wiring not complete, or events don't trigger DB writes).
- [ ] **ACTION** — Wire the observability factory: create adapter, call `makeObservabilityExtension(adapter, db, opts)`. Ensure the chat emits session_shutdown and after_provider_response in the shapes observability expects (reeboot shapes — observability already imports them from extension-api).
- [ ] **GREEN** — Run → observability test passes. DB rows inserted. No file modification.

## 18. session-name, token-meter, capabilities run unchanged on support adapter

- [ ] **RED** — Add to `tests/runtime/extension-subset.test.ts`:
      - session-name: initialize, register command, call setSessionName/getSessionName. Assert it works.
      - token-meter: initialize, emit agent_end with messages. Assert handler runs without error.
      - capabilities: initialize with tools registered, emit before_agent_start. Assert getAllTools returns the tools and the handler injects a capabilities block.
      - Assert none of the 4 extension files were modified (git diff).
      - Run → fails (adapter optional methods / getAllTools / before_agent_start not fully wired).
- [ ] **ACTION** — Verify the adapter implements getAllTools(), setSessionName/getSessionName, and before_agent_start emission correctly. Fix any gaps in the adapter (NOT in the extensions). If an extension fails, fix the interface/adapter, not the extension.
- [ ] **GREEN** — Run → all three extension tests pass. No extension file modified.

## 19. Document the pass-through vs. transform seam

- [ ] **RED** — Check: `reespec/requests/support-runtime/design.md` does not contain a "Seam Inventory" section documenting which events pass through identically vs. which require transformation in the support adapter. Assertion fails — section absent.
- [ ] **ACTION** — Add a "Seam Inventory" section to `design.md`:
      - List each event in ExtensionEventMap.
      - For each: note whether SupportExtensionAdapter forwards it unchanged (pass-through) or transforms it.
      - Note that since the chat emits events in reeboot shape directly, most are pass-through — contrast with PiExtensionAdapter which transforms pi → reeboot for turn_end/tool_result/session_shutdown/after_provider_response/tool_call.
      - This is the proof the abstraction is genuine: two adapters, one transforms, one passes through, both satisfy the same interface.
- [ ] **GREEN** — Verify: `design.md` contains the "Seam Inventory" section with all events listed. Assertion passes.

## 20. Run full test suite

- [ ] **RED** — Check: `vitest run` has failures or `tsc --noEmit` has errors after all support-runtime work.
- [ ] **ACTION** — Fix any compilation errors or test failures (adjust imports, fix type mismatches, update mocks). Ensure no regressions in existing extension/runner tests.
- [ ] **GREEN** — Verify: `vitest run` passes (existing tests unaffected, new runtime tests pass). `tsc --noEmit` has no errors in `src/runtime/`, `src/extensions/support-adapter.ts`, or `src/agent-runner/support-runner.ts`.
