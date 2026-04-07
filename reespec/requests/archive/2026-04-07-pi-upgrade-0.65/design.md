# Design: Upgrade @mariozechner/pi-coding-agent to 0.65.2

## Approach

Two surgical call-site fixes + pin bump. No architectural change.

### Fix 1 — `ModelRegistry.create()` in `pi-runner.ts`

The constructor is removed. Both call sites pass identical arguments `(authStorage, modelsJsonPath)`, which maps directly to the new static factory `ModelRegistry.create(authStorage, modelsJsonPath)`. One-line change per call site.

### Fix 2 — `getApiKeyAndHeaders()` in `custom-compaction.ts`

`getApiKey(model)` → `getApiKeyAndHeaders(model)`. The new method returns `{ ok: boolean, apiKey?: string, headers?: Record<string, string> }`. The extension already has an early-return path for missing key — we replace the key check with `!auth.ok`. The `complete()` call gains a `headers` field alongside `apiKey`.

### Verification strategy

The existing `tests/agent-runner/pi-runner-isolation.test.ts` mocks `@mariozechner/pi-coding-agent` entirely — it won't catch a broken `ModelRegistry` constructor because it replaces the real module. We need a test that imports the *real* pi module and confirms `ModelRegistry.create(...)` is callable and `new ModelRegistry(...)` is not.

For `custom-compaction.ts`, the extension is loaded by mocking `ExtensionAPI` — we can verify the `getApiKeyAndHeaders` path is called (not `getApiKey`) by checking the mock.

### Order

1. Bump pin, install, confirm `tsc` fails at the two broken call sites (RED confirmation)
2. Fix `pi-runner.ts` → build passes
3. Fix `custom-compaction.ts` → build passes
4. Tests pass

## Risk

Low. The two broken APIs have direct mechanical replacements. The rest of the pi API surface reeboot uses is unchanged across 0.62→0.65.
