# Design — ree-sdk

## Concrete references (read these first)

Before implementing, the agent MUST read these files to understand the exact interfaces:

- `reeboot/src/extensions/extension-api.ts` — the `ExtensionAPI` interface, `ExtensionEventMap`, all event payload types, `ToolDefinition`, `ExtensionContext`, `ExtensionFactory` type (`(api: ExtensionAPI) => void | Promise<void>`).
- `reeboot/src/extensions/pi-adapter.ts` — adapter #1 (reference implementation). Shows how `transformEvent()` works, how `context` is built, how `on()` subscribes. The ree adapter is structurally similar but wraps a `ReeChat` instead of pi.
- `reeboot/src/extensions/loader.ts` — `getBundledFactories(context, config)` and the `withAdapter` wrapper. `getReeFactories` (this request) is the ree-mode analogue but WITHOUT `withAdapter` (see "Factory pattern" below).
- `reeboot/src/agent-runner/interface.ts` — the `AgentRunner` interface (`prompt`/`abort`/`dispose`/`reset`/`reload`/`getSessionPath?`), `RunnerEvent` union, `ContextConfig`, `MessageTrust`.
- `reeboot/src/agent-runner/pi-runner.ts` — adapter #1 runner (reference). Shows `PROVIDER_ENV_VARS` and `resolveProviderEnvKey()` for API key resolution (reused by ree).
- `reeboot/src/agent-runner/index.ts` — the `createRunner` factory (the seam this request extends).
- `reeboot/src/extensions/observability.ts` — `makeObservabilityExtension(api, db, opts)` signature (named export).
- `reespec/decisions.md` — the 5 `ree-sdk` decisions (one SDK per process, TanStack AI, durability at reeboot layer, no consolidation, auth-gated tools).

## Architecture

`ree` is a second `AgentRunner` implementation that hosts many lightweight chats in one process, backed by **TanStack AI** as the agent-loop library. It plugs into the existing `createRunner` factory (`config.sdk = "ree"` or `config.agent.runner = "ree"`) and the orchestrator routes messages to it unchanged. A reeboot process runs exactly one SDK — a ree instance is purely a dynamic-chat host with no owner/static context (see `decisions.md`, "ree-sdk: one SDK per process").

```
                         createRunner(context, config)
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
           config.sdk = "pi"            config.sdk = "ree"
                    │                            │
            PiAgentRunner               ReeAgentRunner
          (1 heavy pi session)          (manages N chats internally)
                                              │
                                    ┌─────────┴──────────┐
                                    ▼                    ▼
                            ReeRuntime          ReeExtensionAdapter
                          (shared singleton)    (implements ExtensionAPI,
                           ├ TanStack client     real unsubscribe,
                           ├ shared config       per-chat event bridge)
                           ├ chat registry
                           └ per-chat history store
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                      ReeChat               ReeChat
                      (chat A state)        (chat B state)
                      ├ EventEmitter        ├ EventEmitter
                      ├ tool registry       ├ tool registry
                      ├ bounded history     ├ bounded history
                      ├ AbortController     ├ AbortController
                      └ TanStack chat()    └ TanStack chat()
```

### The three layers

**ReeRuntime** (shared singleton, one per process)
- Holds shared resources: TanStack AI model client config (provider + model resolved from reeboot config), provider credentials, the extension factory list (loaded once), global scheduler/db references.
- Owns the chat registry: `Map<chatId, ReeChat>`.
- Owns the per-chat history store (reeboot-owned — see "Per-chat history persistence" below).
- Creates and disposes chats. Enforces bounded memory: idle chats are evicted after a configurable TTL (LRU); a `maxChats` cap is enforced.
- This is the "lightweight" alternative to spinning up a full pi process per chat. One process, one runtime, N chats.

**ReeChat** (one per conversation)
- Isolated per-chat state: message history (bounded array), tool registry (per-chat tool instances), `EventEmitter`, `AbortController`.
- Emits reeboot-defined events (`before_agent_start`, `turn_end`, `session_shutdown`, `agent_end`, `tool_call`, `tool_result`, `after_provider_response`) in reeboot's own shapes — NOT TanStack-shaped payloads.
- Holds a `ReeExtensionAdapter` instance that bridges this chat's emitter to extensions.
- Owns a TanStack AI `chat()` run per turn: the async iterable is consumed by `ReeAgentRunner.prompt()` and translated into `RunnerEvent`s and reeboot-shaped extension events.
- On `dispose()`: calls every registered unsubscribe, clears the emitter, drops message history, persists final state to the history store. This is the leak-prevention boundary.

