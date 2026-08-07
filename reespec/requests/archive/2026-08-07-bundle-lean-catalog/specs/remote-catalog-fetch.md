# Capability: remote-catalog-fetch

The shared, SDK-agnostic fetch/install domain for the remote catalog, exercised by
both the CLI and the REST layer. Tests drive this against a local fixture manifest
+ zip (no live-network dependency).

## Scenarios

### RCF-1: Fetch the catalog manifest from the configured address
**GIVEN** a configured `skills.catalog_url` (operator-set in `config.json`)
**WHEN** the catalog is fetched
**THEN** the manifest (`index.json`) is parsed into available entries, each with
`name`, `description`, `version`, `category`, and a zip source.

### RCF-1b: Catalog address is configurable and never hardcoded
**GIVEN** an operator sets `skills.catalog_url` to any URL/repo
**WHEN** the CLI (`update`) or the API fetches the catalog
**THEN** both read the address from `config.json` (no hardcoded org/repo); if the
value is unset, both surfaces report "no remote catalog configured" without erroring.

### RCF-2: Install a catalog skill into the remote catalog root
**GIVEN** a manifest entry whose zip is available
**WHEN** the skill is installed
**THEN** the zip passes the Layer-1 validation pipeline (traversal, bomb ratio,
entry count, allowlist, symlink), is promoted into the remote catalog root
(`~/.reeboot/skills-remote/<name>/`, or configured override), and is auto-enabled
in the enabled-set.

### RCF-3: Name collision on install is rejected
**GIVEN** a skill name already present in the local catalog (bundled, user, or
remote)
**WHEN** the same-named catalog skill is installed
**THEN** the install is rejected with a clear collision error and no files change.

### RCF-4: Invalid/malicious catalog package is rejected and not promoted
**GIVEN** a catalog zip that fails Layer-1 validation (e.g. path traversal, missing
`SKILL.md`, disallowed type)
**WHEN** it is installed
**THEN** the install is rejected, nothing is promoted, and the catalog state is
unchanged.

### RCF-5: Installed remote skills are live (no restart)
**GIVEN** a remote skill has been installed
**WHEN** `listUserSkills` / the enabled-set is read on the next call
**THEN** the skill appears with `source: 'remote'` and its enabled state, without a
restart.

### RCF-6: `reeboot skills update` fetches and installs
**GIVEN** the CLI `update` command
**WHEN** run against a reachable catalog
**THEN** it fetches the manifest and installs the available catalog skills (or
reports them), replacing the current count-only stub behavior.
