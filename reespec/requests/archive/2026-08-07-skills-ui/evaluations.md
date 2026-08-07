## Evaluation — 2026-08-07 15:05

### catalog-boundary
verdict:  ✅ SATISFIED
reason:   SC-3 requires `visual-charting.md` and `visual-planning.md` be moved into the internal folder — both now live at `reeboot/skills/internal/`. SC-1/SC-2 hold: `listUserSkills()` (src/skills/catalog.ts) skips `skills/internal/` by construction, and the REST layer filters `!isInternalSkillName(...)`, so internal skills are never listed or manageable.

### enabled-set
verdict:  ✅ SATISFIED
reason:   `EnabledSkillsStore` (src/skills/enabled-store.ts) persists `{enabled:[]}` to `~/.reeboot/skills-state.json` and live-reads it on every `getEnabled()` call — EN-1 (persists, tested "across a re-buildApp" in tests/skills-api.test.ts), EN-2/EN-3 (live, no restart), and EN-4 (share `createSkillsStore(config)` between REST and the extension, same default path).

### skill-manager-integration
verdict:  ✅ SATISFIED
reason:   `loader.ts:447` hands `additionalSkillPaths: activeSkillPaths(config)` (enabled + internal, excludes disabled). In src/extensions/skill-manager.ts, `list_available_skills` filters `store.isEnabled(...)` (SM-2) and `load_skill` returns "skill is not available (disabled)" for disabled non-internal skills (SM-3), both consulting the live store (SM-4). 46 skill-manager tests pass.

### skills-api
verdict:  ✅ SATISFIED
reason:   src/server.ts routes `GET/PUT /api/skills`, `POST /api/skills/upload`, `DELETE /api/skills/:name`. API-1 returns `{name,description,source,enabled}` excluding internal; API-2 PUT persists and GET reflects it; API-3 PUT/DELETE reject internal (400); API-4 returns 401 for non-loopback without token (`skillsAuthOk`). All covered and passing in tests/skills-api.test.ts.

### skills-upload
verdict:  ⚠️ PARTIAL
reason:   UP-1/UP-2/UP-3/UP-4/UP-5 are implemented and tested in src/skills/zip-validate.ts + tests/skills-upload-pipeline.test.ts. But UP-6 explicitly names "an executable or symlink" as rejected types — executables are caught by the extension allowlist, while a symlink entry (`link.md → /etc/passwd`) passes `validateSkillZip` returning `{ok:true}` (verified empirically). The symlink case is not rejected.
focus:    src/skills/zip-validate.ts — add symlink detection to `disallowedType`/entry scan; no test covers a symlink entry

### skills-web-ui
verdict:  ✅ SATISFIED
reason:   webchat/src/pages/Skills.tsx + components/Navigation.tsx implement UI-1 (Skills tab), UI-2 (name/description/source + toggle via PUT), UI-3 (zip upload + error reason), UI-4 (DELETE remove for `source==='user'`), UI-5 (bundled rows have no Remove), UI-6 (internal never shown — enforced by the API). 6 UI tests pass (webchat/vitest.config.ts).

## Triage

✅ Safe to skip:   catalog-boundary, enabled-set, skill-manager-integration, skills-api, skills-web-ui

⚠️  Worth a look:  skills-upload — UP-6 specifies symlink entries must be rejected; `validateSkillZip` lets a symlink entry through (`{ok:true}`). Executables are covered, symlinks are not, and there is no test for it.

❓  Human call:    none

---
## Evaluation — 2026-08-07 15:16

### catalog-boundary
verdict:  ✅ SATISFIED
reason:   SC-3 requires `visual-charting.md` and `visual-planning.md` moved into the internal folder — both now live at `reeboot/skills/internal/`. SC-1/SC-2 hold: `listUserSkills()` (src/skills/catalog.ts) skips `INTERNAL_DIR_NAME` by construction and the REST layer filters `!isInternalSkillName(...)`, so internal skills never list and PUT/DELETE on them return 400.

### enabled-set
verdict:  ✅ SATISFIED
reason:   `EnabledSkillsStore` (src/skills/enabled-store.ts) persists `{enabled:[...]}` to `~/.reeboot/skills-state.json` and live-reads the file on every `getEnabled()`/`isEnabled()` (EN-1 reconstruct-restores, EN-2/3 live no-restart, EN-4 same `createSkillsStore(config)` path shared by REST and extension). Persistence and cross-instance visibility verified by tests/skills-store.test.ts and "PUT persists across a re-buildApp" in tests/skills-api.test.ts.

### skill-manager-integration
verdict:  ✅ SATISFIED
reason:   `src/extensions/loader.ts:447` hands `additionalSkillPaths: activeSkillPaths(config)` (enabled user + internal, excludes disabled — SM-1). In src/extensions/skill-manager.ts, `list_available_skills` filters `store.isEnabled(...)` (SM-2) and `load_skill` returns "not available (disabled)" for disabled non-internal skills (SM-3); both read the store per call (SM-4). Dedicated SM-2/SM-3 tests at tests/skill-manager.test.ts:943/971 pass.

### skills-api
verdict:  ✅ SATISFIED
reason:   src/server.ts implements `GET/PUT /api/skills`, `POST /api/skills/upload`, `DELETE /api/skills/:name`. API-1 returns `{name,description,source,enabled}` excluding internal; API-2 PUT persists and GET reflects it (tested across re-buildApp); API-3 PUT/DELETE reject internal; API-4 `skillsAuthOk` returns 401 for non-loopback without a valid token. All four covered and passing in tests/skills-api.test.ts.

### skills-upload
verdict:  ✅ SATISFIED
reason:   src/skills/zip-validate.ts + upload.ts cover UP-1 (valid promote+enabled), UP-2 (name collision), UP-3 (`..`/absolute traversal), UP-4 (expanded-size + ratio caps), UP-5 (missing SKILL.md), UP-6 (disallowed extension via allowlist AND unix special-file/symlink via `isSpecialFile`, 0xA000). Each has a passing test in tests/skills-upload-pipeline.test.ts (8/8 pass).

### skills-web-ui
verdict:  ✅ SATISFIED
reason:   webchat/src/pages/Skills.tsx + components/Navigation.tsx implement UI-1 (Skills tab), UI-2 (name/description/source + toggle via PUT), UI-3 (zip upload + error reason on failure), UI-4 (DELETE remove), UI-5 (Remove only rendered when `source==='user'`), UI-6 (internal never shown, enforced by API). 6 UI tests pass in webchat/src/pages/__tests__/Skills.test.tsx.

## Triage

✅ All capabilities satisfied — no action required.

---
