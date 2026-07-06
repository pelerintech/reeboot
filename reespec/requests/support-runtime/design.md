# Design — support-runtime

## Architecture

The support runtime is a second `AgentRunner` implementation that hosts many lightweight chats in one process. It plugs into the existing `createRunner` factory (`config.agent.runner = "support"`) and the orchestrator routes messages to it unchanged. Pi remains the runner for coding/owner contexts; support is the runner for customer-facing chats.

```
                         createRunner(context, config)
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
           config.agent.runner            config.agent.runner
               = "pi"                       = "support"
                    │                            │
            PiAgentRunner               SupportAgentRunner
          (1 heavy pi session)          (1 chat, lightweight)
                                              │
                                    ┌─────────┴──────────┐
                                    ▼                    ▼
                            SupportRuntime         SupportExtensionAdapter
                          (shared singleton)      (implements ExtensionAPI,
                           ├ model client          real unsubscribe,
                           ├ shared config         per-chat event bridge)
                           └ chat registry
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                      SupportChat           SupportChat
                      (chat A state)        (chat B state)
                      ├ EventEmitter        ├ EventEmitter
                      ├ tool registry       ├ tool registry
                      ├ message history     ├ message history
                      └ abort controller    └ abort controller
```

### The three layers

**SupportRuntime** (shared singleton, one per process)
- Holds shared resources: model client config, provider credentials, the extension factory list (loaded once), global scheduler/db references.
- Owns the chat registry: `Map<chatId, SupportChat>`.
- Creates and disposes chats. Enforces bounded memory: idle chats are evicted after a configurable TTL (LRU).
- This is the "lightweight" alternative to spinning up a full pi process per chat. One process, one runtime, N chats.

**SupportChat** (one per conversation)
- Isolated per-chat state: message history (bounded array), tool registry (per-chat tool instances), `EventEmitter`, `AbortController`.
- Emits reeboot-defined events (`before_agent_start`, `turn_end`, `session_shutdown`, `agent_end`, `tool_call`, `tool_result`, `after_provider_response`) in reeboot's own shapes — NOT pi-shaped payloads.
- Holds a `SupportExtensionAdapter` instance that bridges this chat's emitter to extensions.
- On `dispose()`: calls every registered unsubscribe, clears the emitter, drops message history. This is the leak-prevention boundary.

**SupportExtensionAdapter** (one per chat, implements `ExtensionAPI`)
- `registerTool()` → adds to the chat's tool registry.
- `on()` → subscribes to the chat's `EventEmitter`, returns a **real unsubscribe** that removes the listener. Handlers receive reeboot-typed events (the chat emits them in reeboot shape already, so the adapter's transform is identity for most events — but it exists as the seam where transformation would happen if shapes diverged).
- `setSessionName`/`getSessionName`/`sendMessage` → operate on chat-local state (no pi delegation).
- `context` → built from the runtime's shared config + chat-local cwd/sessionId.
- This is adapter #2. It proves the `ExtensionAPI` abstraction is genuine: wherever it can forward unchanged, the abstraction is real; wherever it must transform, that's the documented seam.

### The minimal agent loop

`SupportAgentRunner.prompt()` runs a simplified agent loop (no streaming, single provider call per turn — enough to prove the event flow and exercise the extensions):

```
1. Emit before_agent_start (system prompt + options)
2. Call LLM (direct provider API — fetch to Anthropic/OpenAI)
   - Emit after_provider_response (status, headers, contextId, provider)
3. If tool calls in response:
   a. For each tool call:
      - Emit tool_call (type, toolCallId, toolName, args)
      - Execute tool via registry (thread AbortSignal)
      - Emit tool_result (type, toolCallId, toolName, args, content, isError)
   b. Append tool results to history, goto 2
4. Emit turn_end (turnId, sessionId, turnIndex, message, toolResults, usage)
5. Emit agent_end (messages)
6. Resolve prompt()
```

The loop is deliberately minimal. Full production hardening (streaming, multi-provider, retries, rate-limit handling) is a follow-up request — the orchestrator already handles rate-limit retries and timeouts at its layer.

### Cancellation

