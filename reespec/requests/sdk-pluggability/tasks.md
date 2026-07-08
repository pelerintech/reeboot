# Tasks — sdk-pluggability

## 1. Define ExtensionAPI interface and typed events

- [x] **RED** — Check: `reeboot/src/extensions/extension-api.ts` does not exist. Assertion fails — file is absent.
- [x] **ACTION** — Create `reeboot/src/extensions/extension-api.ts` with:
  - `ExtensionAPI` interface (registerTool, on, optional session/message methods, context)
  - `ExtensionEventMap` with all 15 events
  - All 15 typed event payload interfaces (BeforeAgentStartEvent, ToolCallEvent, etc.)
  - `ToolDefinition`, `ToolResult`, `ExtensionContext`, `ExtensionFactory` types
- [x] **GREEN** — Verify: `reeboot/src/extensions/extension-api.ts` exists, exports all required types, has > 200 lines, compiles with `tsc --noEmit`

## 2. Create PiExtensionAdapter

- [x] **RED** — Check: `reeboot/src/extensions/pi-adapter.ts` does not exist. Assertion fails — file is absent.
- [x] **ACTION** — Create `reeboot/src/extensions/pi-adapter.ts` with:
  - `PiExtensionAdapter` class implementing `ExtensionAPI`
  - `registerTool()` forwards to pi session
  - `on()` maps event names to pi events, transforms payloads to typed events, returns unsubscribe function
  - Optional methods (`setSessionName`, `getSessionName`, `sendMessage`) forward to pi session
  - `context` property returns the provided `ExtensionContext`
  - Constructor accepts `(piSession: any, context: ExtensionContext)`
- [x] **GREEN** — Verify: `reeboot/src/extensions/pi-adapter.ts` exists, compiles with `tsc --noEmit`, implements all required methods

## 3. Refactor budget-manager extension

- [x] **RED** — Check: `reeboot/src/extensions/budget-manager.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `budget-manager.ts`
- [x] **GREEN** — Verify: `budget-manager.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 3 tools and subscribes to 3 events

## 4. Refactor capabilities extension

- [x] **RED** — Check: `reeboot/src/extensions/capabilities.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `capabilities.ts`
- [x] **GREEN** — Verify: `capabilities.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still hooks `before_agent_start` and calls `pi.getAllTools()`

## 5. Refactor confirm-destructive extension

- [x] **RED** — Check: `reeboot/src/extensions/confirm-destructive.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `confirm-destructive.ts`
- [x] **GREEN** — Verify: `confirm-destructive.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still subscribes to 4 events

## 6. Refactor custom-compaction extension

- [x] **RED** — Check: `reeboot/src/extensions/custom-compaction.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `custom-compaction.ts`
- [x] **GREEN** — Verify: `custom-compaction.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still subscribes to `session_before_compact`

## 7. Refactor injection-guard extension

- [x] **RED** — Check: `reeboot/src/extensions/injection-guard.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `injection-guard.ts`
- [x] **GREEN** — Verify: `injection-guard.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still hooks `before_agent_start`

## 8. Refactor knowledge-manager extension

- [x] **RED** — Check: `reeboot/src/extensions/knowledge-manager.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `knowledge-manager.ts`
- [x] **GREEN** — Verify: `knowledge-manager.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 4 tools and subscribes to 3 events

## 9. Refactor mcp-manager extension

- [x] **RED** — Check: `reeboot/src/extensions/mcp-manager.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `mcp-manager.ts`
- [x] **GREEN** — Verify: `mcp-manager.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 1 tool and subscribes to 2 events

## 10. Refactor memory-manager extension

- [x] **RED** — Check: `reeboot/src/extensions/memory-manager.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `memory-manager.ts`
- [x] **GREEN** — Verify: `memory-manager.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 2 tools and hooks `before_agent_start`

## 11. Refactor observability extension

- [x] **RED** — Check: `reeboot/src/extensions/observability.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `observability.ts`
- [x] **GREEN** — Verify: `observability.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still subscribes to 2 events

## 12. Refactor protected-paths extension

- [x] **RED** — Check: `reeboot/src/extensions/protected-paths.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `protected-paths.ts`
- [x] **GREEN** — Verify: `protected-paths.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still subscribes to `tool_call`

## 13. Refactor scheduler-tool extension

- [x] **RED** — Check: `reeboot/src/extensions/scheduler-tool.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `scheduler-tool.ts`
- [x] **GREEN** — Verify: `scheduler-tool.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 7 tools and subscribes to 2 events