**ReeExtensionAdapter** (one per chat, implements `ExtensionAPI`)
- `registerTool()` → adds to the chat's tool registry. TanStack AI tools are wrapped from reeboot's `ToolDefinition` shape so extensions register tools the same way they do on pi.
- `on()` → subscribes to the chat's `EventEmitter`, returns a **real unsubscribe** that removes the listener. Handlers receive reeboot-typed events (the chat emits them in reeboot shape already, so the adapter's transform is identity for most events — but it exists as the seam where transformation would happen if shapes diverged).
- `setSessionName`/`getSessionName`/`sendMessage` → operate on chat-local state (no pi delegation).
- `context` → built from the runtime's shared config + chat-local cwd/sessionId.
- This is adapter #2. It proves the `ExtensionAPI` abstraction is genuine: wherever it can forward unchanged, the abstraction is real; wherever it must transform, that's the documented seam.

### The agent loop (TanStack AI-backed)

`ReeAgentRunner.prompt()` runs the agent loop by consuming a TanStack AI `chat()` async iterable. Unlike the `support-runtime`'s hand-rolled minimal loop, TanStack AI provides the tool-calling, streaming, and provider abstraction; we own the loop control and the event translation.

```
1. Emit before_agent_start (system prompt + options)
2. Call TanStack chat({ model, messages, tools, mcp, abortController })
   → returns AsyncIterable<StreamChunk>
3. For each chunk in the stream:
   - TEXT_MESSAGE_CONTENT chunk → emit text_delta RunnerEvent + accumulate
   - TOOL_CALL_* chunk → emit tool_call event, look up tool, execute (thread AbortSignal),
     emit tool_result event (TanStack feeds the result back into the next iteration)
   - RUN_* lifecycle chunk → track start/finish
4. On provider response metadata → emit after_provider_response (status, contextId, provider)
5. On stream end → emit turn_end (turnId, sessionId, usage), agent_end (messages)
6. Persist user+assistant messages to the per-chat history store
7. Resolve prompt()
```

TanStack AI's `agentLoopStrategy` (default `maxIterations(5)`, composable via `combineStrategies`) controls when the loop stops. We pass a strategy derived from reeboot config so the loop bounds are configurable. The `AbortController` is threaded into `chat()` and every `tool.execute()` — aborting the chat aborts the stream and any in-flight tool.

### Why TanStack AI

Per `decisions.md` ("ree-sdk: TanStack AI as the foundation library"): TanStack AI is a pure library where we own the loop (`chat()` → `AsyncIterable<StreamChunk>` consumed directly on the server — no HTTP/UI required). It is the lightest candidate (5 core deps, ~44KB gzip), MIT-licensed, has no platform association, and gives us tool calling, MCP (`@tanstack/ai-mcp`), multi-provider (`@tanstack/ai-openai`/`-anthropic`/etc. + `openaiCompatible` for Ollama), and streaming natively. The accepted risk: it is beta (v0.39.x, pre-1.0) — expect breaking changes. The insurance: reeboot's `ExtensionAPI` adapter insulates the harness; a future swap to Vercel AI SDK is feasible without rewriting extensions. Vercel AI SDK is the documented fallback if TanStack's beta churn proves unmanageable.

### Cancellation

