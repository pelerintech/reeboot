# Skills UI — tasks

Every task has exactly three steps: RED (a failing test/assertion), ACTION
(implement), GREEN (verify pass). RED for code tasks is a runnable test file.

---

## 1. Catalog restructure (internal vs user)

### 1. Internal skills moved out of the user catalog

- [x] **RED** — Write `reeboot/tests/skills-catalog.test.ts`: use `buildApp({db, reeBootDir, config})` (pattern from `resilience-integration.test.ts`), seed the reebotDir with a bundled catalog, call `GET /api/skills`, and assert: user-facing skills (e.g. `github`) are present AND internal skills (`visual-charting`, `visual-planning`, `web-research`, `send-message`, `reeboot-tasks`) are absent. Test fails — internal skills are still listed.
- [x] **ACTION** — Restructure the bundled catalog: create `reeboot/skills/internal/`, move harness skills + the loose `.md` files into it; make the user-catalog resolver scan only the user-facing portion and exclude internal.
- [x] **GREEN** — Run `npx vitest run reeboot/tests/skills-catalog.test.ts` → passes.

### 2. Internal skills cannot be managed via the API

- [x] **RED** — Add to `reeboot/tests/skills-api.test.ts`: `PUT /api/skills` with an internal skill name returns an error; `DELETE /api/skills/<internal>` returns an error. Fails today.
- [x] **ACTION** — Make the REST handlers reject any operation targeting a known internal skill.
- [x] **GREEN** — Run the test → passes.

## 2. Enabled-set store

### 3. Enabled store persists, restores, and reflects writes live

- [x] **RED** — Write `reeboot/tests/skills-store.test.ts` for an `EnabledSkillsStore` (or equivalent): default is empty (or from `config.skills.permanent`); `setEnabled(name, bool)` persists to `~/.reeboot/skills-state.json`; reconstructing a store from that file restores the same set; a store instance sees a change written by another instance (live read). Fails — no such store exists.
- [x] **ACTION** — Implement an SDK-agnostic enabled-set store module (load from `skills-state.json`, persist, per-call read/hash to detect external writes). No pi/ree imports.
- [x] **GREEN** — Run `npx vitest run reeboot/tests/skills-store.test.ts` → passes.

## 3. Zip upload validation (Layer 1)

### 4. Zip validation rejects traversal, bombs, disallowed types, missing SKILL.md

- [x] **RED** — Write `reeboot/tests/skills-upload-pipeline.test.ts` for a pure `validateSkillZip` function (pass a zip buffer): a valid skill zip passes; an entry with `..` fails; an absolute-path entry fails; a decompression-bomb ratio fails; a disallowed file type (e.g. `.exe`, symlink) fails; a zip with no `SKILL.md` fails. All currently fail — function does not exist.
- [x] **ACTION** — Implement zip central-directory inspection + bounded extraction + frontmatter re-validation (reuse `readSkillMeta`). No extraction before validation passes.
- [x] **GREEN** — Run the test → passes.

### 5. Upload promotes skill and rejects collision

- [x] **RED** — Add to `reeboot/tests/skills-api.test.ts`: `POST /api/skills/upload` with a valid zip creates the skill, writes it under the upload catalog, and lists it as enabled; a second upload with a colliding name returns an error (not shadowing). Fails — no endpoint.
- [x] **ACTION** — Implement `POST /api/skills/upload`: validate → extract to temp → check collision → promote to `<upload>/<name>/` → add to enabled set.
- [x] **GREEN** — Run the test → passes.

## 4. Skills REST API

### 6. GET list shape, PUT toggle persist, DELETE user-only

- [x] **RED** — Write `reeboot/tests/skills-api.test.ts` (or extend): `GET /api/skills` returns `{name, description, source, enabled}` for all user-facing skills, excluding internal; `PUT` toggles and persists (survives a re-`buildApp`); `DELETE` removes a user-uploaded skill's files; `DELETE` on a bundled skill returns an error. Fails — no endpoints.
- [x] **ACTION** — Implement `GET /api/skills`, `PUT /api/skills`, `DELETE /api/skills/:name` following existing server.ts Hono + auth patterns.
- [x] **GREEN** — Run the test → passes.

### 7. Unauthorized access is rejected

- [x] **RED** — Add a test asserting `/api/skills` returns 401 for a non-loopback request without a valid token when `token` is set (match the existing WS/auth guard pattern). Fails — endpoints not gated.
- [x] **ACTION** — Apply the existing auth/token gate to `/api/skills` endpoints, consistent with other REST endpoints.
- [x] **GREEN** — Run the test → passes.

## 5. Skill-manager extension integration

### 8. list_available_skills and load_skill gate on the enabled set, live

- [x] **RED** — Extend the skill-manager tests: with a skill disabled, `list_available_skills` omits it; `load_skill` on a disabled skill errors; after enabling via the store (simulating a UI toggle mid-run), the very next call observes it — no re-init. Fails — extension ignores the enabled set.
- [x] **ACTION** — Update the extension to read the enabled store per call; filter `list_available_skills` to enabled; `load_skill` rejects non-enabled skills; keep the `isBundledSkill` trust marker for user-uploaded skills.
- [x] **GREEN** — Run the targeted vitest suite → passes.

### 9. pi receives only enabled + internal skill paths (no restart)

- [x] **RED** — Write a unit test for a `computeActiveSkillPaths(enabled, internal, catalog)` helper asserting the returned paths include internal + enabled user skills and exclude disabled user skills (and exclude the full-catalog passthrough). Fails — no such helper.
- [x] **ACTION** — Implement the SDK-agnostic `computeActiveSkillPaths` helper; wire it so the paths handed to pi (instead of the whole `skills/` dir at `loader.ts:445`) are filtered. Keep internal always-in.
- [x] **GREEN** — Run the test → passes.

## 6. Web UI Skills page

### 10. Skills tab and list

- [x] **RED** — Write `reeboot/webchat/src/pages/__tests__/Skills.test.tsx`: mock `fetch('/api/skills')`; assert the page renders each skill with name/description/source/enabled state and a toggle per row; assert a `skills` tab exists in `App.tsx` navigation. Fails — no page/tab.
- [x] **ACTION** — Add a `skills` tab to `App.tsx` and a `pages/Skills.tsx` that lists skills from `GET /api/skills` with toggles.
- [x] **GREEN** — Run `npx vitest run webchat` (Skills tests) → passes.

### 11. Upload and remove interactions

- [x] **RED** — Add to `Skills.test.tsx`: selecting a zip posts to `/api/skills/upload` and shows the new skill on success / the error reason on failure; the remove action calls DELETE and deletes the user-uploaded row; bundled rows have no remove action. Fails — not implemented.
- [x] **ACTION** — Implement upload control (File input → FormData POST) and per-row remove (DELETE) in `pages/Skills.tsx`; hide remove for bundled skills.
- [x] **GREEN** — Run the Skills tests → passes.

## 7. Integration & docs

### 12. Full suite green + docs

- [x] **RED** — Check: `README.md`/docs lack a section on the Skills UI and config; and the full test suite is not verified against the restructure. Assertion fails/absent.
- [x] **ACTION** — Document the Skills page, enabled set, and upload (Layer-1) in docs + README; update `reespec/requests/skill-manager` notes if the permanent tier is superseded; run the full test suite and fix regressions from the catalog restructure.
- [x] **GREEN** — Full suite passes; docs section present; manual smoke (enable/disable/upload/remove in the web UI with no restart) verified.
