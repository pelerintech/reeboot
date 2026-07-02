# Tasks — Local Endpoints

## 1. Add baseUrl and api to ModelConfigSchema

- [x] **RED** — Write `tests/config-schema.test.mjs`: assert `ModelConfigSchema` does not have `baseUrl` or `api` fields. Run `node --test tests/config-schema.test.mjs` → test passes (fields are absent).
- [x] **ACTION** — Add `baseUrl: z.string().default('')` and `api: z.string().default('openai-completions')` to `ModelConfigSchema` in `reeboot/src/config.ts`.
- [x] **GREEN** — Run `node --test tests/config-schema.test.mjs` → test passes (fields now exist).

## 2. Add providers array to ModelConfigSchema

- [x] **RED** — Write `tests/config-schema.test.mjs`: assert `ModelConfigSchema` does not have a `providers` field. Run test → passes (field absent).
- [x] **ACTION** — Add `ProviderEntrySchema` (name, provider, id, apiKey, baseUrl, api, default) and `providers: z.array(ProviderEntrySchema).default([])` to `ModelConfigSchema` in `reeboot/src/config.ts`.
- [x] **GREEN** — Run `node --test tests/config-schema.test.mjs` → test passes (providers field exists).

## 3. Backward-compatible migration from flat fields to providers array

