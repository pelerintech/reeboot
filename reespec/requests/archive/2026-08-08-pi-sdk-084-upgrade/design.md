# Design — pi-sdk-084-upgrade

## Context

Reeboot embeds the pi agent runtime as a **production dependency** pinned at
`@earendil-works/pi-coding-agent@0.75.4` (exact pin). That pin drags in stale transitive deps
(`undici@8.3.0`, `ws` in the vulnerable `8.0.0–8.20.1` range) that GitHub surfaces as 100+
Dependabot alerts. The fix is to migrate onto the current pi (`0.84.1`), which required
re-working the one SDK surface that changed shape.

Discovery established (via type-diffs between the pinned `0.75.4` dist and the installed
`0.84.x` dist + the pi CHANGELOG):

**The event engine reeboot depends on is intact.** `AgentSession.subscribe/prompt/abort/bindExtensions`,
and the stream events reeboot maps (`message_update`/`tool_execution_start`/`tool_execution_end`/
`agent_end`, with `.assistantMessageEvent`, `.toolCallId`, `.result`, `.isError`) are unchanged
in `0.84` (they now live in `core/extensions/types.d.ts` with identical shapes).

**The breakage is concentrated in session auth/model construction (0.80.8).**
- `createAgentSession`'s options replaced `authStorage`/`modelRegistry` with a single `modelRuntime`.
- `ModelRegistry` was demoted to a synchronous compatibility facade over `ModelRuntime`;
  `ModelRegistry.create(authStorage, path)` is gone (constructor now takes a `ModelRuntime`).
- `AuthStorage.setRuntimeApiKey` was removed from `AuthStorage` and moved to `ModelRuntime.setRuntimeApiKey`.
- `ModelRuntime.create()` is **async** and (default `allowNetworkRefresh: false`) does not refresh
  model catalogs over the network.

**`restricted` is a non-issue.** Reeboot threads owner-only tool gating through its own
`PiExtensionAdapter` + its own `ExtensionContext.restricted` (`src/extensions/extension-api.ts`),
not pi's — so pi dropping `ExtensionContext.restricted` does not affect reeboot.

**Latent baseUrl gap (pre-existing).** Today, in pi mode, `PiAgentRunner` sends only
provider/model-id/key via settings + auth storage. Reeboot's configured `baseUrl` 
(`src/config.ts` `agent.model.baseUrl`, migrated into the `providers[]` array) is **never
plumbed through** in the `'own'` path. Building the `Model` ourselves is the natural fix.

