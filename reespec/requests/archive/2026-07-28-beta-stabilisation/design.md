# Beta-stabilisation — design

## Overview

Nine work items to reach a stable, deployable baseline for both pi and ree modes. Each item is independent enough to be a separate task, but several share files (config.ts, server.ts, orchestrator.ts, web.ts, interface.ts).

---

## 1. Config schema: add `sdk` and `ree` fields

The Zod `ConfigSchema` in `src/config.ts` must declare `sdk` and `ree` so they survive `loadConfig()` instead of being silently stripped.

```typescript
// Added to ConfigSchema:
const ConfigSchema = z.object({
  sdk: z.enum(['pi', 'ree']).default('pi'),
  ree: ReeConfigSchema.default({}),
  // ... existing fields
});
```

The `ReeConfigSchema` mirrors what `createRunner` and `ree-runner.ts` already read via `(config as any)` casts:

```typescript
const ReeConfigSchema = z.object({
  maxChats: z.number().int().positive().default(200),
  idleTtlMs: z.number().int().positive().default(1_800_000),      // 30 min
  maxHistoryPerChat: z.number().int().positive().default(50),
  systemPrompt: z.string().default(''),
  maxIterations: z.number().int().positive().default(5),
  model: ModelConfigSchema.optional(),
  mcp: McpConfigSchema.optional(),
});
```

The `(config as any)` casts in `src/agent-runner/index.ts`, `src/agent-runner/ree-runner.ts`, and `src/runtime/ree-runtime.ts` are updated to use the typed fields.

**Why optional `ree.model` and `ree.mcp`**: they default to `agent.model` / `mcp` if absent, preserving backward compatibility. Only set them when the ree deployment needs different model or MCP servers than the pi config would specify.

## 2. Entrypoint: strip env-var config generation

The container entrypoint (`container/entrypoint.sh`) currently has three steps:
1. Write `REEBOOT_AGENTS_MD` if set
2. If `config.json` exists, start directly
3. If no config, translate `REEBOOT_*` env vars into CLI flags and run the wizard non-interactively

Step 3 is removed. If `config.json` does not exist, the entrypoint prints an error message and exits 1.

New behaviour:

```bash
if [ -f "${CONFIG_FILE}" ]; then
  exec node dist/index.js start --no-interactive "$@"
fi

echo "Error: No config.json found at ${CONFIG_FILE}"
echo ""
echo "To deploy reeboot:"
echo "  1. Create a config file at ${CONFIG_FILE} with your settings"
echo "  2. Or mount your config directory: docker run -v /path/to/config:${HOME}/.reeboot ..."
echo "  3. Or run 'reeboot init' interactively on a native install"
exit 1
```

`REEBOOT_AGENTS_MD` injection (Step 1) is preserved — it's the only env var that makes sense without a config file (persona injection for docker-compose setups that already mount config).

`REEBOOT_HOST` is also preserved as a convenience — it maps to the bind address, separate from config.

## 3. Cancel: proper bus signal for turn abort

Current state: the WS handler on `type: "cancel"` publishes `createIncomingMessage({ content: "__cancel__" })`. The orchestrator sees a busy context and **queues** this magic string as a normal message. It's never interpreted as a cancel.

Fix: add an optional `action?: 'cancel'` field to `IncomingMessage`.

```typescript
export interface IncomingMessage {
  channelType: string;
  peerId: string;
  content: string;
  timestamp: number;
  raw: unknown;
  channelId?: string;
  trust?: MessageTrust;
  fromSelf?: boolean;
  /** If set to 'cancel', signals the orchestrator to abort the running turn */
  action?: 'cancel';
}
```

The orchestrator's `_handleMessage` checks for `action === 'cancel'` when the context is busy — instead of queuing, it calls `runner.abort()` on the current runner and returns without dispatching.

```typescript
private _handleMessage(msg: IncomingMessage): void {
  // ... resolve context, get state ...

  if (state.busy) {
    if (msg.action === 'cancel') {
      const runner = this._runners.get(contextId);
      if (runner) runner.abort();
      return;
    }
    // ... existing queue logic ...
  }

  this._dispatch(contextId, msg);
}
```

The WS handler sends the cancel as a proper action message instead of the `__cancel__` magic string:

```typescript
if (msg.type === 'cancel') {
  if (_bus) {
    _bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: contextId,
      content: '',
      raw: null,
      action: 'cancel',
    }));
  }
  ws.send(JSON.stringify({ type: 'cancelled' }));
  return;
}
```

