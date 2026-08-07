# Capability: lean-bundle

Bundled user-facing skills are pruned to the 5 core; internal/harness skills are
unchanged.

## Scenarios

### SC-1: Bundle ships exactly the 5 core skills
**GIVEN** a fresh build of the reeboot npm package
**WHEN** the bundled user-facing skill catalog is enumerated (excluding internal)
**THEN** the set is exactly `{gmail, gcal, slack, github, gdrive}` — `files`,
`postgres`, `sqlite`, `docker`, `hubspot`, `linear`, `notion` are **absent** from
the shipped bundle.

### SC-2: Internal/harness skills are unaffected
**GIVEN** the package is built after the prune
**WHEN** internal/harness skills are enumerated
**THEN** `web-research`, `send-message`, `reeboot-tasks`, `visual-charting`,
`visual-planning` remain present and always-in-context, never user-manageable.

### SC-3: Default enabled set is the 5 core
**GIVEN** no enabled-state file exists yet
**WHEN** `createSkillsStore()` derives its default
**THEN** the default enabled set is exactly the 5 bundled core skills.

### SC-4: Cut skills remain recoverable via the catalog source
**GIVEN** a skill was removed from the bundle (e.g. `notion`)
**WHEN** its content is located
**THEN** it is present in the catalog repo (see remote-catalog-repo), not deleted
from the ecosystem.
