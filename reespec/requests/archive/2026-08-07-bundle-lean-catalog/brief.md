# Bundle-lean catalog: 5-skill core + curated remote catalog

## What

Trim reeboot's bundled user-facing skill catalog from 12 to a **lean core of 5**
(`gmail`, `gcal`, `slack`, `github`, `gdrive`), physically removing the other 7
(`files`, `postgres`, `sqlite`, `docker`, `hubspot`, `linear`, `notion`) from the
shipped npm package. The cut skills are not lost — they are relocated into a new
**independent curated catalog repo**, which users browse and install from
selectively via the web UI and/or `reeboot skills update`. The catalog coexists
with the existing user-upload pipeline and the enabled-set model.

## Why

- The bundled catalog drifted to 12 skills with no principled cut. A large
  default catalog dilutes the product for a personal-assistant operator and adds
  ongoing maintenance/audit burden for skills most users never touch.
- Evidence from comparable agents (Hermes/Nous: capability core + opt-in SaaS via
  MCP; OpenClaw: lean core + remote skill registry) shows the industry pattern for
  self-hosted agents is a **lean default core with a remotely-fetched, opt-in
  catalog** — not a fat bundle.
- A personal-assistant operator in the field settles on roughly Google + GitHub +
  a messaging surface; the cut skills are the long tail.
- Nothing should be lost: relocation into a curated catalog keeps every cut skill
  recoverable — one `skills update` / install away.

## Goals

- Ship exactly **5** bundled user-facing skills; internal/harness skills unchanged.
- Establish a **remote curated catalog** (independent repo) seeded with the 7 cut
  skills.
- `reeboot skills update` **completes** (was a stub): fetch the catalog manifest
  + install skill packages.
- Surface catalog **browse + install in the web UI** (Skills page), not CLI-only.
- Compose with skills-ui: **three sources — bundled, user-upload, remote — feed the
  same local catalog + enabled-set**; user uploads keep working unchanged.

## Non-goals

- **Catalog extensions** (`catalog/tools/`) install — `tools/` is present in the
  catalog repo structure, but installing extensions as capabilities is deferred to
  a follow-up. This release installs **skills only**.
- Ree-mode skill delivery (separately deferred in an earlier decision).
- Layer-2 content validation of catalog-sourced skills (delegated to existing
  security/context policies, same as uploads).
- A full hosted marketplace with search/discovery (Hermes-Skills-Hub-style) — this
  is a curated catalog with a manifest, not a marketplace platform.
- Removing or altering the existing user-upload skill pipeline.

## Impact

- npm package ships 5 core skills instead of 12.
- New independent catalog repo (`~/p/pel/ree/catalog`, hosted under
  `pelerintech/` org) with `skills/` + `tools/` + `index.json`.
- `skills update` CLI command completes (currently prints a count-only stub).
- Skills web UI gains a catalog browse/install section.
- `/api/skills` `source` extended to `bundled | user | remote`; new catalog
  browse/install endpoints.
- New config `skills.catalog_url` (and small supporting config).
