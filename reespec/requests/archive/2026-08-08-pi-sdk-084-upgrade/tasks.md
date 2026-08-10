# Tasks — pi-sdk-084-upgrade

> Working directory for every command is `reeboot/` unless stated otherwise.

## 1. Upgrade pi + add pi-ai/pi-agent-core direct deps

- [x] **RED** — Check `reeboot/package.json`: `@earendil-works/pi-coding-agent` is still pinned at `0.75.4`, and neither `@earendil-works/pi-ai` nor `@earendil-works/pi-agent-core` is a direct `dependencies` entry. Assertion fails (target state absent).
- [x] **ACTION** — Update `reeboot/package.json`: set `@earendil-works/pi-coding-agent` to `^0.84.1` (or exact `0.84.1`) and add `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` matching the pi version as direct dependencies. Run `npm install`.
- [x] **GREEN** — Verify: `npm ls @earendil-works/pi-coding-agent` resolves to `0.84.1`, `@earendil-works/pi-ai`/`pi-agent-core` appear in `dependencies`. (Note: `npm run build` still fails on the `AuthStorage`/`ModelRegistry` surface — this is exactly the SDK change the migration tasks 3–8 fix; the build-green barrier is gated on those tasks.)

## 2. Reconcile reeboot's own directly-vulnerable deps

- [x] **RED** — Check `npm audit --omit=dev` output: reeboot's own direct dep (e.g. `ws` in the `8.0.0–8.20.1` range) is still flagged as high/critical — assertion that its advisory is gone fails.
- [x] **ACTION** — Upgrade compatibly any reeboot-owned dep that is both directly listed and directly vulnerable; where an upgrade is not safe, record the item with justification instead.
- [x] **GREEN** — Verify: the audit no longer flags reeboot's direct deps as high/critical, OR each residual item is explicitly documented in the design's risk/decisions.

## 3. Own-mode builds a resolved Model and drops authStorage/modelRegistry

- [x] **RED** — Add `tests/agent-runner/pi-runner-authmodel.test.ts`: mock `@earendil-works/pi-coding-agent` (stub `createAgentSession` capturing its options, plus `SessionManager`/`SettingsManager`/`ModelRuntime`), drive a real `PiAgentRunner` in `authMode === 'own'`, and assert `createAgentSession` was called with `model` set and WITHOUT `authStorage`/`modelRegistry`. Run → fails (options still built the old way).
- [x] **ACTION** — In `_getOrCreateSession` (`src/agent-runner/pi-runner.ts`), build the `Model` from `agent.model` via a new `buildModelFromConfig` helper and pass `model` (+ retained `cwd`/`resourceLoader`/`sessionManager`/`settingsManager`) to `createAgentSession`; stop threading `authStorage`/`modelRegistry`.
- [x] **GREEN** — Run the new test → passes; run the existing pi-runner lifecycle/tool-scanning/isolation tests → adjusted and green.

## 4. Key resolution preserved in own mode

- [x] **RED** — Add a test in `tests/agent-runner/pi-runner-authmodel.test.ts`: with `agent.model.apiKey` set, assert the constructed Model's request config carries that key; and with no config key but a provider env var set, assert the env var is used. Run → fails (key plumbing not yet through the Model).
- [x] **ACTION** — Ensure `buildModelFromConfig` resolves the key config-first then `resolveProviderEnvKey(provider)` fallback, matching today's behavior, and sets it on the Model.
- [x] **GREEN** — Run the test → passes (both resolution paths covered).

## 5. pi mode simplifies to agentDir (no AuthStorage/ModelRegistry)

- [x] **RED** — Add a test in `tests/agent-runner/pi-runner-authmodel.test.ts`: drive a `PiAgentRunner` in `authMode === 'pi'` and assert `createAgentSession` is called WITHOUT `authStorage`/`modelRegistry`/`SettingsManager.create` and with an `agentDir` pointing under the user's pi home. Run → fails.
- [x] **ACTION** — In the `'pi'` branch, drop the `AuthStorage`/`ModelRegistry`/`SettingsManager` construction and pass `agentDir: ~/.pi/agent`, letting `createAgentSession` default its runtime.
- [x] **GREEN** — Run the test → passes; confirm the `'own'` path test still passes (modes preserved).

