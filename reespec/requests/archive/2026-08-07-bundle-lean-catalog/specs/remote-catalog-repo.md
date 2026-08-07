# Capability: remote-catalog-repo

A new independent catalog repo hosts the cut skills, plus a manifest, with
`skills/` and `tools/` subfolders.

## Scenarios

### RC-1: Catalog repo exists with the expected structure
**GIVEN** the new independent catalog repo at `~/p/pel/ree/catalog`
**WHEN** its structure is inspected
**THEN** it contains `skills/` and `tools/` subfolders and an `index.json` manifest
at the root.

### RC-2: Catalog repo is seeded with the 7 cut skills
**GIVEN** the catalog repo
**WHEN** `skills/` is enumerated
**THEN** it contains `notion`, `linear`, `docker`, `postgres`, `sqlite`, `hubspot`,
`files` — one directory each with a `SKILL.md` carrying valid `name`/`description`
frontmatter.

### RC-3: Manifest lists the available skills as installable entries
**GIVEN** the catalog repo's `index.json`
**WHEN** the manifest is read
**THEN** it contains an entry per available skill with `name`, `description`,
`version`, `category`, and a resolvable `zip` (or package) URL; and it exposes a
`tools` section structure (may be empty this release).

### RC-4: Tools present structurally but not installable this release
**GIVEN** the catalog repo
**WHEN** the manifest is inspected for installable extension entries
**THEN** reeboot does **not** treat `tools/` entries as installable skills in this
release (extension install is out of scope).
