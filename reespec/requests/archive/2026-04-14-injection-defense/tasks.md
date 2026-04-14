# Tasks: Injection Defense

## 1. Config schema — security block

- [x] **RED** — Write `tests/injection-defense-config.test.ts`: assert `loadConfig()` with `security.injection_guard.enabled = false` parses correctly; assert config without `security` field defaults `enabled` to `true` and `external_source_tools` to `['fetch_url', 'web_fetch']`. Run `npx vitest run tests/injection-defense-config.test.ts` → fails (field not in schema).
- [x] **ACTION** — Add `InjectionGuardConfigSchema`, `SecurityConfigSchema`, and `security: SecurityConfigSchema.default({})` to `ConfigSchema` in `src/config.ts`.
- [x] **GREEN** — Run `npx vitest run tests/injection-defense-config.test.ts` → passes.

---

## 2. End-user message wrapping in runner

- [x] **RED** — Write `tests/injection-defense.test.ts`: create a `PiAgentRunner` with a mock session that captures the content passed to `session.prompt()`; call `runner.prompt('hello', onEvent, { trust: 'end-user' })`; assert captured content starts with `[UNTRUSTED END-USER MESSAGE]` and contains `hello`. Run `npx vitest run tests/injection-defense.test.ts` → fails (no wrapping in runner).
- [x] **ACTION** — Add `wrapUntrustedMessage()` helper and call it in `PiAgentRunner.prompt()` when `_currentTrust === 'end-user'`.
- [x] **GREEN** — Run `npx vitest run tests/injection-defense.test.ts` → passes.

---

## 3. Owner messages not wrapped

- [x] **RED** — Add to `tests/injection-defense.test.ts`: call `runner.prompt('hello', onEvent, { trust: 'owner' })`; assert captured content equals `'hello'` exactly (no wrapping). Run → fails (wrapping applied regardless of trust).
- [x] **ACTION** — Gate the wrapping call: only apply when `_currentTrust === 'end-user'`.
- [x] **GREEN** — Run `npx vitest run tests/injection-defense.test.ts` → passes.

---

## 4. Injection-guard extension — external content policy injection

- [x] **RED** — Add to `tests/injection-defense.test.ts`: create the injection-guard extension with `enabled: true` and `external_source_tools: ['fetch_url', 'gmail_read']`; simulate a `before_agent_start` event with an empty system prompt; assert the returned system prompt contains `<external_content_policy>` and mentions `fetch_url` and `gmail_read`. Run → fails (extension does not exist).
- [x] **ACTION** — Create `src/extensions/injection-guard.ts` with a `before_agent_start` hook that appends the `<external_content_policy>` block when enabled and tools list is non-empty.
- [x] **GREEN** — Run `npx vitest run tests/injection-defense.test.ts` → passes.

---

## 5. Injection-guard disabled by config

- [x] **RED** — Add to `tests/injection-defense.test.ts`: create the extension with `enabled: false`; simulate `before_agent_start`; assert returned system prompt is unchanged. Run → fails (guard fires regardless of enabled flag).
- [x] **ACTION** — Add early return in `before_agent_start` hook when `!enabled`.
- [x] **GREEN** — Run `npx vitest run tests/injection-defense.test.ts` → passes.

---

## 6. Injection-guard registered in loader

- [x] **RED** — Add to `tests/extensions/loader.test.ts`: call `getBundledFactories(config)` with `extensions.core.injection_guard = true` (default); assert the factories array length increases by 1 compared to a config with `injection_guard = false`. Run → fails (factory not registered).
- [x] **ACTION** — Add injection-guard factory registration to `getBundledFactories()` in `src/extensions/loader.ts` gated on `core.injection_guard ?? true`. Add `injection_guard: z.boolean().default(true)` to `ExtensionsCoreConfigSchema` in `src/config.ts`.
- [x] **GREEN** — Run `npx vitest run tests/extensions/loader.test.ts` → passes.

---

## 7. Skill trust boundary — user-installed skills marked

- [x] **RED** — Add to `tests/injection-defense.test.ts`: set up a skill store with one bundled skill (path under `BUNDLED_SKILLS_DIR`) and one user-installed skill (path under `~/.reeboot/skills-catalog/`); simulate `before_agent_start` in skill-manager; assert the bundled skill content does NOT contain `[USER-INSTALLED SKILL — LOWER TRUST]`; assert the user-installed skill content DOES contain the marker. Run → fails (no trust marker logic in skill-manager).
- [x] **ACTION** — In `skill-manager.ts` `before_agent_start` hook: add `isBundledSkill(skillDir)` check; prepend trust marker to non-bundled skill content.
- [x] **GREEN** — Run `npx vitest run tests/injection-defense.test.ts` → passes.

---

## 8. Full test suite green

- [x] **RED** — Check: `npx vitest run` exits non-zero or has failures from schema additions or runner changes.
- [x] **ACTION** — Fix any existing tests broken by `ConfigSchema` additions (`security` block), `ExtensionsCoreConfigSchema` additions (`injection_guard` toggle), or runner changes.
- [x] **GREEN** — Run `npx vitest run` → all tests pass, exit 0.
