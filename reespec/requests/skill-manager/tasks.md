## 1. Test Infrastructure (RED — all failing tests first)

- [x] 1.1 Write failing tests for permanent skills: skills listed in `config.skills.permanent` are registered via `resources_discover`; unknown skill name in permanent list logs a warning and is skipped; empty permanent list registers nothing; skill paths resolve from bundled catalog; skill paths resolve from extended catalog (`~/.reeboot/skills-catalog/`) when present
- [x] 1.2 Write failing tests for `load_skill` tool: loads a known skill from catalog into active set; unknown skill name returns error; calling with same name replaces existing (resets TTL); default TTL applied when `ttl_minutes` not provided; custom `ttl_minutes` stored correctly; expired skill not present in active set after TTL elapses (fake timers)
- [x] 1.3 Write failing tests for `unload_skill` tool: removes active skill immediately; unknown name returns error; after unload skill no longer injected in `before_agent_start`
- [x] 1.4 Write failing tests for `list_available_skills` tool: returns name + description for all catalog skills without loading them; optional keyword filter returns matching subset only; empty catalog returns empty list; query with no matches returns empty list
- [x] 1.5 Write failing tests for `before_agent_start` injection: no active ephemeral skills → system prompt unchanged; one active skill → XML block appended with name, description, expires_in; two active skills → both appear; expired skill not injected; `expires_in` shows correct remaining minutes (fake timers)
- [x] 1.6 Write failing tests for TTL expiry loop: skill expires after TTL elapses (fake timers, 60s tick); expired skill removed from active set; `active-skills.json` updated after expiry; multiple skills with different TTLs expire independently
- [x] 1.7 Write failing tests for persistence: active skills written to `~/.reeboot/active-skills.json` on `load_skill`; on startup, non-expired skills restored with remaining TTL; on startup, already-expired skills discarded; missing file on startup is a no-op; corrupted file on startup is ignored with console.warn

## 2. Config (GREEN)

- [x] 2.1 Add `skills` block to `src/config.ts`: `{ permanent: string[], ephemeral_ttl_minutes: number, catalog_path: string }` with defaults `{ permanent: [], ephemeral_ttl_minutes: 60, catalog_path: '' }`; export `SkillsConfig` type; write passing config parse tests

## 3. Catalog Resolution (GREEN)

- [x] 3.1 Implement `resolveCatalogPath(): string[]` — returns list of skill root directories to search: (1) bundled catalog path inside reeboot package (`<pkg>/skills/`), (2) extended catalog at `config.skills.catalog_path` or `~/.reeboot/skills-catalog/` if present; order: bundled first, extended second
- [x] 3.2 Implement `findSkill(name: string, roots: string[]): string | null` — searches each root for `<root>/<name>/SKILL.md`; returns directory path or null; case-insensitive name match
- [x] 3.3 Implement `readSkillMeta(skillDir: string): { name: string; description: string } | null` — reads and parses SKILL.md frontmatter; returns null on parse error; ensure 1.1, 1.4 catalog tests pass

## 4. Permanent Skills (GREEN)

- [x] 4.1 In `skill-manager` extension, handle `resources_discover` event: for each name in `config.skills.permanent`, call `findSkill()` to resolve path; collect valid paths into array; return `{ skillPaths }` from handler; log warning and skip for names not found in catalog; ensure 1.1 tests pass

## 5. Ephemeral Skill State (GREEN)

- [x] 5.1 Implement `ActiveSkillStore` class: internal `Map<string, { skillDir: string; description: string; expiresAt: number }>`, `load(name, dir, desc, ttlMs)`, `unload(name)`, `getActive(): ActiveSkill[]`, `pruneExpired(): string[]` (returns removed names); ensure 1.2, 1.3 state tests pass
- [x] 5.2 Implement `persistStore(store, path)` and `restoreStore(path, now): Map` — write/read `~/.reeboot/active-skills.json` as `[{ name, skillDir, description, expiresAt }]`; discard entries where `expiresAt <= now`; handle missing/corrupted file gracefully; ensure 1.7 persistence tests pass
- [x] 5.3 On extension load: call `restoreStore()` to reload any non-expired skills from disk into `ActiveSkillStore`; ensure 1.7 startup restore tests pass

## 6. TTL Expiry Loop (GREEN)

- [x] 6.1 Start a `setInterval` loop (60_000ms) in the extension: call `store.pruneExpired()`, call `persistStore()` if anything was removed; ensure 1.6 expiry loop tests pass
- [x] 6.2 Register `pi.on("session_shutdown", () => clearInterval(loop))` to stop the loop cleanly

## 7. `before_agent_start` Injection (GREEN)

- [x] 7.1 Handle `before_agent_start` event: if `store.getActive()` is empty return undefined; otherwise build XML block and return `{ systemPrompt: event.systemPrompt + xml }`; XML format: `<active_skills><skill name="..."><description>...</description><expires_in>N minutes</expires_in></skill></active_skills>`; ensure 1.5 injection tests pass

## 8. Agent Tools (GREEN)

- [x] 8.1 Register `load_skill` tool: params `{ name: string, ttl_minutes?: number }`; resolve skill from catalog; if not found return error; load into store with TTL; persist; return success with skill description and expiry; ensure 1.2 tool tests pass
- [x] 8.2 Register `unload_skill` tool: params `{ name: string }`; if not active return error; remove from store; persist; return confirmation; ensure 1.3 tool tests pass
- [x] 8.3 Register `list_available_skills` tool: params `{ query?: string }`; scan all catalog roots for SKILL.md files; read name + description from each; if query provided filter by case-insensitive substring match on name or description; return JSON array of `{ name, description }`; ensure 1.4 tool tests pass

## 9. Extension Registration (GREEN)

- [x] 9.1 Add `skillManagerEnabled` factory block to `src/extensions/loader.ts` following existing pattern (gated on `config.extensions.core.skill_manager ?? true`); verify extension loads cleanly in integration

## 10. Integration & Documentation

- [x] 10.1 Run full test suite — all 1.1–1.7 tests green; no regressions in existing 344 tests
- [ ] 10.2 Manual smoke test (permanent skills): add `github` to `config.skills.permanent`, start agent, ask "what skills do you have?", verify github skill description appears
- [ ] 10.3 Manual smoke test (ephemeral load): ask agent "load the notion skill for 30 minutes", verify it calls `load_skill("notion", 30)`, verify notion description appears in next turn's context
- [ ] 10.4 Manual smoke test (TTL expiry): load a skill with `ttl_minutes: 1`, wait 2 minutes (advance fake clock in test), verify skill no longer in context
- [ ] 10.5 Manual smoke test (persistence): load a skill, restart server, verify skill is still active with reduced TTL
- [ ] 10.6 Update `README.md`: document `config.skills` block, permanent vs ephemeral skills, the three agent tools, and how to add skills to the bundled catalog
- [x] 10.7 Log key decisions to `architecture-decisions.md`: skill TTL lifecycle model, `before_agent_start` vs `resources_discover` for ephemeral skills, `active-skills.json` persistence format, catalog resolution order