## 4. WS send function: fix duplicate event streaming

Current state (uncommitted code): the WS handler's `wsSend` function receives `MessageContent` from the orchestrator's `adapter.send()` call and fabricates `text_delta` + `message_end` events. But the orchestrator's `onEvent` callback also forwards every `RunnerEvent` through `adapter.sendEvent()` — which the WS handler pipes through `wsEvent`. Result: every text response generates **two** `text_delta` events and **two** `message_end` events.

Fix: the `wsSend` function should faithfully serialize `MessageContent` to JSON and send it as a complete message event, **not** break it into streaming events. The streaming events (`text_delta`, `tool_call_*`, `message_end`) already arrive through `wsEvent` from the orchestrator's event forwarding.

```typescript
const wsSend = (content: any) => {
  ws.send(JSON.stringify({ type: 'message', content }));
  return Promise.resolve();
};
```

This means the SPA receives a `{ type: 'message', content: { type: 'text', text: '...' } }` event for the final reply, while the streaming events (`text_delta`, `tool_call_start`, etc.) update the UI incrementally. The SPA's current `handleWSMessage` already handles both paths — `text_delta` for streaming and `message_end` for completion — but it doesn't handle a `message` event. This requires adding a handler for `type: 'message'` to the SPA, or alternatively **skipping** the `adapter.send()` call for web and relying entirely on the event-streaming path.

Chosen approach: **skip `adapter.send()` for the web channel** and rely entirely on `sendEvent`. The orchestrator calls `adapter.send()` as the final reply delivery, but for streaming channels like web, the events already carry all the information. The `wsSend` function becomes a no-op, or better, the web channel's `send` method returns immediately without forwarding. This eliminates duplication at the source rather than adding another SPA handler.

```typescript
// In the WS handler's onOpen:
const wsSend = async () => {}; // no-op — streaming events deliver everything
const wsEvent = (event: any) => {
  try { ws.send(JSON.stringify(event)); } catch { /* connection may be closed */ }
};
```

This is safe because the orchestrator's `onEvent` callback always fires `message_end` when the turn completes, which the SPA already handles to finalize the message.

## 5. Web-channel-routing: fill test gaps

The existing `tests/web-channel-routing.test.ts` covers WebAdapter event streaming, orchestrator forwarding, and session persistence — but is missing tests for:

- WS handler publishing messages to the bus (task 3 RED)
- Cancel flow (task 3 abort)
- Full history persistence across multiple turns (task 5)

These are added as new `describe` blocks in the existing test file. Each uses mocked `WebSocket` instances and spies on `_bus.publish` / runner methods.

See specs/ for detailed scenarios.

## 6. SPA: per-connection peer ID

Current state: the SPA and WS handler both use `contextId` (the URL param, always `"main"`) as the peer identifier for WebAdapter registration. Two browser tabs sharing the same URL would overwrite each other's peer registration.

Fix: the SPA generates a unique peer ID per WebSocket connection on `onOpen` and sends it to the server. The WS handler uses this peer ID for WebAdapter registration instead of `contextId`.

**Approach**: the SPA generates a `sessionId` (via `crypto.randomUUID()`) on initialisation. On `onOpen`, the server responds with the assigned session ID (for backward compat), but the SPA sends its own ID in the first message. The WS handler registers the peer by this client-generated ID.

Simpler alternative: the WS handler generates a `nanoid()` per connection (as the original unmodified code did before this refactor) and uses that for peer registration, while still using `contextId` for routing. The `contextId` becomes purely a routing key to the orchestrator runner, not a peer identity.

Chosen approach: **server generates a `nanoid()` per WS connection** for peer registration, stores it, and sends it back in the `connected` event. The `contextId` URL param is used only for routing resolution. This matches the original pre-refactor code and requires no SPA changes.

```typescript
// In the WS handler's onOpen:
const sessionId = nanoid();
webAdapter.registerPeer(sessionId, wsSend, wsEvent);
ws.send(JSON.stringify({ type: 'connected', contextId, sessionId }));
```

All subsequent messages from the SPA carry `sessionId` so the WS handler knows which peer to route replies to. The SPA already sends `{ type: 'message', content }` — the WS handler adds `sessionId` to the `IncomingMessage.peerId` field.

This also means the cancel message uses the correct peer ID.

