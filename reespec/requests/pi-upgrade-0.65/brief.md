# Brief: Upgrade @mariozechner/pi-coding-agent to 0.65.2

**Status:** Discovered  
**Date:** 2026-04-07

---

## Problem

`@mariozechner/pi-coding-agent` is pinned at `0.62.0`. The installed local version is `0.65.2`. Three releases (0.63, 0.64, 0.65) contain breaking changes that directly hit reeboot's code. The pin must be updated and two source files must be changed to compile against the new API.

---

## Breaking changes that hit reeboot

### 0.64 — `ModelRegistry` constructor removed

`new ModelRegistry(authStorage, modelsJsonPath)` no longer compiles.  
Must use `ModelRegistry.create(authStorage, modelsJsonPath)` or `ModelRegistry.inMemory(authStorage)`.

**Affected:** `src/agent-runner/pi-runner.ts` — two call sites (lines ~216, ~250).

### 0.63 — `ctx.modelRegistry.getApiKey(model)` removed

Replaced by `ctx.modelRegistry.getApiKeyAndHeaders(model)` which returns `{ ok, apiKey, headers }`.

**Affected:** `src/extensions/custom-compaction.ts` — one call site (~line 35).

Migration:
```ts
// Before
const apiKey = await ctx.modelRegistry.getApiKey(model);
// After
const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
if (!auth.ok) { /* fallback */ return; }
const { apiKey, headers } = auth;
```

### 0.65 — `session_switch`, `session_fork`, `session_directory` removed

Reeboot does **not** use any of these. No changes needed.

---

## What is NOT changing

- `createAgentSession` API — unchanged, no action needed.
- `AgentSession.prompt()`, `subscribe()`, `abort()` — unchanged.
- `AuthStorage`, `SettingsManager`, `SessionManager` — unchanged.
- `DefaultResourceLoader`, `ResourceLoader` — unchanged.
- Extension API (`ExtensionAPI`, tool registration, event names reeboot uses) — unchanged.
- `convertToLlm`, `serializeConversation` used in `custom-compaction.ts` — unchanged.

---

## Scope

1. Update pin in `package.json`: `"0.62.0"` → `"0.65.2"`
2. Fix `pi-runner.ts`: replace `new ModelRegistry(...)` with `ModelRegistry.create(...)` (×2)
3. Fix `custom-compaction.ts`: replace `getApiKey` with `getApiKeyAndHeaders`, thread `apiKey` + `headers` into `complete()` call
4. Run `npm install`, `npm run build`, `npm run test:run` — all must pass

---

## Nice-to-have (not required for this upgrade)

0.65 introduced `defineTool()` helper for cleaner custom tool definitions — could adopt in a follow-on pass once this lands.

---

## Out of scope

- Any 0.65 `AgentSessionRuntime` migration — reeboot doesn't do session switching.
- TypeScript 6 upgrade (separate request).
- cron-parser v5 upgrade (separate request).