`SupportAgentRunner.abort()` calls the chat's `AbortController.abort()`. The signal is threaded into:
- The LLM `fetch()` call (aborts the HTTP request).
- Every `tool.execute()` call (the 5-param `execute` signature's `signal` parameter — load-bearing here).
- The agent loop checks `signal.aborted` between steps and stops.

This is the critical difference from pi: pi's `abort()` calls `session.abort()` but doesn't thread `AbortSignal` into tool execution. The support runtime does.

### Listener lifecycle (the #1 correctness property)

```
SupportChat.dispose():
  for each (event, handler) registered via adapter.on():
    chat.emitter.off(event, handler)     ← REAL removal
  adapter._handlers.clear()
  chat.emitter.removeAllListeners()
  chat.history = []
  chat.emit('session_shutdown', { sessionId, reason })
```

Every `on()` returns a real unsubscribe. Chat teardown removes every listener. No no-ops. This is non-negotiable at hundreds-of-chats scale.

### Bounded memory

- **Message history**: capped at `maxHistoryPerChat` (default 50 messages). Older messages are dropped (FIFO). No compaction in this request — just a hard cap.
- **Idle chat eviction**: chats with no activity for `idleTtlMs` (default 30 min) are disposed and removed from the registry. The orchestrator's inactivity timer already calls `runner.reset()`; the support runtime's `reset()` disposes the chat and lets a new one be created lazily on the next prompt.
- **Tool registry**: per-chat, but tool *instances* are lightweight (the shared factory creates them; per-chat state is minimal).

## Extension subset

Four extensions run through the support adapter, chosen because they exercise the core event surface and are obviously support-relevant:

| Extension | Events used | Why included |
|---|---|---|
| `observability` | `session_shutdown`, `after_provider_response` | Proves the adapter delivers reeboot-shaped events (sessionId, contextId, provider). Writes to DB. |
| `session-name` | `registerCommand`, `setSessionName`/`getSessionName` | Proves optional methods work on a second adapter. |
| `token-meter` | `agent_end` | Proves `agent_end` with `messages` flows through. Reads usage. |
| `capabilities` | `before_agent_start`, `getAllTools` | Proves system-prompt injection and tool discovery work. Must be loaded last (sees full tool set). |

These four are loaded via the same `ExtensionFactory` signatures the loader already uses — no changes to the extension files. If any extension requires modification, that's evidence the abstraction leaked and must be fixed in the interface, not the extension.

## File Change Map

| File | Change |
|------|--------|
| `reeboot/src/runtime/support-runtime.ts` | **NEW** — `SupportRuntime` class (shared singleton, chat registry, bounded memory) |
| `reeboot/src/runtime/support-chat.ts` | **NEW** — `SupportChat` class (per-chat state, event emitter, reeboot-shaped events) |
| `reeboot/src/runtime/agent-loop.ts` | **NEW** — minimal agent loop (LLM call → tool execution → events) |
| `reeboot/src/extensions/support-adapter.ts` | **NEW** — `SupportExtensionAdapter` implementing `ExtensionAPI` |
| `reeboot/src/agent-runner/support-runner.ts` | **NEW** — `SupportAgentRunner` implementing `AgentRunner` |
| `reeboot/src/agent-runner/index.ts` | Add `"support"` case to `createRunner` factory |
| `reeboot/src/extensions/loader.ts` | Add `getSupportFactories()` returning the 4-extension subset (factories only, no pi `ResourceLoader`) |
| `reeboot/tests/runtime/support-adapter.test.ts` | **NEW** — adapter tests (real unsubscribe, event shapes, optional methods) |
| `reeboot/tests/runtime/support-chat.test.ts` | **NEW** — chat isolation, event emission, listener cleanup |
| `reeboot/tests/runtime/support-runtime.test.ts` | **NEW** — multi-chat host, bounded memory, idle eviction |
| `reeboot/tests/runtime/support-runner.test.ts` | **NEW** — AgentRunner contract, abort/cancel, turn flow |
| `reeboot/tests/runtime/extension-subset.test.ts` | **NEW** — 4 extensions run unchanged through adapter #2 |

## Risks

**The agent loop is too minimal.** A non-streaming, single-provider loop won't be production-ready. Mitigation: this request proves the abstraction and the multi-chat foundation; production hardening (streaming, retries, multi-provider) is explicitly a follow-up. The orchestrator already handles timeouts and rate-limit retries at its layer.

**Extension assumptions about pi.** An extension might reach for pi-specific behaviour (e.g. `getAllTools()` returning pi's tool objects). Mitigation: the adapter implements `getAllTools()` from the chat's tool registry. If an extension breaks, that's the seam — document it and decide whether to fix the interface or the extension.

**DB divergence.** `observability` and `token-meter` write to `better-sqlite3`. Support deployments may use Postgres. Mitigation: `ExtensionContext.db` is typed `any`; the runtime passes whatever DB it has. For this request, the runtime uses the existing `getDb()` singleton (better-sqlite3) to prove the flow; a Postgres adapter is a follow-up.

**Orchestrator dynamic chat creation.** The orchestrator currently receives a fixed `Map<string, AgentRunner>`. For support, chats are dynamic (new peer = new chat). Mitigation: this request implements the runner + runtime; the orchestrator integration (dynamic runner creation per-peer) is a follow-up. For now, `SupportAgentRunner` can be instantiated per-context and the runtime manages chats internally keyed by a chatId derived from the context.

**Memory bounds are untested at scale.** The `maxHistoryPerChat` and `idleTtlMs` caps are designed but won't be load-tested. Mitigation: unit tests verify the caps trigger eviction; production load testing is a follow-up.

## Tradeoffs

**Why a separate `SupportRuntime` rather than reusing pi's agent loop?** Pi's `AgentSession` is designed for one heavy coding session — it loads all resources, binds a full extension runner, manages file-based sessions. Spinning up N of these per process is the cost we're eliminating. The support runtime shares one model client config and creates lightweight per-chat state (an emitter + history array + tool registry), which is orders of magnitude cheaper.

**Why implement `AgentRunner` rather than a new interface?** The `AgentRunner` interface (`prompt/abort/dispose/reset`) is already clean and SDK-agnostic. Implementing it means the support runner plugs into the existing orchestrator, channels, and inactivity timers with zero changes to those systems. The interface only needs to change if the runtime forces it — it doesn't.

**Why identity transforms in the support adapter?** The chat emits events in reeboot's own shapes already (it's not wrapping an external SDK's events). So the adapter's `transformEvent` is identity for most events — the events are born in reeboot shape. This is the proof that the shapes are genuinely SDK-agnostic: adapter #1 (pi) transforms pi → reeboot; adapter #2 (support) emits reeboot directly. The contrast between the two adapters validates the seam.

**Why not port all 17 extensions?** The 4-extension subset exercises every event type and optional method in the interface. Porting all 17 would include coding tools (bash, read, edit) that support chats don't need. The subset proves the pattern; the rest can follow when needed.
