# Tasks: Upgrade @mariozechner/pi-coding-agent to 0.65.2

---

### 1. Pin bump breaks the build (RED confirmation)

- [x] **RED** — In `package.json` change `"@mariozechner/pi-coding-agent": "0.62.0"` to `"0.65.2"`. Run `npm install && npm run build`. Assert `tsc` exits non-zero with errors mentioning `ModelRegistry` constructor and `getApiKey`.
- [x] **ACTION** — No code changes yet. This task is purely confirming the breakage is real before fixing it.
- [x] **GREEN** — Build output contains at least one error in `pi-runner.ts` and one in `custom-compaction.ts`.

---

### 2. Fix ModelRegistry instantiation in pi-runner.ts

- [x] **RED** — Write `tests/agent-runner/pi-registry-factory.test.ts`: import the real `@mariozechner/pi-coding-agent`, assert `typeof ModelRegistry.create === 'function'` and assert attempting `new (ModelRegistry as any)()` throws or is not a constructor. Run `npm run test:run -- pi-registry-factory` → test for `ModelRegistry.create` passes, confirming the API shape; this documents the target API before the fix lands.
- [x] **ACTION** — In `src/agent-runner/pi-runner.ts`, replace both occurrences of `new ModelRegistry(authStorage, ...)` with `ModelRegistry.create(authStorage, ...)`. Run `npm run build` → should now exit 0.
- [x] **GREEN** — Run `npm run test:run` → all tests pass including `pi-registry-factory.test.ts` and the existing `pi-runner-isolation.test.ts`.

---

### 3. Fix getApiKey → getApiKeyAndHeaders in custom-compaction.ts

- [x] **RED** — Write `tests/extensions/custom-compaction-api.test.ts`: mount the extension with a mock `ExtensionAPI` and a mock `ctx.modelRegistry` that has `getApiKeyAndHeaders` but NOT `getApiKey`. Fire a `session_before_compact` event. Assert the extension calls `getApiKeyAndHeaders` (spy called ≥1 time) and does NOT call `getApiKey` (spy not called). Run `npm run test:run -- custom-compaction-api` → test fails because the current code calls `getApiKey`.
- [x] **ACTION** — In `src/extensions/custom-compaction.ts`: replace `await ctx.modelRegistry.getApiKey(model)` with `const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model)`. Replace `if (!apiKey)` check with `if (!auth.ok)`. Update the `complete()` call to pass `{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 8192, signal }`.
- [x] **GREEN** — Run `npm run test:run` → all tests pass including `custom-compaction-api.test.ts`.
