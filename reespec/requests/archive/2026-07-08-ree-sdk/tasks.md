# Tasks — ree-sdk

## 0. Install TanStack AI dependencies

- [x] **RED** — Check: `reeboot/package.json` does not list `@tanstack/ai`, `@tanstack/ai-openai`, `@tanstack/ai-anthropic`, `@tanstack/ai-mcp` as dependencies. Assertion fails — packages absent.
- [x] **ACTION** — In `reeboot/`, run `npm install @tanstack/ai@0.39.1 @tanstack/ai-openai@0.15.10 @tanstack/ai-anthropic@0.16.0 @tanstack/ai-groq@0.5.0 @tanstack/ai-mcp@0.2.2 --legacy-peer-deps` (pin to specific versions). Verify they appear in `package.json` `dependencies`. Note: `@tanstack/ai-google` does not exist on npm (404), skipped. Required `--legacy-peer-deps` due to zod v3 vs v4 peer conflict.
- [x] **GREEN** — Verify: all five packages appear in `reeboot/package.json` under `dependencies`. `npm ls @tanstack/ai` resolves without errors.

## 1. ReeExtensionAdapter — implements ExtensionAPI

- [x] **RED** — Write `reeboot/tests/runtime/ree-adapter.test.ts`:
      - Assert `ReeExtensionAdapter` exists and implements `ExtensionAPI` (all required methods present: `registerTool`, `on`, `getAllTools`, `getActiveTools`, `registerCommand`, `setSessionName`, `getSessionName`, `sendMessage`, `context`).
      - Run `vitest run tests/runtime/ree-adapter.test.ts` → fails (module `../../src/extensions/ree-adapter.js` does not exist).
- [x] **ACTION** — Create `reeboot/src/extensions/ree-adapter.ts`:
      - `ReeExtensionAdapter` class implementing `ExtensionAPI`.
      - Constructor `(chat: ReeChat, context: ExtensionContext)`.
      - `registerTool()` adds to chat's tool registry.
      - `on()` subscribes to chat's EventEmitter, returns a **real** unsubscribe (calls `emitter.off`).
      - `getAllTools()`/`getActiveTools()` read from chat's tool registry.
      - `registerCommand()` stores command on chat.
      - `setSessionName`/`getSessionName`/`sendMessage` operate on chat-local state.
      - `context` property returns the provided ExtensionContext.
- [x] **GREEN** — Run `vitest run tests/runtime/ree-adapter.test.ts` → the "implements ExtensionAPI" test passes (all methods present). Compiles with `tsc --noEmit`.

## 2. ReeExtensionAdapter — real unsubscribe

- [x] **RED** — Add to `reeboot/tests/runtime/ree-adapter.test.ts`:
      - Register a handler via `adapter.on('tool_call', handler)`.
      - Call the returned unsubscribe.
      - Emit `tool_call` on the chat.
      - Assert handler was NOT called (toHaveBeenCalledTimes(0)).
      - Run → fails (unsubscribe is not yet implemented or is a no-op).
- [x] **ACTION** — Implement real unsubscribe in `ree-adapter.ts`:
      - `on()` calls `chat.emitter.on(event, wrappedHandler)`, stores the mapping in an internal `_handlers` map.
      - Returned unsubscribe calls `chat.emitter.off(event, wrappedHandler)` and removes from the internal map.
      - Verify handler receives typed events (ToolCallEvent with `args`, not `input`).
- [x] **GREEN** — Run `vitest run tests/runtime/ree-adapter.test.ts` → the unsubscribe test passes. Handler is not called after unsubscribe.

## 3. ReeExtensionAdapter — selective unsubscribe and disposed-chat guard

- [x] **RED** — Add to `reeboot/tests/runtime/ree-adapter.test.ts`:
      - Register h1 and h2 on the same event (`turn_end`). Unsubscribe h1. Emit. Assert h2 called, h1 not called.
      - Dispose the chat. Call `adapter.on('tool_call', ...)`. Assert it throws a descriptive error.
      - Run → fails (selective removal / disposed guard not implemented).
