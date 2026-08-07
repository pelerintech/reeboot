# Tasks — bundle-lean-catalog

Vertical slices per capability, one behavior per task. Code REDs are runnable test
files under `reeboot/tests/`. Commands run from `reeboot/`.

---

## Capability: lean-bundle

### 1. Prune the bundle to the 5 core user-facing skills

- [x] **RED** — Write/extend `tests/skills-catalog.test.ts`: assert `listUserSkills()`
      returns exactly `{gmail, gcal, slack, github, gdrive}` when run against the
      reeboot package root (bundled user-facing catalog). Run `npx vitest run tests/skills-catalog.test.ts` →
      fails (currently lists 12, including the 7 to cut).
- [x] **ACTION** — Relocate `notion`, `linear`, `docker`, `postgres`, `sqlite`,
      `hubspot`, `files` directories out of `reeboot/skills/` (seeding the catalog
      repo in task 2). Confirm `skills/` retains only `gmail gcal slack github gdrive`
      plus `internal/`.
- [x] **GREEN** — Re-run `npx vitest run tests/skills-catalog.test.ts` → the bundled
      set assertion passes. Also run `tests/skill-manager.test.ts` + `tests/skills-paths.test.ts`
      to confirm internal-skill wiring is unaffected.

---

## Capability: remote-catalog-repo

### 2. Create the independent catalog repo with the cut skills + manifest

- [x] **RED** — Check: `~/p/pel/ree/catalog` does not exist (or lacks
      `skills/notion/SKILL.md`, `tools/`, `index.json`). Assertion fails — repo not
      provisioned.
- [x] **ACTION** — Provision `~/p/pel/ree/catalog`: `git init`, create `skills/`
      (move the 7 cut skill packages here — `notion linear docker postgres sqlite
      hubspot files`), create empty `tools/`, and author `index.json` with a
      `skills[]` manifest (each entry: `name`, `description`, `version`,
      `category`, `zip`) + a `tools` structure; push to a `pelerintech/` remote.
      Add a per-skill `SKILL.md` frontmatter check.
- [x] **GREEN** — Verify: repo on disk has `skills/` (7 dirs, each with valid
      `SKILL.md`), `tools/`, `index.json`; `git` remote is set; manifest parses.

---

## Capability: remote-catalog-fetch

### 3. Add configurable `skills.catalog_url` (+ remote catalog path) to config

- [x] **RED** — Write `tests/skills-config.test.ts`: assert the `skills` config
      schema accepts `catalog_url` (default `''`) and `remote_catalog_path`
      (default `''`); parse a config with those set. Run → fails (fields absent).
- [x] **ACTION** — Extend `SkillsConfigSchema` in `src/config.ts` with
      `catalog_url` (the operator-configurable remote catalog address) and
      `remote_catalog_path` string defaults, and document both in
      `config.example.json`'s `skills` block. An empty `catalog_url` means no
      remote catalog configured.
- [x] **GREEN** — Re-run `npx vitest run tests/skills-config.test.ts` → passes.

### 4. Add the `remote` source and third catalog root to the local catalog scan

- [x] **RED** — Write/extend `tests/skills-catalog.test.ts`: `SkillSource` type
      allows `'remote'`; with a skill directory present under a remote root,
      `listUserSkills()` returns it tagged `source: 'remote'`; `resolveUserCatalogRoots`
      includes the remote root. Run → fails (no remote source/root yet).
- [x] **ACTION** — In `src/skills/catalog.ts`: extend `SkillSource` to
      `'bundled' | 'user' | 'remote'`; add `defaultRemoteCatalogDir()` + a remote
      root to `resolveUserCatalogRoots`/`listUserSkills` (source-tagged, collated
      after bundled, before/with uploads per decision D4).
- [x] **GREEN** — Re-run `npx vitest run tests/skills-catalog.test.ts` + `tests/skills-paths.test.ts`
      → passes.

### 5. Shared remote-catalog domain: fetch index + install a skill

- [x] **RED** — Write `tests/skills-remote-catalog.test.ts` using a **local fixture**
      (a temp `index.json` + zip): assert (a) fetching the manifest returns parsed
      available entries; (b) installing a valid fixture skill promotes it into the
      remote root, validates via Layer 1, and auto-enables it; (c) a name collision
      rejects with no file change; (d) an invalid zip (traversal) rejects and
      promotes nothing. Run → fails (module absent).
