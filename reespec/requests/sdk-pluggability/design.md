# Design — sdk-pluggability

## Architecture

### The Adapter Pattern

Extensions depend on `ExtensionAPI` (reeboot-defined). Each SDK provides an adapter that implements this interface. The adapter maps SDK-specific events/methods to reeboot's typed event model.

```
Extension code:
  pi.on('before_agent_start', handler)
       ↓
  PiExtensionAdapter:
    maps 'before_agent_start' → pi's 'before_agent_start' event
    transforms pi's payload → typed BeforeAgentStartEvent
       ↓
  pi SDK:
    receives native event, calls handler with native payload
```

### ExtensionAPI Interface

Defined in `reeboot/src/extensions/extension-api.ts`. Captures only what extensions actually use (extracted from analysis of all 17 extensions):

**Methods:**
- `registerTool(tool: ToolDefinition): void` — used by ALL 17 extensions
- `on(event: T, handler: Handler): () => void` — used by 12 extensions
- `setSessionName?(name: string): void` — used by session-name
- `getSessionName?(): string | undefined` — used by session-name
- `sendMessage?(message, options?): void` — used by scheduler-tool

**Events (15 total in `ExtensionEventMap`):**
- `before_agent_start` — 9 extensions (system prompt injection)
- `session_shutdown` — 4 extensions (cleanup)
- `tool_call` — 3 extensions (security/confirmation)
- `agent_end` — 2 extensions (cleanup)
- `turn_end` — 1 extension (budget tracking)
- `user_bash` — 1 extension (sleep interceptor)
- `after_provider_response` — 1 extension (observability)
- `session_before_switch` — 1 extension (confirm-destructive)
- `session_before_fork` — 1 extension (confirm-destructive)
- `session_before_compact` — 1 extension (custom-compaction)
- `resources_discover` — 1 extension (skill-manager)
- `agent_start`, `turn_start`, `session_start`, `tool_result` — defined for completeness

**Typed events:**
Each event has a clearly defined payload type. The `ExtensionEventMap` interface maps event names to their payload types, enabling TypeScript to infer the correct type in handler functions.

```typescript
export interface ExtensionEventMap {
  'before_agent_start': BeforeAgentStartEvent;
  'tool_call': ToolCallEvent;
  // ... 13 more
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: unknown;
}
```

### PiExtensionAdapter

Bridges pi SDK to reeboot's `ExtensionAPI`. Located in `reeboot/src/extensions/pi-adapter.ts`.

**Responsibilities:**
1. Map reeboot event names to pi event names (often identical)
2. Transform pi's payload format to reeboot's typed events (if needed)
3. Forward `registerTool()` calls to pi's `registerTool()`
4. Provide `ExtensionContext` (workspacePath, config, db, scheduler)

**Event name mapping:**
Pi uses the same event names as reeboot for most events (`before_agent_start`, `tool_call`, `session_shutdown`, etc.). The adapter's mapping is mostly identity. For events where pi uses different names, the adapter transforms.

**Payload transformation:**
Pi's event payloads are often compatible with reeboot's types. When they differ (e.g., pi includes extra fields), the adapter strips or transforms to match the typed interface.

### Loader Changes

`loader.ts` currently passes pi's `ExtensionAPI` directly to extensions:

```typescript
// Before:
const mod = await importExt('budget-manager');
if (mod?.default) mod.default(pi);  // pi is pi's ExtensionAPI
```

After refactoring, the loader passes reeboot's `ExtensionAPI` (via the adapter):

```typescript
// After:
const adapter = new PiExtensionAdapter(piSession, context);
const mod = await importExt('budget-manager');
if (mod?.default) mod.default(adapter);  // adapter implements reeboot's ExtensionAPI
```

The loader creates the adapter once per session and passes it to all extensions.

## File Change Map

| File | Change |
|------|--------|
| `reeboot/src/extensions/extension-api.ts` | **NEW** — `ExtensionAPI` interface, `ExtensionEventMap`, typed event payloads, `ToolDefinition`, `ExtensionContext`, `ExtensionFactory` |
| `reeboot/src/extensions/pi-adapter.ts` | **NEW** — `PiExtensionAdapter` class implementing `ExtensionAPI` |
| `reeboot/src/extensions/budget-manager.ts` | Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with local import |
| `reeboot/src/extensions/capabilities.ts` | Same |
| `reeboot/src/extensions/confirm-destructive.ts` | Same |
| `reeboot/src/extensions/custom-compaction.ts` | Same |
| `reeboot/src/extensions/injection-guard.ts` | Same |
| `reeboot/src/extensions/knowledge-manager.ts` | Same |
| `reeboot/src/extensions/mcp-manager.ts` | Same |
| `reeboot/src/extensions/memory-manager.ts` | Same |
| `reeboot/src/extensions/observability.ts` | Same |
| `reeboot/src/extensions/protected-paths.ts` | Same |
| `reeboot/src/extensions/scheduler-tool.ts` | Same |
| `reeboot/src/extensions/session-name.ts` | Same |
| `reeboot/src/extensions/skill-manager.ts` | Same |
| `reeboot/src/extensions/token-meter.ts` | Same |
| `reeboot/src/extensions/trust-enforcer.ts` | Same |
| `reeboot/src/extensions/web-search.ts` | Same |
| `reeboot/src/extensions/loader.ts` | Create `PiExtensionAdapter`, pass it to extensions instead of pi's `ExtensionAPI` |

## Risks

**Pi SDK API changes.** If pi updates its `ExtensionAPI` (adds events, changes payloads), the adapter may need updating. Mitigation: the adapter isolates pi-specific details; extensions remain unaffected.

**Event payload incompatibilities.** Pi's event payloads may include extra fields or use different naming. Mitigation: the adapter transforms payloads to match reeboot's typed events. Tests verify the transformation.

**Optional methods.** `setSessionName`, `getSessionName`, `sendMessage` are optional in `ExtensionAPI`. The adapter implements them only when the underlying pi session supports them. Extensions check for existence before calling.

**Test updates.** Existing tests that mock pi's `ExtensionAPI` need to mock reeboot's `ExtensionAPI` (via the adapter). Mitigation: the adapter implements the same interface, so test changes are minimal.

## Tradeoffs

**Why extract only what's used?** The `ExtensionAPI` captures only the ~5 methods and ~15 events that extensions actually use, not pi's full 30+ method API. This keeps the interface small, focused, and easy to implement for future SDKs.

**Why typed events instead of generic `on(event, handler)`?** Typed events provide IDE autocomplete, compile-time checking, and self-documenting code. They also make it easier to extend the event list (just add to the map).

**Why keep pi as a dependency?** Removing pi entirely would require a new SDK (separate request). The adapter pattern allows pi to remain the default SDK while enabling future alternatives. No breaking changes for current deployments.
