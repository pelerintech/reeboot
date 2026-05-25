# Spec — supply-chain-scanning

At startup, reeboot checks installed npm packages against a curated catalog of known-compromised versions. Results appear in operational logs and `reeboot doctor`.

## Scenarios

### 1. Flags known-compromised package at startup

**GIVEN** `package-lock.json` lists `compromised-lib@1.2.3`
**AND** `src/security/advisories.json` contains an advisory matching `compromised-lib` version `>=1.0.0 <2.0.0`
**WHEN** `scanDependencies()` runs at startup
**THEN** an advisory is returned with `id`, `package: "compromised-lib"`, `version: "1.2.3"`, `description`, `remediation`, and `date`

### 2. Logs warning to operational_logs

**GIVEN** a dependency matches an advisory
**WHEN** `scanDependencies()` runs
**THEN** a `getLogger().warn()` call is made with `{ component: 'advisory-scanner', advisoryId: '...', package: '...', version: '...' }`

### 3. Prints banner to stdout

**GIVEN** an advisory is found
**WHEN** startup completes
**THEN** stdout includes `⚠ Package 'compromised-lib' v1.2.3 matches advisory FOO-2026-001. Run 'reeboot doctor' for details.`

### 4. Does not flag safe packages

**GIVEN** `package-lock.json` lists `lodash@4.17.21` (no advisory for it)
**WHEN** `scanDependencies()` runs
**THEN** no advisory is returned

### 5. Does not flag when version is outside advisory range

**GIVEN** advisory is for `compromised-lib >=1.0.0 <2.0.0`
**AND** installed version is `compromised-lib@2.0.0` (clean release)
**WHEN** `scanDependencies()` runs
**THEN** no advisory is returned

### 6. `reeboot doctor` shows advisory details

**GIVEN** an advisory exists for an installed package
**WHEN** the operator runs `reeboot doctor`
**THEN** the output includes the advisory ID, package name, installed version, description, and remediation steps

### 7. Ack suppresses re-alert

**GIVEN** advisory `FOO-2026-001` is in `config.security.advisories.acked_advisories`
**WHEN** `scanDependencies()` runs
**THEN** no operational_logs warning is emitted for that advisory
**AND** no stdout banner is printed for that advisory

### 8. Acked advisory still shows in doctor

**GIVEN** advisory `FOO-2026-001` has been acked
**WHEN** the operator runs `reeboot doctor`
**THEN** the advisory is still listed (with an `[ACKED]` marker or note)