- [x] **ACTION** — Add `src/skills/remote-catalog.ts` (SDK-agnostic): `fetchCatalogIndex(url)`,
      `listAvailable`, `installCatalogSkill(name, { url, root })` that downloads the
      zip, runs `promoteSkillZip`-style Layer-1 validation into the remote root,
      and `setEnabled(name, true)`; collision check mirrors upload. Errors returned
      as structured results.
- [x] **GREEN** — Re-run `npx vitest run tests/skills-remote-catalog.test.ts` → all
      four behaviors pass.

### 6. Complete `reeboot skills update` CLI (fetch + install)

- [x] **RED** — Extend `tests/skills.test.ts` (or new CLI test): invoking the update
      path against a fixture catalog URL reduces to fetching + installing (no longer
      the count-only "coming soon" message). Assert output reports installed skills.
      Run → fails (stub unchanged).
- [x] **ACTION** — In `src/skills-cli.ts`/`src/index.ts`: wire `update` to
      `remote-catalog.ts`, reading the catalog address from
      `config.skills.catalog_url` (operator-configured, never hardcoded); print
      installed/available summary; keep exit 0; if `catalog_url` is unset, print a
      clear "no remote catalog configured" message.
- [x] **GREEN** — Re-run the CLI test → passes; `tsc --noEmit` in `reeboot/` clean.

---

## Capability: skills-api-remote

### 7. Extend `/api/skills` list source + allow remote delete

- [x] **RED** — Extend `tests/skills-api.test.ts`: (a) a remote-installed skill shows
      `source: 'remote'` in `GET /api/skills`; (b) `DELETE /api/skills/:name` removes
      a remote skill and disables it, while bundled + internal still reject. Run →
      fails (no remote source handling in API).
- [x] **ACTION** — In `src/server.ts`: pass through the extended `source` from
      `listUserSkills`; extend the DELETE handler to remove remote skills (and keep
      bundled/internal rejections).
- [x] **GREEN** — Re-run `npx vitest run tests/skills-api.test.ts` → passes.

### 8. Add catalog browse + install REST endpoints

- [x] **RED** — Write/extend `tests/skills-api.test.ts`: `GET /api/skills/catalog`
      returns available remote entries (with collision flag) from a fixture catalog;
      `POST /api/skills/catalog/install { name }` installs and returns
      `{ ..., source: 'remote', enabled: true }`; auth is enforced (401 without
      token/loopback). Run → fails (endpoints absent).
- [x] **ACTION** — In `src/server.ts`: add `GET /api/skills/catalog` and
      `POST /api/skills/catalog/install` behind `skillsAuthOk`, delegating to
      `remote-catalog.ts` with the catalog address read from
      `config.skills.catalog_url` + remote root.
- [x] **GREEN** — Re-run `npx vitest run tests/skills-api.test.ts` → passes.

---

## Capability: skills-ui-remote

### 9. Skills page: catalog browse/install section

- [x] **RED** — Extend `webchat` Skills UI test (existing vitest setup): the page
      accepts a `source` value `'remote'`; renders an **available** list from
      `/api/skills/catalog` with an Install action; clicking Install calls
      `/api/skills/catalog/install` and moves the row to installed; install errors
      surface. Run → fails (no remote handling in the component).
- [x] **ACTION** — In `webchat/src/pages/Skills.tsx`: add the catalog section that
      fetches `/api/skills/catalog`, renders available rows with Install, handles the
      install response (repaint main list + available list), shows errors, and keeps
      the existing toggle/upload/remove behavior intact (UI-1..UI-5).
- [x] **GREEN** — Re-run the webchat vitest suite → passes.

### 10. Full suite green + docs/entry-point housekeeping

- [x] **RED** — Check: `reeboot/README.md` and `docs/extending/skills.md` still
      describe the 12-skill bundle (stale: they list cut skills as bundled); run
      `npx vitest run` and find the current suite has any skills-related failures on
      the new 5-core assumption. Assertion fails — docs stale / suite inconsistent.
- [x] **ACTION** — Update `README.md` + `docs/extending/skills.md`: "Bundled Skills"
      now lists the 5 core; document the curated catalog + `reeboot skills update` +
      UI install; add a `CHANGELOG.md` entry; reconcile any stale test fixtures
      (e.g. 12-skill counts) to the 5-core set.
- [x] **GREEN** — Run `npx vitest run` (and webchat suite) → **full suite green**;
      doc grep confirms cut skills are no longer described as bundled; `tsc --noEmit`
      clean.
