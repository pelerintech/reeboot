## Evaluation — 2026-06-01 00:00

### config-schema
verdict:  ⚠️ PARTIAL
reason:   5 of 7 scenarios are explicitly tested. The "no default marked" scenario (spec: "all provider entries are preserved (first one will be used at startup)") has no dedicated test in config-schema.test.ts, config-migration.test.ts, or config-preserve.test.ts. The "entry with no apiKey field" scenario is also untested — the Zod schema defaults apiKey to "" but no test verifies a JSON entry missing the apiKey key is preserved with an empty string.
focus:    tests/config-schema.test.ts — add tests for (a) providers array with no default: true and (b) provider entry missing apiKey field entirely

### env-vars
verdict:  ⚠️ PARTIAL
reason:   The 4 env vars (OLLAMA_API_KEY, LLAMACPP_API_KEY, LM_STUDIO_API_KEY, CUSTOM_API_KEY) are tested in env-vars.test.ts, but two spec scenarios are missing: (1) "config.json apiKey takes priority over env var" — the spec requires that when config.json has an apiKey, the resolution logic uses it instead of the env var, but no test verifies this priority; (2) "OLLAMA_API_KEY set but provider is openai returns OPENAI_API_KEY" — cross-provider isolation is not tested.
focus:    tests/env-vars.test.ts — add priority test and cross-provider isolation test

### startup-models
verdict:  ⚠️ PARTIAL
reason:   Core scenarios are well tested (authMode: "own"/"pi", default selection, first-as-default, empty providers, sensible defaults for baseUrl/apiKey). However, the spec's final scenario — "the generated models.json is loaded by pi's ModelRegistry and the model is found with correct baseUrl and api fields" — is UNCLEAR to judge: it depends on pi's internal ModelRegistry behavior, not reeboot's code. Additionally, the spec says defaults are "localhost:11434, localhost:8080, localhost:1234" but the implementation uses full URLs ("http://localhost:11434/v1", etc.) — the spec is underspecified on URL format.
focus:    reespec/requests/local-endpoints/specs/startup-models/spec.md — clarify whether baseUrl defaults should be full URLs or host:port; consider whether pi ModelRegistry integration needs testing

### wizard-local
verdict:  ⚠️ PARTIAL
reason:   Most scenarios are covered by tests (wizard-local-apikey.test.ts, wizard-provider-name.test.ts, wizard-prepend.test.ts, wizard-api-field.test.ts). However, one spec scenario is UNSATISFIED: "GIVEN the wizard is run and the user does NOT mark the new provider as default → THEN the existing default provider retains default: true." The wizard step (provider.ts) has no "mark as default" prompt, and the launch step (launch.ts) unconditionally sets default: true on the new provider and clears defaults on existing ones. This functionality does not exist in the implementation.
focus:    src/wizard/steps/provider.ts — the "mark as default" prompt is missing; src/wizard/steps/launch.ts — always sets default: true on new provider

## Triage

✅ Safe to skip:   config-schema (partial gaps are low-risk), env-vars (partial gaps are test coverage, not functional), startup-models (core functionality works, UNCLEAR item is external dependency)
⚠️  Worth a look:  wizard-local — "user does NOT mark as default" scenario is missing entirely; the wizard has no mechanism to preserve an existing default when adding a new provider
❓  Human call:    startup-models — spec says defaults are "localhost:11434" but code uses "http://localhost:11434/v1"; spec also requires pi ModelRegistry integration test which is outside reeboot's scope

---