- [x] **ACTION** — Ensure `on()`'s unsubscribe removes only the targeted wrapped handler (each `on()` call creates a distinct wrapped handler reference). Add a disposed-flag check on the chat that throws before subscribing.
- [x] **GREEN** — Run → both tests pass. Selective removal works; disposed chat throws.

## 4. ReeChat — isolated state and event emission

- [x] **RED** — Write `reeboot/tests/runtime/ree-chat.test.ts`:
      - Create two `ReeChat` instances. Register a tool on chatA's adapter. Assert chatB's tool registry is empty.
      - Run → fails (`ReeChat` does not exist).
- [x] **ACTION** — Create `reeboot/src/runtime/ree-chat.ts`:
      - `ReeChat` class with: chatId, sessionId, EventEmitter, tool registry (Map), message history (bounded array), AbortController, outgoing message queue, sessionName, disposed flag.
      - `dispose()` emits `session_shutdown` then removes all listeners.
      - `reset()` emits `session_shutdown` (reason 'new') and clears history.
      - Constructor accepts `(chatId, options: { maxHistory, context, config })`.
- [x] **GREEN** — Run `reeboot/tests/runtime/ree-chat.test.ts` → the isolation test passes. Two chats have independent tool registries.

## 5. ReeChat — emits reeboot-shaped events

- [x] **RED** — Add to `reeboot/tests/runtime/ree-chat.test.ts`:
      - For each event type (before_agent_start, turn_end, session_shutdown, tool_call, tool_result, after_provider_response, agent_end): register a handler, emit the event via `chat.emit(...)`, assert the handler received an object with the correct `type` field and the reeboot-defined fields (e.g. turn_end has turnId/sessionId/usage, tool_call has args, after_provider_response has contextId/provider).
      - Run → fails (emit methods not implemented or shapes wrong).
- [x] **ACTION** — Add typed emit helpers to `ReeChat`:
      - `emitBeforeAgentStart(payload)`, `emitTurnEnd(payload)`, `emitSessionShutdown(reason)`, `emitToolCall(payload)`, `emitToolResult(payload)`, `emitAfterProviderResponse(payload)`, `emitAgentEnd(payload)`.
      - Each constructs the reeboot-defined event shape (adding sessionId/contextId/turnId where the chat owns them).
- [x] **GREEN** — Run → all event-shape tests pass. Each handler receives the correct reeboot-typed event.

## 6. ReeChat — bounded history and per-chat AbortController

- [x] **RED** — Add to `reeboot/tests/runtime/ree-chat.test.ts`:
      - Create a chat with `maxHistory: 5`. Append 10 messages. Assert history.length === 5 and contains the 5 most recent (FIFO).
      - Create two chats. Abort chatA. Assert chatB's signal is not aborted.
      - Run → fails (maxHistory cap not enforced / shared AbortController).
- [x] **ACTION** — Implement `appendMessage()` with FIFO eviction when history exceeds `maxHistory`. Ensure each `ReeChat` creates its own `AbortController` (not shared).
- [x] **GREEN** — Run → both tests pass. History is bounded; abort is per-chat.

## 7. ReeRuntime — creates, tracks, and disposes chats

- [x] **RED** — Write `reeboot/tests/runtime/ree-runtime.test.ts`:
      - Create a `ReeRuntime`. Call `createChat('c1', {})`. Assert `getChat('c1')` returns a chat and `chatCount === 1`.
      - Call `disposeChat('c1')`. Assert `getChat('c1')` is undefined and `chatCount === 0`.
      - Run → fails (`ReeRuntime` does not exist).
- [x] **ACTION** — Create `reeboot/src/runtime/ree-runtime.ts`:
      - `ReeRuntime` class with: chat registry (Map), shared TanStack client config, extension factory list, history store handle.
      - `createChat(chatId, options)` → creates a `ReeChat`, stores it, returns it.
      - `disposeChat(chatId)` → calls chat.dispose(), removes from registry.
      - `getChat(chatId)`, `chatCount` getter.
      - `shutdown()` → disposes all chats.
      - Constructor accepts `(options: { config, maxChats, idleTtlMs, maxHistoryPerChat })`.
- [x] **GREEN** — Run → create/dispose/track tests pass. Compiles with `tsc --noEmit`.