## 7. session_search in ree mode

Current state: `getReeFactories` does not include the memory-manager extension, so `session_search` is not registered in ree mode.

Fix: add a ree-compatible `session_search` tool registration to the ree adapter or as a new factory in `getReeFactories`. The tool queries the `chat_messages` table (ree's per-chat history store) scoped to the current chat, rather than the global `messages` table.

The tool needs access to the current chat ID, which it gets from the extension context. The `ReeExtensionAdapter` exposes conversation context (including chatId) to extensions through the `ExtensionAPI`. The extension can read the current chatId and pass it to a ree-specific search function.

**Implementation**: a lightweight `ree-search` extension file that registers a tool with the same name (`session_search`) but queries `chat_messages WHERE chat_id = ?`. Registered as a fifth factory in `getReeFactories`.

The tool's `execute` function receives the chat ID from the adapter context and scopes its FTS query:

```typescript
// Pseudo-code for the ree session_search tool
execute: async () => {
  const chatId = api.getCurrentChatId();    // provided by ReeExtensionAdapter
  const db = getReeHistoryDb();
  const results = db.prepare(
    `SELECT role, content, created_at FROM chat_messages
     WHERE chat_id = ? AND content MATCH ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(chatId, query, limit);
  return { results };
}
```

## 8. API routes: guard pi-specific endpoints

Endpoints that query Oracle tables or pi-specific state return empty or misleading results in ree mode. They are not crashes, but for deployment clarity:

- `/api/contexts` — returns `[]` in ree mode (contexts table is not used; ree uses chats table). Add a guard: if mode is ree, return empty array explicitly.
- `/api/tasks` — same: return `[]` in ree mode.
- `/api/contexts/:id/sessions` — return `[]` in ree mode (sessions are pi-specific).

Other endpoints (health, status, channels, budget, logs, reload) work correctly in both modes.

**Implementation**: a helper function that checks `_orchestrator?.runners?.values()?.next()?.value?.constructor?.name` or more simply, reads `(config as any).sdk` via a module-level reference. A lightweight function:

```typescript
function isReeMode(): boolean {
  return (appConfig as any)?.sdk === 'ree';
}
```

Used in the three endpoints to return empty data early.

## 9. Commit uncommitted changes

All uncommitted changes from two in-flight requests must be landed:
- `web-channel-routing`: modified `server.ts`, `web.ts`, `orchestrator.ts`, new `tests/web-channel-routing.test.ts`
- `docker-integration-tests`: new `tests/docker-integration/` directory with all scripts, configs, AGENTS.md
- Deleted request artifacts: `reespec/requests/sdk-pluggability/`, `reespec/requests/webchat-ui/`
- Updated task files: `reespec/requests/docker-integration-tests/tasks.md`, `reespec/decisions.md`

This is a coordination task: ensure all file changes are consistent, no debug code remains, tests pass, then commit.

---

## Dependency graph

```
Task 1 (config schema) ──────┬── Task 8 (API route guards)
                              │
Task 3 (cancel) ─────────────┤── Task 9 (commit)
                              │
Task 4 (wsSend fix) ─────────┤
                              │
Task 5 (test gaps) ──────────┤
                              │
Task 2 (entrypoint) ─────────┤
                              │
Task 6 (SPA peer ID) ────────┤
                              │
Task 7 (session_search) ─────┘
```

Tasks 1-8 are independent in terms of code changes (different files or different sections of the same file) but are best done in the order listed to avoid merge conflicts. Task 9 is last.

## Risks

- **WebSocket streaming duplicate events**: the chosen fix (no-op wsSend) means the SPA must handle the complete flow from `text_delta` + `message_end` events only. If the SPA was depending on receiving a final `message` event from `wsSend`, it will break. Audit: the current SPA `Chat.tsx` handles `text_delta`, `tool_call_start`, `tool_call_end`, `message_end`, `error`, and `cancelled` — it does NOT handle a `message` event. So the no-op approach is safe.
- **session_search in ree mode**: the `ReeExtensionAdapter` must expose `getCurrentChatId()` (or similar). This is a small interface change to the `ExtensionAPI`. Existing pi extensions are unaffected (they don't call this method).
- **Entrypoint behaviour change**: anyone using `docker run -e REEBOOT_PROVIDER=...` without a config file will get an error instead of a working deployment. The error message directs them to the correct approach. This is intentional.
