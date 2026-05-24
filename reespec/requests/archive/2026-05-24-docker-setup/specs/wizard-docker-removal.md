# Spec — Wizard Docker Path Removal

## Capability

The `reeboot init` wizard no longer asks about deployment method (Native vs Docker). Docker is a separate documented path, not a wizard branch.

## Scenarios

### GIVEN `reeboot init` is run
WHEN the wizard starts
THEN the first prompt is provider selection (not deployment method)
AND the user is never asked "Native or Docker?"

### GIVEN the wizard source file (`src/wizard/index.ts`)
WHEN the file is inspected
THEN there is no `deploymentChoice` variable
AND there is no `select({ message: 'How do you want to run Reeboot?' })` call
AND there is no `'coming soon'` fallback message

### GIVEN `reeboot/README.md`
WHEN the deployment step description is inspected
THEN it no longer says "1. **Deployment** — native (default) or Docker (coming soon)"
AND the numbering starts from "1. **Provider**"