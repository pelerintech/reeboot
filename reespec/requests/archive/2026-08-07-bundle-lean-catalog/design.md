# Bundle-lean catalog — design

## Overview

Two coordinated changes:

1. **Prune the bundle** — `skills/` ships only the 5 core user-facing skills;
   the other 7 are relocated to a new independent catalog repo.
2. **Remote curated catalog** — a new repo (`~/p/pel/ree/catalog`, published under
   the `pelerintech/` org) hosts the cut skills + a manifest; reeboot fetches it on
   `reeboot skills update` and lets users browse + install selectively from the web
   UI. Installed catalog skills enter the **same** local catalog + enabled-set that
   uploads and bundled skills use.

The design follows the pattern established by skills-ui: SDK-agnostic domain code
in `src/skills/`, thin REST adapters in `server.ts`, and a web-UI surface in
`webchat/`. The remote catalog is purely a **distribution source**; once a catalog
skill is installed it is a first-class local skill like any other.

## Architecture

```
                    CATALOG REPO (independent — ~/p/pel/ree/catalog)
                    ┌──────────────────────────────────────────────┐
                    │  skills/  (notion, linear, docker, …)        │
                    │  tools/   (extensions — structural only)     │
                    │  index.json (manifest: skills[] + tools[])   │
                    └──────────────────────┬───────────────────────┘
                                           │  `reeboot skills update` / UI sync
                                           ▼
  BUNDLED CORE ──┐                 ┌── LOCAL CATALOG ─────────────────┐
  (5, in npm)    ├────────────────▶│  ~/.reeboot/skills-catalog/      │
  USER UPLOAD ───┤                 │  ~/.reeboot/skills-remote/   ←new│
  REMOTE ────────┘                 │  enabled-set (live, {enabled[]}) │
                                   └────────────┬──────────────────────┘
                                                ▼
                                 Skills UI: toggle · remove · browse/install catalog
```

Sources all land in the **same** local catalog + enabled-set. The remote source
only changes *where the bytes come from*. Post-install, a remote skill is
indistinguishable from an uploaded one (same validation, same directory shape,
same enabled-set semantics).

## Key decisions

### D1. Option B — physically prune the bundle (not default-enable-5-of-12)
The 5 core stay in `skills/` and ship in npm; the 7 are removed from the package
and become the catalog seed. Chosen over keeping all 12 and defaulting 5 on because
the goal is a genuinely lean product (less surface, less audit, smaller artifact)
and the catalog makes the removed skills recoverable. The internal/harness folder
(`skills/internal/`) is untouched.

### D2. Remote catalog is a curated, independent repo, address configurable (not a marketplace)
The catalog is a **manifest + skill zips** curated by the reeboot operator, hosted
at a public URL. `index.json` lists entries (name, version, description, category,
author, license, zip URL). This is the *distribution* tier, not the
*discovery-marketplace* tier (no search server / moderation infra). It completes
the original reeboot-skills design's stubbed "extended catalog tarball download."

**The catalog address is operator-configurable via `config.json`** —
`skills.catalog_url` — pointing at any URL/repo/index the operator chooses. It is
**never hardcoded** to a specific org/repo. The CLI (`skills update`) and the REST
layer both read the address from config at call time; when `catalog_url` is unset,
both surfaces report "no remote catalog configured" rather than failing. The
pelerintech catalog repo is only the *default example* the operator may point at.

### D3. `catalog/tools/` is structural-only this release
The catalog repo has both `skills/` and `tools/` subfolders. Extensions (tools) are
unrelated to skills and their install path is a different mechanism. This request
implements **skills only**; `tools/` exists in the repo/manifest shape but is not
installed or surfaced as installable.

### D4. Three sources compose through the existing model
`SkillSource` extends `bundled | user | remote`. A third local catalog root
(`~/.reeboot/skills-remote/`, config-overridable) holds remote-installed skills.
`listUserSkills` scans bundled, then remote, then upload roots, tagging each with
its source. Enabled-set, active-paths filter, TTL, and the Skills UI all treat the
three sources identically. The SDK-agnostic constraint holds — `src/skills/` has no
pi/ree imports.

### D5. Install reuses the Layer-1 validation pipeline
A catalog skill zip is validated by the same `validateSkillZip` /
`promoteSkillZip` machinery used for uploads (traversal, bomb-ratio, entry-count,
allowlist, symlink rejection) before promotion into the remote catalog root.
Remote-installed skills auto-enable (matching upload's behavior of enabling on
install).

### D6. Collision + delete rules across three sources
- Name collision on install (bundled, user, or remote already present) → rejected.
- `bundled`: never deletable (as today).
- `user` and `remote`: deletable (removes the skill dir + disables).

### D7. UI surface is in the Skills page (not CLI-only)
A catalog section in Skills.tsx shows **available** remote entries (from the fetched
manifest) with an install action per row; installed remote skills appear in the main
list with `source: 'remote'` and a remove action. `reeboot skills update` (CLI)
remains as the non-UI path and shares the same domain module.

## Components / files

- **`src/skills/remote-catalog.ts`** (new, SDK-agnostic): fetch `index.json` from
  `skills.catalog_url`; list available entries; install one (download zip, run
  Layer-1 validation, promote to remote root, auto-enable). Reused by CLI + REST.
- **`src/skills/catalog.ts`** (modified): `SkillSource` → `bundled|user|remote`;
  add remote catalog root to resolution/scanning; source tagging.
- **`src/skills/enabled-store.ts`**: unchanged (defaults derive from bundled list).
- **`src/config.ts`** (modified): `skills.catalog_url` (the configurable remote
  catalog address) + `remote_catalog_path` override added to the `skills` schema
  and to `config.example.json`.
- **`src/skills-cli.ts` / `src/index.ts`** (modified): `update` fetches + installs.
- **`src/server.ts`** (modified): extend `/api/skills` `source`; add
  `GET /api/skills/catalog` (available remote entries) + `POST /api/skills/catalog/install`.
- **`webchat/src/pages/Skills.tsx`** (modified): catalog browse/install section.
- **Catalog repo** (`~/p/pel/ree/catalog`): `skills/` (7 seed) + `tools/` +
  `index.json`, published.

## Risks / notes

- **Backward compatibility of enabled-state**: on fresh install the default enabled
  set = the 5 bundled skills (default derives from the bundled list, so pruning the
  bundle naturally shrinks the default). Existing state files retain their entries;
  a previously-enabled cut skill name that no longer exists in the catalog is simply
  inert.
- **Live no-restart** must hold for remote installs: the extension re-reads the
  enabled store + catalog per call (existing behavior). Remote-installed skills must
  appear on the next `list/load` without restart.
- **Remote fetch trust**: catalog content arrives over a public URL. Package-level
  trust is enforced by the Layer-1 pipeline. Content trust (Layer 2) is out of
  scope (user opted in by installing). The `catalog_url` is operator-configured.
- **Tests must not depend on the live remote repo** — fetch/install logic is driven
  against a local fixture manifest + zip in tests; the real repo is exercised via
  the non-code provisioning task + manual smoke test.
- **Zip-DL for remote installs**: reuse an HTTP fetch (same fetch primitive as the
  existing web layer); the fixture-based test covers the install path without
  network.