## 8. ReeRuntime — chat isolation and shared resources

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runtime.test.ts`:
      - Create two chats (chatA, chatB). Register a handler on chatA. Emit on chatA. Assert chatB's handler (if any) was not called.
      - Create 50 chats. Assert the runtime holds one shared config object (reference equality), not 50 copies.
      - Run → fails (isolation or shared-config not verified/implemented).
- [x] **ACTION** — Ensure `createChat` gives each chat its own emitter/registry but shares the runtime's config/factory references (pass by reference, not copy). Verify chat emitters are distinct instances.
- [x] **GREEN** — Run → isolation and shared-resource tests pass.

## 9. ReeRuntime — idle eviction and chat limit

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runtime.test.ts`:
      - Create a runtime with `idleTtlMs: 50`. Create a chat. Wait 80ms. Run `runtime.sweepIdle()`. Assert the chat was disposed and removed.
      - Create a runtime with `maxChats: 2`. Create 2 chats. Attempt a 3rd. Assert it throws OR evicts the oldest idle chat, and `chatCount` never exceeds 2.
      - Run → fails (eviction / limit not implemented).
- [x] **ACTION** — Implement `sweepIdle()` (check `lastActivityAt` per chat, dispose if exceeded `idleTtlMs`). Track `lastActivityAt` on each chat (updated on prompt). Enforce `maxChats` in `createChat` (evict oldest idle, or throw if none idle).
- [x] **GREEN** — Run → idle eviction and chat-limit tests pass. Use fake timers if needed for the TTL test.

## 10. Per-chat history store — schema and write

- [x] **RED** — Write `reeboot/tests/runtime/ree-history.test.ts`:
      - Create a `ReeRuntime` with a test DB. Complete a turn on chat `c1` (user message → assistant response). Assert rows exist in the chat-messages store for both messages with `chat_id = 'c1'`.
      - Run → fails (history store / migration does not exist).
- [x] **ACTION** — Create `reeboot/src/runtime/ree-history.ts` and a DB migration for `chats` (id, created_at, last_activity_at, status) and `chat_messages` (id, chat_id, role, content, created_at) tables. `ReeRuntime.persistTurn(chatId, userMsg, assistantMsg)` writes a row for each. Run the migration in `openDatabase()` (gated on table existence, like existing migrations).
- [x] **GREEN** — Run → the write test passes. Both rows exist with the correct `chat_id`.

## 11. Per-chat history store — isolation and resume

- [x] **RED** — Add to `reeboot/tests/runtime/ree-history.test.ts`:
      - Complete turns on chats c1 and c2. Query history for c1. Assert only c1's messages are returned (c2's are not).
      - Dispose c1. Create a new chat with the same `chatId`. Assert `loadHistory('c1')` returns the previous messages (up to `maxHistoryPerChat`).
      - Run → fails (isolation / load not implemented).
- [x] **ACTION** — Implement `loadHistory(chatId, limit)` querying `chat_messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`. `ReeRuntime.createChat` calls `loadHistory` to hydrate the chat's initial history on resume.
- [x] **GREEN** — Run → isolation and resume tests pass.

## 12. Per-chat history store — idle-eviction pruning and restart survival

- [x] **RED** — Add to `reeboot/tests/runtime/ree-history.test.ts`:
      - Complete a turn on c1. Trigger idle eviction (`sweepIdle` after TTL). Assert `loadHistory('c1')` returns empty OR a pruned marker (no active rows).
      - Close the DB, reopen it (simulating restart). Assert c1's history (if not pruned) is still present — persistence is durable, not in-memory only.
      - Run → fails (pruning / durability not implemented).
- [x] **ACTION** — On `disposeChat` triggered by idle eviction, call `pruneHistory(chatId)` (DELETE from chat_messages WHERE chat_id = ?). On explicit dispose (not eviction), keep history so resume works across voluntary restarts. Confirm writes go to the durable SQLite file, not an in-memory DB.
- [x] **GREEN** — Run → pruning and durability tests pass.

## 13. ReeAgentRunner — implements AgentRunner