`ReeAgentRunner.abort()` calls the chat's `AbortController.abort()`. The signal is threaded into:
- The TanStack `chat()` call (aborts the stream and the underlying provider HTTP request).
- Every `tool.execute()` call (the 5-param `execute` signature's `signal` parameter — load-bearing here).
- The agent loop checks `signal.aborted` between chunks and stops.

This is the critical difference from pi: pi's `abort()` calls `session.abort()` but doesn't thread `AbortSignal` into tool execution. The ree runtime does.

### Listener lifecycle (the #1 correctness property)

```
ReeChat.dispose():
  for each (event, handler) registered via adapter.on():
    chat.emitter.off(event, handler)     ← REAL removal
  adapter._handlers.clear()
  chat.emitter.removeAllListeners()
  chat.history = []
  chat.persistFinalState()                ← write to history store
  chat.emit('session_shutdown', { sessionId, reason })
```

Every `on()` returns a real unsubscribe. Chat teardown removes every listener. No no-ops. This is non-negotiable at hundreds-of-chats scale.

### Bounded memory

- **Message history**: capped at `maxHistoryPerChat` (default 50 messages). Older messages are dropped (FIFO). No compaction in this request — just a hard cap. The persisted history store is pruned on handoff/idle-eviction (design decision: the store keeps only active chats' recent history; disposed chats' history is deleted or marked pruned).
- **Idle chat eviction**: chats with no activity for `idleTtlMs` (default 30 min) are disposed and removed from the registry. The orchestrator's inactivity timer already calls `runner.reset()`; the ree runtime's `reset()` disposes the chat and lets a new one be created lazily on the next prompt.
- **Tool registry**: per-chat, but tool *instances* are lightweight (the shared factory creates them; per-chat state is minimal).

### Per-chat history persistence (reeboot-owned)

Per `decisions.md` ("ree-sdk: durability lives at the reeboot layer, not in the agent SDK"): ree needs its OWN per-chat conversation-history persistence that survives process restart. This is NOT pi's `SessionManager` file (that format is pi-shaped and per-context, not reusable by a TanStack-based loop).

**v1 minimal shape**: a `chats` table and a `chat_messages` table (or an extension of the existing `messages` table with a `chat_id` + `mode` key — the exact schema is a design decision in the tasks). The `ReeRuntime` writes user+assistant messages per turn and reads history on chat resume (lazy chat creation loads recent history from the store by `chatId`).

**Hard dependency on roadmap items**: the full `messages`-table write rule for ree mode (skip / route / tag-and-exclude) and the `session_search` gating review are tracked in `reespec/roadmap.md` as reeboot-layer follow-ups. The `ree-sdk` adapter must not break when those rules change — it writes to its own `chats`/`chat_messages` store, and the orchestrator-level `messages` write is a separate concern. v1 keeps the two stores distinct to avoid coupling.

### Extension subset

Four extensions run through the ree adapter, chosen because they exercise the core event surface and are obviously ree-relevant:

| Extension | Events used | Why included |
|---|---|---|
| `observability` | `session_shutdown`, `after_provider_response` | Proves the adapter delivers reeboot-shaped events (sessionId, contextId, provider). Writes to DB. |
| `session-name` | `registerCommand`, `setSessionName`/`getSessionName` | Proves optional methods work on a second adapter. |
| `token-meter` | `agent_end` | Proves `agent_end` with `messages` flows through. Reads usage. |
| `capabilities` | `before_agent_start`, `getAllTools` | Proves system-prompt injection and tool discovery work. Must be loaded last (sees full tool set). |

These four are loaded via the same `ExtensionFactory` signatures the loader already uses — no changes to the extension files. If any extension requires modification, that's evidence the abstraction leaked and must be fixed in the interface, not the extension.

### Config shape and SDK resolution

The `createRunner` factory currently reads `config.agent.runner`. The canonical knob is `config.sdk`; `config.agent.runner` is a backward-compatible alias. Resolution logic (implement exactly):

```ts
const sdk = (config as any).sdk ?? (config as any).agent?.runner ?? 'pi';
if (sdk === 'pi') return new PiAgentRunner(...);
if (sdk === 'ree') return new ReeAgentRunner(...);
throw new Error(`Unknown sdk: ${sdk}`);
```

Config shape:
```jsonc
{
  "sdk": "ree",                       // canonical ("pi" | "ree")
  "agent": { "runner": "ree" },       // backward-compatible alias
  "ree": {
    "maxChats": 200,
    "idleTtlMs": 1800000,
    "maxHistoryPerChat": 50,
    "model": { "provider": "openai", "id": "gpt-4o" },
    "mcp": { "servers": { /* same shape as mcp-manager config */ } }
  }
}
```

When `sdk === "ree"`, `createRunner` builds a `ReeRuntime` (shared singleton) and returns a `ReeAgentRunner` wrapping it. The orchestrator receives a single-runner map (`Map<default-context, ReeAgentRunner>`); the runner manages chats internally keyed by `chatId` (derived from peer + channel).

### Factory pattern — how getReeFactories differs from getBundledFactories

This is the critical difference a smaller agent must understand:

**Pi mode** (`getBundledFactories` in `loader.ts`): pi's `DefaultResourceLoader` calls each factory with pi's `ExtensionAPI` as the `pi` argument. The `withAdapter` wrapper intercepts: `(pi) => { const adapter = new PiExtensionAdapter(pi, ctx); return init(adapter); }`. So pi-mode factories take `(pi: any) => void`.

**Ree mode** (`getReeFactories`): there is NO `DefaultResourceLoader` and NO `pi` argument. The `ReeRuntime` calls each factory directly with a `ReeExtensionAdapter` as the `api` argument. So ree-mode factories take `(api: ExtensionAPI) => void` — the standard `ExtensionFactory` signature. No `withAdapter` wrapper is needed.

```ts
// ree-mode factory pattern (contrast with pi's withAdapter)
export function getReeFactories(config: Config): ExtensionFactory[] {
  const factories: ExtensionFactory[] = [];

  // observability: makeObservabilityExtension(api, db, opts)
  factories.push(async (api) => {
    const mod = await importExt('observability');
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const threshold = (config as any)?.logging?.rate_limit_warn_threshold ?? 5000;
    const configProvider = (config as any)?.agent?.model?.provider ?? 'unknown';
    mod.makeObservabilityExtension(api, db, { rateLimitWarnThreshold: threshold, configProvider });
  });

  // session-name: default(api)
  factories.push(async (api) => {
    const mod = await importExt('session-name');
    if (mod?.default) mod.default(api);
  });

  // token-meter: default(api)
  factories.push(async (api) => {
    const mod = await importExt('token-meter');
    if (mod?.default) mod.default(api);
  });

  // capabilities: default(api, config) — loaded LAST (sees full tool set)
  factories.push(async (api) => {
    const mod = await importExt('capabilities');
    if (mod?.default) mod.default(api, config);
  });

  return factories;
}
```

The `importExt` helper (try `.js` then `.ts`) is reused from the existing loader. The 4 extension init signatures, exactly:
- `observability`: `makeObservabilityExtension(api, db, opts)` — named export
- `session-name`: `default(api)` — default export
- `token-meter`: `default(api)` — default export  
- `capabilities`: `default(api, config)` — default export, takes config as 2nd arg

### ExtensionContext construction for ree

Pi-mode builds the context by merging loader-provided base + pi's runtime context (ui, hasUI, cwd, sessionManager, modelRegistry). Ree has no pi runtime context — the `ReeRuntime` builds the full `ExtensionContext` from scratch per chat:

```ts
const ctx: ExtensionContext = {
  cwd: chat.workspacePath,
  workspacePath: chat.workspacePath,
  config: runtime.config,        // shared reeboot config
  db: getDb(),                   // from ../db/index.js singleton
  scheduler: runtime.scheduler,  // if available
  ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
  hasUI: false,                   // ree is always headless
};
```

### TanStack StreamChunk → RunnerEvent + extension event mapping (v0.39)

TanStack AI's `chat()` returns `AsyncIterable<StreamChunk>` of AG-UI protocol events (`@ag-ui/core` EventType enum). The ree agent loop consumes these and translates them to BOTH `RunnerEvent`s (for the orchestrator) AND reeboot-shaped extension events (for the `ReeExtensionAdapter`).

**v0.39 actual event types** (from `@ag-ui/core`):
- `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` (delta), `TEXT_MESSAGE_END`
- `TOOL_CALL_START` (toolCallId, toolCallName), `TOOL_CALL_ARGS` (delta), `TOOL_CALL_END` (toolCallId)
- `TOOL_CALL_RESULT` (toolCallId, content) — emitted after tool execution completes
- `RUN_STARTED`, `RUN_FINISHED` (threadId, runId), `RUN_ERROR`
- `STEP_STARTED`, `STEP_FINISHED`

Exact mapping (v0.39 actual):

| TanStack StreamChunk | RunnerEvent (to onEvent) | Extension event (to chat emitter) |
|---|---|---|
| `TEXT_MESSAGE_CONTENT` (delta) | `{ type: 'text_delta', delta }` | (accumulate, no extension event) |
| `TEXT_MESSAGE_START` / `END` | (no RunnerEvent) | (accumulate) |
| `TOOL_CALL_START` (toolCallId, toolCallName) | `{ type: 'tool_call_start', toolCallId, toolName, args: {} }` | `tool_call` event (`{ type: 'tool_call', toolCallId, toolName, args }`) |
| `TOOL_CALL_ARGS` (delta JSON) | (accumulate args) | (accumulate args for tool_call) |
| `TOOL_CALL_END` | (no RunnerEvent — args complete here) | (tool execution happens here) |
| `TOOL_CALL_RESULT` (after execution) | `{ type: 'tool_call_end', toolCallId, toolName, result, isError }` | `tool_result` event (`{ type: 'tool_result', toolCallId, toolName, input, content, isError }`) |
| `RUN_STARTED` | (no RunnerEvent) | `before_agent_start` event |
| `RUN_FINISHED` | `{ type: 'message_end', runId, usage: { input, output } }` | `turn_end` event then `agent_end` event |
| provider response metadata | (no RunnerEvent) | `after_provider_response` event |

**Field name gotcha**: `ToolCallEvent` uses `args` (the call arguments), but `ToolResultEvent` uses `input` (preserved from the original call). The loop must emit `tool_call` with `args` and `tool_result` with `input` — these are different field names for the same data, per `extension-api.ts`.
| `TOOL_CALL_END` / tool result | `{ type: 'tool_call_end', toolCallId, toolName, result, isError }` | `tool_result` event (`{ type: 'tool_result', toolCallId, toolName, input, content, isError }`) |
| `RUN_STARTED` | (no RunnerEvent) | `before_agent_start` event |
| `RUN_FINISHED` | `{ type: 'message_end', runId, usage: { input, output } }` | `turn_end` event (`{ turnId, sessionId, turnIndex, message, toolResults, usage }`) then `agent_end` (`{ messages }`) |
| provider response metadata | (no RunnerEvent) | `after_provider_response` (`{ contextId, provider, status, headers }`) |

**Field name gotcha**: `ToolCallEvent` uses `args` (the call arguments), but `ToolResultEvent` uses `input` (preserved from the original call). The loop must emit `tool_call` with `args` and `tool_result` with `input` — these are different field names for the same data, per `extension-api.ts`.

### Tool execution — exact signature

The `ToolDefinition.execute` method (from `extension-api.ts`) has this exact 5-param signature:
```ts
execute(toolCallId: string, params: TParams, signal: AbortSignal | undefined, onUpdate: ((details: TDetails) => void) | undefined, ctx: ExtensionContext): Promise<ToolResult<TDetails>>
```

When the ree loop executes a tool (on `TOOL_CALL_*` from TanStack), it must:
1. Look up the tool by name in the chat's tool registry (`adapter.getAllTools()` or a direct registry lookup)
2. Call `tool.execute(toolCallId, args, signal, onUpdate, ctx)` where `signal` is the chat's `AbortSignal`, `onUpdate` is a callback that emits `tool_execution_update` events, and `ctx` is the chat's `ExtensionContext`
3. Wrap the `ToolResult` into the `tool_result` event shape (`content`, `isError`, `details`)
4. Feed the result back to TanStack AI for the next iteration (TanStack handles the feedback loop internally when using `chat()` with `tools`)

### TanStack chat() call shape (v0.39 API)

```ts
import { chat, toolDefinition, maxIterations } from '@tanstack/ai';
import { openaiText } from '@tanstack/ai-openai';
import { createMCPClient } from '@tanstack/ai-mcp';

const stream = chat({
  adapter: openaiText('gpt-4o'),  // adapter, NOT model (v0.39 API)
  messages: chat.history,         // reeboot-owned history array (ModelMessage[])
  systemPrompts: [systemPrompt],  // system prompt as array
  tools: tanstackTools,           // ServerTool[] from toolDefinition().server()
  mcp: mcpClients ? { clients: mcpClients, connection: 'keep-alive' } : undefined,
  abortController: chat.abortController,
  agentLoopStrategy: maxIterations(config.ree.maxIterations ?? 5),
});

for await (const chunk of stream) {
  // chunk.type is from @ag-ui/core EventType enum (string literals)
  // e.g., 'TEXT_MESSAGE_CONTENT', 'TOOL_CALL_START', 'RUN_FINISHED'
}
```

**Key API differences from early research (v0.39 actual):**
- `adapter: openaiText(...)` not `model: openaiText(...)`
- Event types are string literals from `@ag-ui/core` EventType enum
- `ToolCallStartEvent` has `toolCallId` + `toolCallName` (not `toolName`)
- `ToolCallArgsEvent` streams args as JSON deltas (separate event from start)
- `ToolCallEndEvent` signals end of tool call (no args)
- `ToolCallResultEvent` has `toolCallId` + `content` (tool result)
- `RunFinishedEvent` has `threadId` + `runId` (no direct usage data)
- `toolDefinition({ name, description, inputSchema }).server(execute)` for server tools
- `execute(args, context)` where context has `toolCallId`, `abortSignal`, `emitCustomEvent`

The TanStack `toolDefinition()` shape must be converted FROM reeboot's `ToolDefinition` (which has `name`, `description`, `parameters`, `execute`). A converter function `toTanStackTool(reebootTool, ctx)` wraps the `execute` call to pass the correct `signal` and `ctx`.

## File Change Map

| File | Change |
|------|--------|
| `reeboot/src/runtime/ree-runtime.ts` | **NEW** — `ReeRuntime` class (shared singleton, chat registry, bounded memory, history store) |
| `reeboot/src/runtime/ree-chat.ts` | **NEW** — `ReeChat` class (per-chat state, event emitter, reeboot-shaped events) |
| `reeboot/src/runtime/ree-agent-loop.ts` | **NEW** — TanStack-AI-backed agent loop (consume `chat()` async iterable → events) |
| `reeboot/src/runtime/ree-history.ts` | **NEW** — per-chat history persistence (chats/chat_messages tables) |
| `reeboot/src/extensions/ree-adapter.ts` | **NEW** — `ReeExtensionAdapter` implementing `ExtensionAPI` |
| `reeboot/src/agent-runner/ree-runner.ts` | **NEW** — `ReeAgentRunner` implementing `AgentRunner` |
| `reeboot/src/agent-runner/index.ts` | Add `"ree"` case to `createRunner` factory |
| `reeboot/src/extensions/loader.ts` | Add `getReeFactories(config)` returning the 4-extension subset (factories only, no pi `ResourceLoader`) |
| `reeboot/src/db/` | New migration for `chats` / `chat_messages` tables |
| `reeboot/tests/runtime/ree-adapter.test.ts` | **NEW** — adapter tests (real unsubscribe, event shapes, optional methods) |
| `reeboot/tests/runtime/ree-chat.test.ts` | **NEW** — chat isolation, event emission, listener cleanup |
| `reeboot/tests/runtime/ree-runtime.test.ts` | **NEW** — multi-chat host, bounded memory, idle eviction |
| `reeboot/tests/runtime/ree-runner.test.ts` | **NEW** — AgentRunner contract, abort/cancel, turn flow with mock TanStack client |
| `reeboot/tests/runtime/ree-history.test.ts` | **NEW** — per-chat history write/read, isolation, resume |
| `reeboot/tests/runtime/extension-subset.test.ts` | **NEW** — 4 extensions run unchanged through adapter #2 (git-diff assertion) |

## Risks

**TanStack AI is beta.** v0.39.x is pre-1.0; expect breaking changes and unfinished edges. Mitigation: pin the version; thin adapter layer so churn is localized to `ree-agent-loop.ts` and `ree-adapter.ts`; the `ExtensionAPI` insulates extensions. Vercel AI SDK is the documented fallback (see `decisions.md`).

**Extension assumptions about pi.** An extension might reach for pi-specific behaviour (e.g. `getAllTools()` returning pi's tool objects). Mitigation: the adapter implements `getAllTools()` from the chat's tool registry. If an extension breaks, that's the seam — document it and decide whether to fix the interface or the extension.

**Per-chat history store vs. the existing `messages` table.** Two stores could diverge or duplicate. Mitigation: v1 keeps them distinct (the `chats`/`chat_messages` store is ree-owned and pruned on eviction; the orchestrator `messages` write is gated by the roadmap follow-up). The design avoids coupling so the roadmap decision (skip/route/tag) doesn't force a ree-sdk refactor.

**Orchestrator dynamic chat creation.** The orchestrator currently receives a fixed `Map<string, AgentRunner>`. For ree, chats are dynamic (new peer = new chat). Mitigation: this request implements the runner + runtime; `ReeAgentRunner` manages chats internally keyed by a `chatId` derived from the message's peer/channel. The orchestrator integration (dynamic runner creation per-peer) is a follow-up. For now, a ree instance uses a single trivial context mapping to the `ReeAgentRunner`.

**Memory bounds are untested at scale.** The `maxHistoryPerChat` and `idleTtlMs` caps are designed but won't be load-tested. Mitigation: unit tests verify the caps trigger eviction; production load testing is a follow-up.

**MCP client lifecycle in a multi-chat process.** TanStack's `@tanstack/ai-mcp` `createMCPClient` manages connections; if each chat spawns clients, connections multiply. Mitigation: v1 shares MCP clients at the runtime level (not per-chat) where possible; per-chat dynamic toolsets (the auth-gated-tools pattern from discovery) are a follow-up — see `decisions.md` ("ree-sdk: auth-gated dynamic tool sets").

## Tradeoffs

**Why TanStack AI rather than a hand-rolled loop or Vercel AI SDK?** A hand-rolled loop (the `support-runtime` approach) reinvents tool-calling, streaming, MCP, and provider abstraction — exactly the wheels we don't want to reinvent. Vercel AI SDK is the stable, mature alternative, but TanStack AI is lighter, has no platform association, and has stronger per-model type safety. The beta risk is accepted because the `ExtensionAPI` adapter is the insurance. See `decisions.md` for the full reasoning.

**Why a separate `ReeRuntime` rather than reusing pi's agent loop?** Pi's `AgentSession` is designed for one heavy coding session — it loads all resources, binds a full extension runner, manages file-based sessions. Spinning up N of these per process is the cost we're eliminating. The ree runtime shares one TanStack client config and creates lightweight per-chat state (an emitter + history array + tool registry), which is orders of magnitude cheaper.

**Why implement `AgentRunner` rather than a new interface?** The `AgentRunner` interface (`prompt/abort/dispose/reset`) is already clean and SDK-agnostic. Implementing it means the ree runner plugs into the existing orchestrator, channels, and inactivity timers with zero changes to those systems. The interface only needs to change if the runtime forces it — it doesn't.

**Why identity transforms in the ree adapter?** The chat emits events in reeboot's own shapes already (it's not wrapping TanStack's stream chunks as extension events — it translates them to reeboot shape at the loop level). So the adapter's `transformEvent` is identity for most events — the events are born in reeboot shape. This is the proof that the shapes are genuinely SDK-agnostic: adapter #1 (pi) transforms pi → reeboot; adapter #2 (ree) emits reeboot directly. The contrast between the two adapters validates the seam.

**Why not port all 17 extensions?** The 4-extension subset exercises every event type and optional method in the interface. Porting all 17 would include coding tools (bash, read, edit) that ree chats don't need. The subset proves the pattern; the rest can follow when needed.

**Why one SDK per process rather than mixed?** Per `decisions.md`: the isolation between the owner's soul (MEMORY.md consolidation) and transactional customer chats is a deployment-shape fact, not a code-enforcement problem. Two processes with different config is stronger than gating within one process — a bug in the consolidation job literally cannot read customer rows that don't exist in its process. It also simplifies the orchestrator (a ree instance is purely dynamic chats, no static/owner context to coexist with).

## Seam Inventory

Completed during implementation. The `ReeExtensionAdapter` passes through all events because the `ReeChat` emits them in reeboot's own shapes directly. The `PiExtensionAdapter` transforms pi's SDK-specific payloads into reeboot shapes.

| Event | PiExtensionAdapter | ReeExtensionAdapter |
|---|---|---|
| `before_agent_start` | pass-through | pass-through (chat emits reeboot shape) |
| `turn_end` | transform (pi `turnIndex: number` → reeboot `turnId: string`) | pass-through (chat constructs reeboot shape) |
| `session_shutdown` | transform (add `sessionId`) | pass-through (chat owns sessionId) |
| `tool_call` | transform (pi `input` → reeboot `args`) | pass-through (chat constructs reeboot shape) |
| `tool_result` | transform (union → single interface with `input`) | pass-through |
| `after_provider_response` | transform (add `contextId`, `provider`) | pass-through (chat derives from config) |
| `agent_end` | pass-through | pass-through |

**Key finding**: The abstraction is genuine. `ReeExtensionAdapter.on()` is identity — it subscribes to the chat's emitter which already fires reeboot-shaped events. `PiExtensionAdapter.on()` wraps pi's event handler with `transformEvent()` to map pi shapes → reeboot shapes. Both satisfy the same `ExtensionAPI` interface.

**Field name gotcha**: `ToolCallEvent` uses `args` (the call arguments), but `ToolResultEvent` uses `input` (preserved from the original call). PiExtensionAdapter maps pi's `input` → reeboot's `args` for `tool_call`, and ensures `input` is present for `tool_result`. ReeExtensionAdapter constructs both correctly at the chat level.