## 6. Provider→model matrix for custom / local / baseUrl

- [x] **RED** — Add `tests/agent-runner/provider-model-matrix.test.ts` for `buildModelFromConfig`: (a) a custom/OpenAI-compatible provider with `baseUrl`+`apiKey` yields a Model carrying that `baseUrl`; (b) a local provider (`ollama`/`lmstudio`) with `baseUrl` and no key yields a usable Model keyless; (c) a standard cloud provider yields the expected Model. Run → fails (helper does not exist / baseUrl dropped).
- [x] **ACTION** — Implement `buildModelFromConfig` behind one narrow helper using pi-ai construction (built-in for cloud, OpenAI-compatible/request-config for custom/local) so `baseUrl` travels in the request config.
- [x] **GREEN** — Run the test → passes; the matrix scenarios (a)/(b)/(c) all green.

## 7. Migrate remaining pi-runner test mocks

- [x] **RED** — Check the remaining pi-runner suites' mock (`AuthStorage`/`ModelRegistry` stubs) is gone from `tests/agent-runner/pi-runner-*.test.ts` — grep finds `AuthStorage`/`ModelRegistry` still stubbed → assertion fails.
- [x] **ACTION** — Replace `AuthStorage`/`ModelRegistry` mock stubs with `ModelRuntime` (or remove, per the migrated surface) across `pi-runner-lifecycle`/`pi-runner-tool-scanning`/`pi-runner-isolation`.
- [x] **GREEN** — Run the full `tests/agent-runner/` suite → all tests pass and no `AuthStorage`/`ModelRegistry` stub remains.

## 8. Validate PiExtensionAdapter + event stream + restricted

- [x] **RED** — Run `tests/agent-runner/pi-runner-tool-scanning.test.ts`, `tests/structured-views/pi-view-propagation.test.ts`, and the extension suite (memory/knowledge gating) → expect failures/type errors against the `0.84` surface. (Note: none materialized — reeboot's extension/event surface is compatible with `0.84`; `restricted` is reeboot's own ExtensionAPI and the event engine is intact, as the design predicted.)
- [x] **ACTION** — Fix compile/behavior in `src/extensions/pi-adapter.ts` and any event/extension code the `0.84` surface requires; confirm `restricted` and `generateSummary`/`loadProjectContextFiles` consumers still resolve. (No change required — adapter, events, and both consumers already resolve against `0.84`.)
- [x] **GREEN** — Run the extension + runner suites → green; `tsc --noEmit` clean.

## 9. Verify the security signal

- [x] **RED** — Check `npm audit --omit=dev`: an open high/critical advisory for pi's bundled `undici`/`ws` is still present from the stale pin → the assertion "no pi-transitive high/critical open" fails.
- [x] **ACTION** — Confirm the migrated lockfile drops the stale pi-transitive advisories and that any reeboot-owned residual is documented in `design.md` risks.
- [x] **GREEN** — Verify `npm audit --omit=dev` shows no open high/critical for pi's `undici`/`ws`, and `npm run build` + `tsc --noEmit` pass.

## 10. Full-suite green + record the decision

- [x] **RED** — Check the full suite (`npm run test:run`) has failures/type errors from the migration → assertion "suite is green" fails. (Found: `tests/pi-version.test.ts` still asserted the old `0.75.4` pin.)
- [x] **ACTION** — Fix any remaining failing tests/type errors introduced by the migration; write the `pi-sdk-084-upgrade` entry (mode semantics, new-way model construction, baseUrl gap closure, pi-ai direct deps) into `reespec/decisions.md`.
- [x] **GREEN** — Run `npm run test:run` and `tsc --noEmit` → full suite green (excluding pre-existing unrelated failures) and typecheck clean; `decisions.md` contains the entry.