- [x] **RED** — Write `tests/config-migration.test.mjs`: create a config with flat `provider`/`id`/`apiKey` fields (no `providers` array). Assert that after `loadConfig()`, the `providers` array is empty (migration hasn't been implemented yet). Run test → fails (migration missing).
- [x] **ACTION** — Add migration logic in `loadConfig()`: if `providers` is empty but `provider` is non-empty, auto-migrate to a single-entry `providers` array with `default: true`.
- [x] **GREEN** — Run `node --test tests/config-migration.test.mjs` → test passes (migration occurs).

## 4. Verify providers array is preserved as-is when already present

- [x] **RED** — Write `tests/config-preserve.test.mjs`: create a config with a `providers` array containing `baseUrl` and `api` fields. Assert that after `loadConfig()`, the values are preserved exactly. Run test → passes (no regression — existing behavior).
- [x] **ACTION** — No code change needed; verify the Zod schema preserves the array. Ensure migration logic only runs when `providers` is empty.
- [x] **GREEN** — Run `node --test tests/config-preserve.test.mjs` → test passes.

## 5. Create models.ts startup generation module

- [x] **RED** — Check: `reeboot/src/models.ts` does not exist. Assertion fails — module is absent.
- [x] **ACTION** — Create `reeboot/src/models.ts` with `generateModelsJson(config: Config): string | null` that selects the default provider (or first), applies sensible defaults for missing baseUrl/apiKey, and returns a JSON string for `~/.reeboot/agent/models.json`.
- [x] **GREEN** — Check: `reeboot/src/models.ts` exists and exports `generateModelsJson`. Assertion passes.

## 6. Implement generateModelsJson logic for authMode: "own"

- [x] **RED** — Write `tests/models-generate.test.mjs`: call `generateModelsJson()` with a config where `authMode: "own"` and one default provider. Assert it returns a non-null JSON string containing the provider entry with baseUrl, api, apiKey, and models. Run test → fails (returns null — not implemented).
- [x] **ACTION** — Implement the provider selection and JSON generation in `models.ts`.
- [x] **GREEN** — Run `node --test tests/models-generate.test.mjs` → test passes.

## 7. Implement generateModelsJson logic for authMode: "pi"

- [x] **RED** — Write `tests/models-generate.test.mjs`: call `generateModelsJson()` with `authMode: "pi"`. Assert it returns null. Run test → fails (returns non-null — not handled).
- [x] **ACTION** — Add early return for `authMode !== 'own'` at the top of `generateModelsJson()`.
- [x] **GREEN** — Run `node --test tests/models-generate.test.mjs` → test passes.

## 8. Handle empty providers array

- [x] **RED** — Write `tests/models-generate.test.mjs`: call `generateModelsJson()` with `authMode: "own"` and an empty `providers` array. Assert it returns null. Run test → fails (returns non-null — not handled).
- [x] **ACTION** — Add early return when `providers.length === 0`.
- [x] **GREEN** — Run `node --test tests/models-generate.test.mjs` → test passes.

## 9. Apply sensible defaults for missing baseUrl

- [x] **RED** — Write `tests/models-defaults.test.mjs`: call `generateModelsJson()` with a provider that has no `baseUrl`. Assert the generated JSON contains a default baseUrl based on provider name. Run test → fails (no defaults applied).
- [x] **ACTION** — Add `DEFAULT_BASE_URLS` map in `models.ts` (ollama→localhost:11434, llamacpp→localhost:8080, lmstudio→localhost:1234) and use it when `active.baseUrl` is empty.
- [x] **GREEN** — Run `node --test tests/models-defaults.test.mjs` → test passes.

## 10. Apply default apiKey when missing

- [x] **RED** — Write `tests/models-defaults.test.mjs`: call `generateModelsJson()` with a provider that has no `apiKey`. Assert the generated JSON contains `"sk-local-proxy"`. Run test → fails (apiKey is empty).
- [x] **ACTION** — Add `|| 'sk-local-proxy'` fallback for apiKey in `models.ts`.
- [x] **GREEN** — Run `node --test tests/models-defaults.test.mjs` → test passes.

## 11. Wire models.ts into server.ts startup

- [x] **RED** — Check: `server.ts` does not call `generateModelsJson()`. Assertion fails — no call found.
- [x] **ACTION** — In `server.ts`, after config is loaded and before channel init, call `generateModelsJson(config)` and write the result to `~/.reeboot/agent/models.json`.
- [x] **GREEN** — Check: `server.ts` calls `generateModelsJson()`. Assertion passes.

## 12. Fix wizard: use actual provider name in models.json

- [x] **RED** — Write `tests/wizard-provider-name.test.mjs`: call `writeOllamaModelsJson()` with provider `"custom"`. Assert the generated models.json has `"custom"` as the provider key. Run test → fails (hardcoded `"ollama"`).
- [x] **ACTION** — In `writeOllamaModelsJson()`, use the actual selected provider name instead of hardcoded `"ollama"`. Update the template to use a variable for the provider key.
- [x] **GREEN** — Run `node --test tests/wizard-provider-name.test.mjs` → test passes.

## 13. Fix wizard: include api field in models.json

- [x] **RED** — Write `tests/wizard-api-field.test.mjs`: call `writeOllamaModelsJson()` and parse the generated models.json. Assert the provider entry contains `"api": "openai-completions"`. Run test → fails (api field absent).
- [x] **ACTION** — Add `"api": "openai-completions"` to the models.json template in `writeOllamaModelsJson()`.
- [x] **GREEN** — Run `node --test tests/wizard-api-field.test.mjs` → test passes.

## 14. Fix wizard: prompt for API key for local providers

- [x] **RED** — Write `tests/wizard-local-apikey.test.mjs`: mock the prompter and call `runProviderStep()` with a local provider. Assert that an API key prompt is made. Run test → fails (no API key prompt for local providers).
- [x] **ACTION** — In the local provider branch of `runProviderStep()`, add an API key prompt pre-filled with `"sk-local-proxy"`. Store the result in the ProviderStepResult.
- [x] **GREEN** — Run `node --test tests/wizard-local-apikey.test.mjs` → test passes.

## 15. Fix wizard: prepend new provider to list instead of overwriting

- [x] **RED** — Write `tests/wizard-prepend.test.mjs`: create a config with one provider entry. Call the wizard with a new local provider. Assert the resulting config has two provider entries and the new one is first. Run test → fails (wizard overwrites or appends).
- [x] **ACTION** — In the wizard, read existing config.json, prepend the new provider to the `providers` array (so it becomes first), and write back. Ask the user which provider should be default.
- [x] **GREEN** — Run `node --test tests/wizard-prepend.test.mjs` → test passes.

## 16. Add env vars for local providers

- [x] **RED** — Write `tests/env-vars.test.mjs`: assert `PROVIDER_ENV_VARS` in `pi-runner.ts` does not contain `"ollama"`, `"llamacpp"`, `"lmstudio"`, or `"custom"`. Run test → passes (vars absent).
- [x] **ACTION** — Add `ollama: 'OLLAMA_API_KEY'`, `llamacpp: 'LLAMACPP_API_KEY'`, `lmstudio: 'LM_STUDIO_API_KEY'`, `custom: 'CUSTOM_API_KEY'` to `PROVIDER_ENV_VARS` in `reeboot/src/agent-runner/pi-runner.ts`.
- [x] **GREEN** — Run `node --test tests/env-vars.test.mjs` → test passes (vars now present).

## 17. Update docs/configuration/reference.md

- [x] **RED** — Check: `docs/configuration/reference.md` does not contain `baseUrl` or `api` in the `agent.model` section. Assertion fails — fields are absent.
- [x] **ACTION** — Add `baseUrl`, `api`, and `providers` to the `agent.model` table. Document the migration from flat fields to the `providers` array. Add a local endpoint example.
- [x] **GREEN** — Verify: `docs/configuration/reference.md` contains `baseUrl`, `api`, and `providers` in the `agent.model` section. Assertion passes.

## 18. Update README.md with local endpoint example

- [x] **RED** — Check: `README.md` does not contain a local endpoint configuration example. Assertion fails — no example found.
- [x] **ACTION** — Add a "Local Endpoints" section in README.md showing a complete config.json with a local provider (baseUrl, api, apiKey).
- [x] **GREEN** — Verify: `README.md` contains a local endpoint example. Assertion passes.

## 19. Create CHANGELOG.md

- [x] **RED** — Check: `reeboot/CHANGELOG.md` does not exist. Assertion fails — file is absent.
- [x] **ACTION** — Create `reeboot/CHANGELOG.md` with a v2.6.0 entry documenting: new `baseUrl`/`api` fields, multi-provider support, startup models.json generation, fixed wizard for local providers, new env vars.
- [x] **GREEN** — Verify: `reeboot/CHANGELOG.md` exists and contains a v2.6.0 entry. Assertion passes.