**Auth mode semantics (from `src/agent-runner/pi-runner.ts`, default for `_getOrCreateSession` is `'own'`):**
- `authMode === 'pi'` → build against `~/.pi/agent` to **reuse an already-logged-in pi install** (the user's local "just start it" flow).
- `authMode === 'own'` (default, production) → inject reeboot's own provider/model/key from its config.

## Approach

### 1. Upgrade the pi dependency surface
Bump `@earendil-works/pi-coding-agent` `0.75.4 → 0.84.1` and add `@earendil-works/pi-ai` +
`@earendil-works/pi-agent-core` as pinned direct deps (same `0.84.x`), because reeboot must now
construct `Model`s directly. Reconcile reeboot's own directly-vulnerable deps that shared the
audit (notably reeboot's direct `ws`).

### 2. Migrate `_getOrCreateSession` in `src/agent-runner/pi-runner.ts`
Adopt the **"new way"** decided in discovery — reeboot builds a resolved `Model` from its config
and passes it to `createAgentSession`.

- **`authMode === 'own'`**: construct the `Model` from `agent.model` (`provider`/`id`/`apiKey`/
  `baseUrl`, with env-var key fallback via `resolveProviderEnvKey`), then call
  `createAgentSession({ model, cwd, resourceLoader, sessionManager, settingsManager, modelRuntime? })`.
  `ModelRuntime` is needed only where reeboot still wants auth managed by the runtime (key set via
  `modelRuntime.setRuntimeApiKey`); when a fully-configured `model` carries the request config, the
  runtime can be omitted/left to default.
- **`authMode === 'pi'`**: drop the `AuthStorage`/`ModelRegistry`/`SettingsManager` construction
  entirely. Pass `agentDir: ~/.pi/agent` and let `createAgentSession` default its runtime to the
  user's existing `auth.json`/`models.json`.

### 3. Own the provider→model construction matrix
Add a small construction helper (module-level, e.g. `buildModelFromConfig`) that maps reeboot's
provider ids to pi-ai model construction:
- **Standard cloud** (anthropic, openai, groq, xai, etc.) → pi-ai built-in model with reeboot's key.
- **Custom / OpenAI-compatible** (`custom`, or any provider with a `baseUrl`) → pi-ai's
  OpenAI-compatible / request-config override carrying `baseUrl` + optional key.
- **Local** (`ollama`, `lmstudio`, `llamacpp`) → pi-ai local/OpenAI-compatible construction
  (typically keyless, with `baseUrl`).

This closes the latent `baseUrl` gap: the `Model`'s request config now carries reeboot's `baseUrl`.

### 4. Update the pi-mode test mock
The runner tests (`tests/agent-runner/pi-runner-*.test.ts`) mock
`@earendil-works/pi-coding-agent` with `SessionManager`/`AuthStorage`/`ModelRegistry`/
`SettingsManager` stubs. Replace the `AuthStorage`/`ModelRegistry` stubs with `ModelRuntime`
(and the new `model`-construction path), keeping `SessionManager`/`SettingsManager`.

### 5. Validate `PiExtensionAdapter` against the 0.84 `ExtensionAPI`
Reeboot's extensions sit on `src/extensions/pi-adapter.ts` (`PiExtensionAdapter implements
ExtensionAPI`), wrapping pi's ExtensionAPI. Validate the bridge against the 0.84 surface
(additive in the area reeboot uses; new ExtensionAPI members like `InlineExtension` are
compatible). The stream-event mapping in `pi-runner.ts` is asserted to remain green.

### 6. Verify the security signal
`npm audit` (runtime tree) shows the previously-flagged high/critical pi-transitive alerts
cleared, and any remaining reeboot-owned alerts are explicitly reconciled or documented.
`tsc --noEmit` and the full `test:run` suite are green.

## Risks

- **Moving pi-ai target**: reeboot now constructs models directly against `@earendil-works/pi-ai`;
  that surface may shift between pi releases, making the provider-matrix module the new
  maintenance point. Mitigation: keep construction in one module with a narrow interface, pin
  pi-ai to pi's version, and cover with tests.
- **Custom/local construction nuances**: pi-ai has no `ollama`/`lmstudio`/`custom` named providers;
  those map to OpenAI-compatible/request-config construction. Risk of subtle request-shape
  differences. Mitigation: a dedicated provider-matrix test exercising reflective request config.
- **`authMode === 'own'` default flip**: changing how the default path constructs the session
  could alter runtime behavior for existing deployments. Mitigation: keep behavior parity for
  standard providers (same key resolution), only add baseUrl where it was missing.
- **Dependabot counting**: GitHub's alert count may not drop to zero immediately (it aggregates
  the whole tree, incl. dev/webchat). Success is defined per the spec (pi-transitive
  high/critical cleared + reeboot tree reconciled), not a raw score.
- **Test-mock drift**: the pi module mock must stay in sync with the real SDK surface or tests
  pass against fake shapes. Mitigation: mock the minimal public surface reeboot actually uses.

## Residual runtime audit items (reconciled 2026-08-08)

Reeboot's own directly-listed, directly-vulnerable deps surfaced in the same `npm audit --omit=dev`
were upgraded to the nearest compatible fixed release:

- `ws` `^8.20.1 → ^8.21.3` (GHSA-96hv-2xvq-fx4p high, memory-exhaustion DoS). Compatible 8.x bump.
- `hono` `^4.12.0 → ^4.13.1` (multiple high advisories incl. CSS/JSX injection, fixed >4.12.33). Compatible 4.x bump.
- `nanoid` `^5.0.0 → ^5.1.16` (GHSA-28wg-ghj8-5hjv high). Compatible 5.x bump.

**Documented residual (not upgraded):** `adm-zip ^0.5.16` — GHSA-xcpc-8h2w-3j85 (high, crafted ZIP
4GB memory allocation). The only fix is the major `0.6.0`; reeboot uses AdmZip for skill zip
validation/upload (`src/skills/zip-validate.ts`, `src/skills/upload.ts`) where the input is validated
before decompression, and a major bump is out of scope for this pi-SDK migration. Tracked for a
future dependency pass. The remaining high/critical entries (`protobufjs` critical via baileys,
`sharp`, `axios`, `form-data`, etc.) are transitive-only, not reeboot-owned, and outside this
request's scope per the Non-Goals.