## 14. Refactor session-name extension

- [x] **RED** — Check: `reeboot/src/extensions/session-name.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `session-name.ts`
- [x] **GREEN** — Verify: `session-name.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 1 command and uses `setSessionName`/`getSessionName`

## 15. Refactor skill-manager extension

- [x] **RED** — Check: `reeboot/src/extensions/skill-manager.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `skill-manager.ts`
- [x] **GREEN** — Verify: `skill-manager.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 3 tools and subscribes to 3 events

## 16. Refactor token-meter extension

- [x] **RED** — Check: `reeboot/src/extensions/token-meter.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `token-meter.ts`
- [x] **GREEN** — Verify: `token-meter.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still subscribes to `agent_end`

## 17. Refactor trust-enforcer extension

- [x] **RED** — Check: `reeboot/src/extensions/trust-enforcer.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `trust-enforcer.ts`
- [x] **GREEN** — Verify: `trust-enforcer.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still subscribes to `tool_call`

## 18. Refactor web-search extension

- [x] **RED** — Check: `reeboot/src/extensions/web-search.ts` still imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`. Assertion fails — old import exists.
- [x] **ACTION** — Replace `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` with `import type { ExtensionAPI } from './extension-api.js'` in `web-search.ts`
- [x] **GREEN** — Verify: `web-search.ts` no longer imports from pi SDK, compiles with `tsc --noEmit`, still registers 2 tools

## 19. Update loader to use PiExtensionAdapter

- [x] **RED** — Check: `reeboot/src/extensions/loader.ts` does not import `PiExtensionAdapter`. Assertion fails — import is absent.
- [x] **ACTION** — Update `loader.ts`:
  - Import `PiExtensionAdapter` from `./pi-adapter.js`
  - Create `PiExtensionAdapter` instance in extension factory creation
  - Pass adapter (not pi's ExtensionAPI) to extension factories
  - Preserve `DefaultResourceLoader` and `ResourceLoader` imports from pi (not part of refactoring)
- [x] **GREEN** — Verify: `loader.ts` imports `PiExtensionAdapter`, creates adapter instance, passes it to extensions, compiles with `tsc --noEmit`

## 20. Run full test suite

- [x] **RED** — Check: `npm test` or `vitest run` fails or has errors after refactoring.
- [x] **ACTION** — Fix any compilation errors or test failures resulting from the refactoring (adjust imports, fix type mismatches, update test mocks if needed)
- [x] **GREEN** — Verify: `npm test` or `vitest run` passes with no errors, all existing tests still pass

## 21. Verify no pi imports remain in extensions

- [x] **RED** — Check: `grep -r "from '@earendil-works/pi-coding-agent'" reeboot/src/extensions/*.ts` returns results. Assertion fails — pi imports still exist in extensions.
- [x] **ACTION** — Fix any remaining pi imports in extension files (excluding `loader.ts` which still needs `DefaultResourceLoader` and `ResourceLoader` from pi)
- [x] **GREEN** — Verify: `grep -r "from '@earendil-works/pi-coding-agent'" reeboot/src/extensions/*.ts` returns only `loader.ts` lines (for `DefaultResourceLoader` and `ResourceLoader`), no other extension files import from pi SDK

---

## Post-evaluation remediation (v2)

*Added after evaluation 2026-07-02 — addresses gaps flagged by evaluator.*

## 22. Redesign event types to be reeboot-owned (not pi mirrors)

- [x] **RED** — Check: Event types in `extension-api.ts` are pi mirrors (identical field names/shapes). `ToolResultEvent` base type missing `input` field. `TurnEndEvent` missing `turnId`, `sessionId`, `usage`. `SessionShutdownEvent` missing `sessionId`. Assertion fails — types are SDK-specific mirrors.
- [x] **ACTION** — Update `reeboot/src/extensions/extension-api.ts` event types:
  - `ToolResultEvent`: converted from union to single interface with `input: Record<string, unknown>` in base type (was missing, extensions can't access it)
  - `TurnEndEvent`: added `turnId: string`, `sessionId: string`, `usage?: TurnUsage` (new `TurnUsage` interface with `inputTokens`, `outputTokens`, `cost?`). Kept `turnIndex` for backward compat.
  - `SessionShutdownEvent`: added `sessionId: string`
  - `AfterProviderResponseEvent`: added `contextId: string`, `provider: string`
  - Added JSDoc comments marking events as "SDK-agnostic reeboot event"
  - All existing fields preserved (backward compatible)
- [x] **GREEN** — Verified: `extension-api.ts` has updated event types with all new fields. `ToolResultEvent` has `input` in base. `TurnEndEvent` has `turnId`/`sessionId`/`usage`. `SessionShutdownEvent` has `sessionId`. `AfterProviderResponseEvent` has `contextId`/`provider`. Compiles cleanly with `tsc --noEmit`.

## 23. Update PiExtensionAdapter with real transformation logic

- [x] **RED** — Check: `pi-adapter.ts` `transformEvent` is a bare `return piEvent as ExtensionEventMap[K]` pass-through cast. No real transformation exists. Assertion fails — adapter doesn't transform payloads.
- [x] **ACTION** — Update `reeboot/src/extensions/pi-adapter.ts`:
  - Implemented `transformEvent()` with a switch statement — per-event transformation logic:
    - `turn_end`: maps `piEvent.turnIndex` → `turnId: String(turnIndex)`, extracts `usage` from `piEvent.message.usage` via `_extractUsage()`, adds `sessionId` via `_getSessionId()`
    - `tool_result`: ensures `input` field is always present (defaults to `{}`), preserves all fields
    - `session_shutdown`: adds `sessionId` via `_getSessionId()`
    - `after_provider_response`: adds `contextId` via `_getContextId()`, `provider` via `_getProvider()`
    - Other events: documented identity mapping (pass-through for events with identical shapes)
  - Added descriptive error messages for null pi session: `throw new Error('Cannot registerTool: pi session not available (adapter created without a session)')`
  - Added `_extractUsage()`, `_getSessionId()`, `_getContextId()`, `_getProvider()` helper methods
  - Added JSDoc comments explaining transformation strategy
  - All optional methods (`setSessionName`, `getSessionName`, `sendMessage`) now guard against null session gracefully
- [x] **GREEN** — Verified: `pi-adapter.ts` has real `transformEvent` switch logic (4 events with explicit transformation, rest pass through). Null session throws descriptive errors. Compiles with `tsc --noEmit`. Existing loader tests (12 tests) still pass.

## 24. Fix observability.ts to use extension-api

- [x] **RED** — Check: `observability.ts` uses `pi: any` with locally-defined `SessionShutdownEvent`/`AfterProviderResponseEvent` interfaces instead of importing from `./extension-api.js`. Assertion fails — extension doesn't use the shared API.
- [x] **ACTION** — Update `reeboot/src/extensions/observability.ts`:
  - Imported `ExtensionAPI`, `SessionShutdownEvent`, `AfterProviderResponseEvent` from `./extension-api.js`
  - Changed `makeObservabilityExtension(pi: any, ...)` to `makeObservabilityExtension(api: ExtensionAPI, ...)`
  - Removed locally-defined event interfaces (3 lines of duplicate type definitions)
  - Changed `pi.on(...)` to `api.on(...)` with typed events
  - Updated `event.contextId` → `event.sessionId` in session_shutdown handler (matches reeboot's typed event shape)
- [x] **GREEN** — Verified: `observability.ts` imports from `./extension-api.js`, uses typed `ExtensionAPI`, compiles with `tsc --noEmit`, subscribes to same 2 events (`session_shutdown`, `after_provider_response`).

## 25. Add PiExtensionAdapter tests

- [x] **RED** — Check: No tests exist for `PiExtensionAdapter` in `tests/extensions/`. Assertion fails — adapter is untested.
- [x] **ACTION** — Created `reeboot/tests/extensions/pi-adapter.test.ts` with 19 tests across 7 describe blocks:
  - `registerTool`: forwards to pi session (✓), throws descriptive error on null session (✓)
  - `on()`: subscribes to pi event (✓), returns unsubscribe function (✓), throws on null session (✓)
  - `optional methods`: setSessionName forwards (✓), getSessionName forwards (✓), sendMessage forwards (✓), all no-ops on null session (✓)
  - `context`: returns provided ExtensionContext (✓)
  - `event transformation`: turn_end maps turnIndex→turnId + extracts usage (✓), turn_end omits usage when absent (✓), tool_result preserves input (✓), tool_result defaults input to {} (✓), session_shutdown adds sessionId (✓), after_provider_response adds contextId+provider (✓), before_agent_start passes through (✓)
  - `context ID derivation`: extracts from workspace path (✓), defaults to 'main' (✓)
- [x] **GREEN** — Verified: `vitest run tests/extensions/pi-adapter.test.ts` passes with all 19 assertions green. Loader tests (31 total) still pass. Extension tests (trust-enforcer, protected-paths, capabilities — 37 total) still pass.