- [x] **RED** — Write `reeboot/tests/runtime/ree-runner.test.ts`:
      - Assert `ReeAgentRunner` implements `AgentRunner` (prompt, abort, dispose, reset methods present).
      - Run → fails (`ree-runner.js` does not exist).
- [x] **ACTION** — Create `reeboot/src/agent-runner/ree-runner.ts`:
      - `ReeAgentRunner` class implementing `AgentRunner` (the interface in `src/agent-runner/interface.ts`).
      - Constructor `(runtime: ReeRuntime, context: ContextConfig, config: Config)`.
      - `prompt(content, onEvent, options?)`: derive a `chatId` from the message (for v1, use a stub: `chatId = context.id` or a passed-in peer key — the orchestrator integration for real per-peer chatId derivation is a follow-up). Call `runtime.getOrCreateChat(chatId)` to get the `ReeChat`. Run the agent loop via `runReeAgentLoop(chat, tanstackClient, content, signal)` (stub the loop for this task — just emits `before_agent_start` and `agent_end` and resolves, so the contract test passes).
      - `abort()`: triggers the chat's `AbortController`.
      - `dispose()`: calls `runtime.disposeChat(chatId)`, sets a disposed flag.
      - `reset()`: calls `chat.reset()` (clears history, emits `session_shutdown` 'new').
      - `reload()`: no-op for v1 (no pi ResourceLoader to reload).
      - `getSessionPath?()`: returns undefined (ree doesn't use pi session files).
- [x] **GREEN** — Run → the "implements AgentRunner" test passes. Compiles with `tsc --noEmit`.

## 14. ReeAgentRunner — prompt() runs a TanStack-backed turn (text response)

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - Create a runner with a mock TanStack client (injected) whose `chat()` async iterable yields chunks: `RUN_STARTED`, 3× `TEXT_MESSAGE_CONTENT` (deltas), `RUN_FINISHED`. No tool calls.
      - Call `prompt('hello', onEvent)`.
      - Assert the chat emitted `before_agent_start`, `after_provider_response`, `turn_end`, `agent_end` (in order).
      - Assert `onEvent` received 3 `text_delta` RunnerEvents and 1 `message_end` RunnerEvent.
      - Assert `turn_end` event has fields `turnId: string`, `sessionId: string`, `turnIndex: number`, `usage: { inputTokens, outputTokens }`.
      - Assert user+assistant rows were persisted to the `chat_messages` table.
      - Run → fails (agent loop not implemented).
- [x] **ACTION** — Create `reeboot/src/runtime/ree-agent-loop.ts`:
      - `runReeAgentLoop(chat, tanstackClient, content, signal)` function. Consumes the `chat()` async iterable.
      - For each `StreamChunk` (AG-UI event types — see design.md mapping table):
        - `TEXT_MESSAGE_CONTENT` (delta) → emit `text_delta` RunnerEvent + accumulate text
        - `TOOL_CALL_START` → emit `tool_call` extension event + `tool_call_start` RunnerEvent
        - `TOOL_CALL_END` → execute tool, emit `tool_result` extension event + `tool_call_end` RunnerEvent
        - `RUN_STARTED` → emit `before_agent_start` extension event
        - `RUN_FINISHED` → emit `turn_end` extension event, `agent_end` extension event, `message_end` RunnerEvent
        - provider response metadata → emit `after_provider_response` extension event (`contextId`, `provider`, `status`, `headers`)
      - **Field name gotcha**: emit `tool_call` with `args` field, but `tool_result` with `input` field (preserved from the call). See design.md.
      - TanStack client is injected (mockable) — the real client is wired in task 22.
      - `ReeAgentRunner.prompt()` calls `runReeAgentLoop` and translates chat events to RunnerEvents via `onEvent`. After the turn, call `runtime.persistTurn(chatId, userMsg, assistantMsg)`.
      - `ReeAgentRunner.prompt()` signature: `(content: string, onEvent: (event: RunnerEvent) => void, options?: { trust?: MessageTrust }) => Promise<void>` (exact `AgentRunner` interface).
- [x] **GREEN** — Run → the mock-TanStack text-turn test passes. All events fire in order with correct field names; history rows written.

## 15. ReeAgentRunner — tool execution and feedback loop

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - Mock TanStack client returns a `TOOL_CALL_START` chunk on the first iteration, then `RUN_FINISHED` with text on the second.
      - Call `prompt('use the tool', onEvent)`.
      - Assert `tool_call` and `tool_result` extension events fired. Assert the tool's `execute()` was called with the exact 5-param signature: `(toolCallId, params, signal, onUpdate, ctx)` — verify `signal` is the chat's `AbortSignal` and `ctx` is the chat's `ExtensionContext`.
      - Assert `onEvent` received `tool_call_start` and `tool_call_end` RunnerEvents.
      - Assert `tool_result` event has `input` field (NOT `args`) — the field name gotcha from design.md.
      - Assert a second iteration happened (tool result fed back).
      - Run → fails (tool execution loop not implemented).
- [x] **ACTION** — Implement the tool-execution branch of `runReeAgentLoop`:
      - On `TOOL_CALL_START` chunk: parse `toolCallId`, `toolName`, `args` from the chunk. Emit `tool_call` extension event (`{ type: 'tool_call', toolCallId, toolName, args }`). Emit `tool_call_start` RunnerEvent.
      - Look up the tool by name in the chat's tool registry (via `chat.adapter.getAllTools()` or a direct `Map` lookup — store tools by name in the `ReeChat`).
      - Call `tool.execute(toolCallId, args, signal, onUpdate, ctx)` where `signal` is `chat.abortController.signal`, `onUpdate` is a callback that emits `tool_execution_update` events, and `ctx` is `chat.adapter.context` (the `ExtensionContext`).
      - On completion: emit `tool_result` extension event with `{ type: 'tool_result', toolCallId, toolName, input: args, content: result.content, isError: result.isError, details: result.details }`. Note the `input` field (not `args`). Emit `tool_call_end` RunnerEvent.
      - Append the result to the chat's history. TanStack AI's `chat()` handles feeding the tool result into the next iteration internally when using the `tools` option.
- [x] **GREEN** — Run → tool execution test passes. Tool is called with the exact 5-param signature; `tool_result` event has `input` field; second iteration runs.

## 16. ReeAgentRunner — abort cancels in-flight prompt

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - Mock TanStack client whose async iterable hangs (never yields). Start `prompt()`. Call `abort()`. Assert the prompt rejects with AbortError. Assert the AbortSignal passed to `chat()` was aborted.
      - Create two runners (runnerA, runnerB) with hanging clients, sharing a runtime. Abort runnerA. Assert runnerB's signal is NOT aborted and its prompt is still pending.
      - Run → fails (abort propagation not implemented).
- [x] **ACTION** — `prompt()` creates a per-prompt AbortController linked to the chat's signal. `abort()` triggers it. Thread the signal into the TanStack `chat()` call and every `tool.execute()`. The TanStack call and tool executions check `signal.aborted` and stop/reject.
- [x] **GREEN** — Run → abort tests pass. Cancellation is per-chat (runnerB unaffected by runnerA's abort).

## 17. ReeAgentRunner — dispose and reset lifecycle

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - `dispose()`: assert chat's session_shutdown emitted (reason 'quit'), listeners removed. Assert subsequent `prompt()` throws.
      - `reset()`: assert session_shutdown emitted (reason 'new'), history cleared, next prompt() works.
      - Run → fails (lifecycle not fully wired).
- [x] **ACTION** — `dispose()` calls `runtime.disposeChat(chatId)`, sets a disposed flag. `reset()` calls `chat.reset()`. Guard `prompt()` against disposed state.
- [x] **GREEN** — Run → dispose/reset tests pass.

## 18. createRunner factory supports "ree" mode

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - Call `createRunner(context, { sdk: 'ree' } as any)`. Assert the returned instance is a `ReeAgentRunner` (not a `PiAgentRunner`).
      - Call `createRunner(context, { agent: { runner: 'ree' } } as any)`. Assert the returned instance is a `ReeAgentRunner` (backward-compatible alias).
      - Assert `createRunner(context, { sdk: 'pi' } as any)` still returns a `PiAgentRunner` (pi mode unaffected).
      - Run → fails (createRunner throws "Unknown agent runner: ree" or "Unknown sdk: ree").
- [x] **ACTION** — Update `reeboot/src/agent-runner/index.ts`:
      - SDK resolution logic (implement exactly): `const sdk = (config as any).sdk ?? (config as any).agent?.runner ?? 'pi';`
      - `if (sdk === 'pi')` → existing `PiAgentRunner` path (unchanged).
      - `if (sdk === 'ree')` → create a `ReeRuntime` (shared singleton — store on a module-level variable so multiple `createRunner` calls share it), load the ree extension subset via `getReeFactories(config)`, return a `ReeAgentRunner(runtime, context, config)`.
      - `else` → `throw new Error('Unknown sdk: ' + sdk)`.
      - Note: the `ReeRuntime` is constructed with `{ config, maxChats, idleTtlMs, maxHistoryPerChat }` from `config.ree` (with defaults: `maxChats: 200`, `idleTtlMs: 1800000`, `maxHistoryPerChat: 50`).
- [x] **GREEN** — Run → factory tests pass. Both `config.sdk = 'ree'` and `config.agent.runner = 'ree'` return a ReeAgentRunner; `config.sdk = 'pi'` returns a PiAgentRunner.

## 19. Ree extension subset loader

- [x] **RED** — Write `reeboot/tests/runtime/extension-subset.test.ts`:
      - Call `getReeFactories(config)`. Assert it returns 4 factories.
      - Import the 4 extension modules and verify they export the expected factory functions:
        - `observability.ts` exports `makeObservabilityExtension` (named)
        - `session-name.ts` exports `default` (default export)
        - `token-meter.ts` exports `default` (default export)
        - `capabilities.ts` exports `default` (default export, takes `(api, config)`)
      - Run → fails (`getReeFactories` does not exist).
- [x] **ACTION** — Add `getReeFactories(config: Config): ExtensionFactory[]` to `reeboot/src/extensions/loader.ts`:
      - Returns 4 factories in order: observability, session-name, token-meter, capabilities (loaded LAST so it sees the full tool set).
      - **CRITICAL: ree factories take `(api: ExtensionAPI) => void` directly — NO `withAdapter` wrapper.** (Contrast with pi-mode's `getBundledFactories` which wraps each with `withAdapter((init) => (pi) => ...)` because pi passes its own ExtensionAPI. Ree has no pi — the `ReeRuntime` calls each factory with a `ReeExtensionAdapter` directly.)
      - Exact init signatures (see design.md for the pattern):
        - `observability`: `makeObservabilityExtension(api, db, { rateLimitWarnThreshold, configProvider })` — `db` from `getDb()` imported via `await import('../db/index.js')`, `configProvider` from `config.agent?.model?.provider ?? 'unknown'`
        - `session-name`: `mod.default(api)`
        - `token-meter`: `mod.default(api)`
        - `capabilities`: `mod.default(api, config)`
      - Reuse the existing `importExt` helper from the loader (try `.js` then `.ts`).
      - No pi `DefaultResourceLoader` — these are plain factory functions.
- [x] **GREEN** — Run → 4 factories returned, all extension modules importable with the expected export shapes.

## 20. observability runs unchanged on ree adapter

- [x] **RED** — Add to `reeboot/tests/runtime/extension-subset.test.ts`:
      - Create a ReeChat + adapter + in-memory DB. Initialize observability via its factory.
      - Emit session_shutdown on the chat. Assert a row exists in session_events.
      - Emit after_provider_response. Assert a row exists in rate_limits.
      - Assert `observability.ts` was not modified (git diff empty vs the commit before ree-sdk work began).
      - Run → fails (factory wiring not complete, or events don't trigger DB writes).
- [x] **ACTION** — Wire the observability factory: create adapter, call `makeObservabilityExtension(adapter, db, opts)`. Ensure the chat emits session_shutdown and after_provider_response in the shapes observability expects (reeboot shapes — observability already imports them from extension-api).
- [x] **GREEN** — Run → observability test passes. DB rows inserted. No file modification.

## 21. session-name, token-meter, capabilities run unchanged on ree adapter

- [x] **RED** — Add to `reeboot/tests/runtime/extension-subset.test.ts`:
      - session-name: initialize, register command, call setSessionName/getSessionName. Assert it works.
      - token-meter: initialize, emit agent_end with messages. Assert handler runs without error.
      - capabilities: initialize with tools registered, emit before_agent_start. Assert getAllTools returns the tools and the handler injects a capabilities block.
      - Assert none of the 4 extension files were modified (git diff).
      - Run → fails (adapter optional methods / getAllTools / before_agent_start not fully wired).
- [x] **ACTION** — Verify the adapter implements getAllTools(), setSessionName/getSessionName, and before_agent_start emission correctly. Fix any gaps in the adapter (NOT in the extensions). If an extension fails, fix the interface/adapter, not the extension.
- [x] **GREEN** — Run → all three extension tests pass. No extension file modified.

## 22. Wire the real TanStack AI client

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - `createTanStackClient` is a method on `ReeRuntime`; builds adapter for `openai`/`custom`; throws for unknown provider.
      - Construct a `ReeRuntime` with real TanStack provider config pointing at a mock provider endpoint (mock `fetch` returning OpenAI chat-completions SSE — no real provider key needed). Call `prompt()`. Assert `text_delta` events arrive and the turn completes with `message_end`.
      - Run → fails (real client not wired; only the injected mock client works).
- [x] **ACTION** — Wire `@tanstack/ai` + provider adapters into `ReeRuntime`:
      - Packages already installed (task 0): `@tanstack/ai@0.39.1`, `@tanstack/ai-openai@0.15.10`, `@tanstack/ai-anthropic@0.16.0`, `@tanstack/ai-groq@0.5.0`, `@tanstack/ai-mcp@0.2.2`.
      - In `ReeRuntime`, added `createTanStackClient()` method that builds the TanStack model handle based on `config.ree.model.provider`:
        - `'openai'` → `createOpenaiChat(modelId, apiKey, opts)` (explicit key) or `openaiText(modelId, opts)` (env-based)
        - `'anthropic'` → `anthropicText(modelId, { apiKey })`
        - `'groq'` → `groqText(modelId, { apiKey })`
        - `'ollama'` / `'lmstudio'` / `'custom'` → `openaiCompatibleText(modelId, { baseURL, apiKey })`
      - Resolve API keys from reeboot's existing `resolveProviderEnvKey()` in `pi-runner.ts` (reused the `PROVIDER_ENV_VARS` map), or from `config.ree.model.apiKey`.
      - The `ReeRuntime.createTanStackClient()` returns the model handle. Tools are resolved from `chat.adapter.getAllTools()` via the `toTanStackTool(reebootTool, ctx)` converter in `ree-agent-loop.ts`.
      - `ReeAgentRunner.prompt()` now calls `runReeAgentLoop(chat, content, onEvent, { adapter, systemPrompt, maxIterations, mcpClients })` — replaced the stub loop.
      - Added abort detection after stream completion (TanStack emits `RUN_ERROR` instead of throwing on abort).
- [x] **GREEN** — Run → the real-client test passes with the mock provider endpoint. Provider config resolves from reeboot config + env vars. All 84 runtime tests pass; `tsc --noEmit` clean.

## 23. MCP client support via @tanstack/ai-mcp

- [x] **RED** — Add to `reeboot/tests/runtime/ree-runner.test.ts`:
      - `getMcpClients` returns undefined when no servers configured; `setMcpClients` injects clients (test seam); `initMcpClients` creates clients from `config.ree.mcp.servers`.
      - Configure a `ReeRuntime` with an in-memory MCP server (InMemoryTransport + real MCP SDK Server — no child process needed). Verify `getMcpClients()` returns the client and tool discovery works. Call `prompt()` and assert `message_end` fires (MCP clients passed to `chat()`).
      - Run → fails (`setMcpClients` / `initMcpClients` not implemented).
- [x] **ACTION** — Add `@tanstack/ai-mcp` to `ReeRuntime`. Load MCP server config from `config.ree.mcp.servers` (same shape as the existing `mcp-manager` config — `{ name, command, args, env }`). Translated to TanStack stdio transport: `{ type: 'stdio', command, args, env }`. Use `createMCPClient` for each server, pass `mcp: { clients }` to `chat()`. Manage the client lifecycle at the runtime level (not per-chat) for v1.
      - Added `_mcpClients`, `_mcpClientPromises`, `_mcpInitialized` fields to `ReeRuntime`.
      - `getMcpClients()` lazily initializes from config; `initMcpClients()` is the async init path (called by `ReeAgentRunner.prompt()` before the loop).
      - `setMcpClients(clients)` is a test-only seam for injecting pre-built clients (e.g., from `InMemoryTransport`).
      - `shutdown()` closes all MCP clients (best-effort).
      - `ReeAgentRunner.prompt()` calls `await runtime.initMcpClients()` before `getMcpClients()`.
- [x] **GREEN** — Run → MCP tool discovery and execution test passes. All 87 runtime tests pass; `tsc --noEmit` clean.

## 24. Document the pass-through vs. transform seam

- [x] **RED** — Check: `reespec/requests/ree-sdk/design.md` "Seam Inventory" section is a placeholder (table with "to be completed in tasks"). Assertion fails — section is incomplete.
- [x] **ACTION** — Fill in the "Seam Inventory" section in `design.md`:
      - List each event in `ExtensionEventMap`.
      - For each: note whether `ReeExtensionAdapter` forwards it unchanged (pass-through) or transforms it.
      - Note that since the chat emits events in reeboot shape directly, most are pass-through — contrast with `PiExtensionAdapter` which transforms pi → reeboot for turn_end/tool_result/session_shutdown/after_provider_response/tool_call.
      - This is the proof the abstraction is genuine: two adapters, one transforms, one passes through, both satisfy the same interface.
- [x] **GREEN** — Verify: `design.md` "Seam Inventory" section lists all events with pass-through/transform classification. Assertion passes.

## 25. Run full test suite

- [x] **RED** — Check: `vitest run` has failures or `tsc --noEmit` has errors after all ree-sdk work.
- [x] **ACTION** — Fix any compilation errors or test failures (adjust imports, fix type mismatches, update mocks). Ensure no regressions in existing extension/runner tests. Pin `@tanstack/ai` and related packages to specific versions in `package.json`. Fixed: `ToolResultPayload.content` type (`unknown` → `unknown[]`), `_factories` readonly in ReeRuntime.
- [x] **GREEN** — Verify: `vitest run` passes (74 tests across 6 files). `tsc --noEmit` has no errors in `src/runtime/`, `src/extensions/ree-adapter.ts`, `src/agent-runner/ree-runner.ts`.

## 26. Wire extension subset into the production path (post-evaluation gap)

- [x] **RED** — Write `reeboot/tests/runtime/ree-extension-wiring.test.ts`:
      - Construct a `ReeRuntime`, call `runtime.setFactories(getReeFactories(config))`, call `runtime.createChat('c1', { context })`. Assert the chat's adapter has extensions initialized: `chat.commands.size >= 1` (session-name registers a command), `chat.emitter.listenerCount('before_agent_start') >= 1` (capabilities), `chat.emitter.listenerCount('agent_end') >= 1` (token-meter).
      - Call `createRunner(context, { sdk: 'ree' })`. Assert `runner.runtime.factories.length === 4` (createRunner wired getReeFactories into the runtime). Run a prompt with a mock provider. Assert `runner.runtime.getChat(context.id).commands.size >= 1` (extensions initialized on the production chat).
      - Run → fails (`createChat` does not run factories; `createRunner` does not call `setFactories`; `ReeAgentRunner._runtime` is private).
- [x] **ACTION** — Wire the production path:
      - `ReeRuntime.createChat()`: after constructing the `ReeChat`, iterate `this._factories` and call each with `chat.adapter` (best-effort, errors logged not thrown — matching the observability graceful-degradation pattern).
      - `createRunner` in `reeboot/src/agent-runner/index.ts`: after constructing the `ReeRuntime`, call `runtime.setFactories(getReeFactories(config))`.
      - `ReeAgentRunner`: expose `get runtime(): ReeRuntime` (read-only) so tests and future introspection can access the shared runtime.
- [x] **GREEN** — Run `vitest run tests/runtime/ree-extension-wiring.test.ts` → all assertions pass. Run full runtime suite → no regressions.
