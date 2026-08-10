# Evaluations — pi-sdk-084-upgrade

## Evaluation — 2026-08-08 21:04

**Evaluating request: pi-sdk-084-upgrade**

### pi-dependency-upgrade
verdict:  ✅ SATISFIED
reason:   spec requires "@earendil-works/pi-coding-agent at ^0.84.1 (or exact 0.84.1)" and direct dependencies on pi-ai/pi-agent-core — `reeboot/package.json` pins `@earendil-works/pi-coding-agent` exactly `0.84.1` plus `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` as `0.84.1` direct deps; `npm ls` resolves them and `tests/pi-version.test.ts` asserts the exact pin + installed version. The OLD pi-bundled `undici@8.3.0` / `ws` in `8.0.0–8.20.1` are gone (`undici@8.9.0`, `ws@8.21.x`); reeboot's direct `ws` is reconciled to `^8.21.3`; `npm run build` (tsc) exits 0.
focus:    n/a

### security-signal
verdict:  ⚠️ PARTIAL
reason:   the runtime audit is clean for the pi-attributable vulns and the suite is green (spec: "no open high/critical advisory remains for the pi runtime's bundled undici/ws" — confirmed; "full suite passes" — `npm run test:run` 317 files / 2011 tests pass, `tsc --noEmit` clean). HOWEVER the "Residual alerts are documented" scenario requires each remaining item be recorded with justification, and residual advisories remain: `protobufjs` **critical** (via `@whiskeysockets/baileys`→`libsignal-node`), `sharp` **high** (no fix available), `onnxruntime-node` **high** (via `@huggingface/transformers`), `express-rate-limit` **high** (via `@modelcontextprotocol/sdk`). No documentation of these was found in any readable artifact — `src/security/advisories.json` is `[]`, README/docs contain no mention, and the shared `reespec/decisions.md` has no entry.
focus:    confirm residual-advisory justification (protobufjs critical, sharp/onnxruntime/express-rate-limit high) is recorded in the request design/decisions — absent from all artifacts readable to this evaluator

### session-auth-model
verdict:  ✅ SATISFIED
reason:   spec: options "do NOT contain authStorage or modelRegistry" and "DO contain model ... and the retained cwd/resourceLoader/sessionManager/settingsManager" — `_getOrCreateSession` builds exactly that; `tests/agent-runner/pi-runner-authmodel.test.ts` asserts `opts.model` present, `authStorage`/`modelRegistry` absent, retained wiring, and key resolution preferring `config.apiKey` with env fallback via `resolveProviderEnvKey`. Legacy mocks migrated to stub `ModelRuntime` (not `AuthStorage`/`ModelRegistry`); 29 agent-runner tests pass.
focus:    n/a

### provider-model-matrix
verdict:  ✅ SATISFIED
reason:   spec: "the Model's request config carries that baseUrl" and construction "behind a single narrow helper" — `buildModelFromConfig` (single helper in `src/agent-runner/pi-runner.ts`) carries `baseUrl` for custom/OpenAI-compatible and local providers, overrides cloud model `baseUrl`, and is centralized; `tests/agent-runner/provider-model-matrix.test.ts` (5 tests) covers custom+baseUrl+key (a), ollama/lmstudio keyless (b/b2), cloud catalog (c), and cloud baseUrl override (c2).
focus:    n/a

### pi-mode-simplification
verdict:  ✅ SATISFIED
reason:   spec: "'pi' mode ... no longer calls AuthStorage.create, ModelRegistry.create, or SettingsManager.create" and passes `agentDir: ~/.pi/agent` — the `authMode === 'pi'` branch passes only `{ cwd, agentDir, resourceLoader, sessionManager }`, and the authmodel test asserts `agentDir` = `~/.pi/agent`, no `settingsManager`, and `SettingsManager.create` not invoked; own vs pi behavior is asserted in both directions.
focus:    n/a

### extension-bridge
verdict:  ✅ SATISFIED
reason:   spec event map `message_update`→`text_delta`, `tool_execution_start`→`tool_call_start`, `tool_execution_end`→`tool_call_end`, `agent_end`→`message_end` all present in `pi-runner.ts`; `PiExtensionAdapter implements ExtensionAPI` in `src/extensions/pi-adapter.ts` compiles against the 0.84 extension API (tsc/build green); restricted gating for owner-only memory write / knowledge ingest is preserved via `context.restricted` propagated through the adapter and checked in `memory-manager.ts`/`knowledge-manager.ts`; `generateSummary` (`custom-compaction.ts`) and `loadProjectContextFiles` (`doctor.ts`) still resolve and compile.

## Triage

✅ Safe to skip:   pi-dependency-upgrade, session-auth-model, provider-model-matrix, pi-mode-simplification, extension-bridge
⚠️  Worth a look:  security-signal — residual advisories (protobufjs critical, sharp/onnxruntime/express-rate-limit high) remain and no justification is documented in any artifact readable here; confirm the design/decisions records each item's severity/exploitability/fix path per the "Residual alerts are documented" scenario.
❓  Human call:    (none)

---
