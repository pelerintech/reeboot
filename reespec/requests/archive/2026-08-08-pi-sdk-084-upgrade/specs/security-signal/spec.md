# Capability: security signal verification

The outcome is verifiable: the high/critical security signal from the pi runtime is gone from the
runtime tree, and any residual reeboot-owned alerts are reconciled or explicitly documented.

## Scenarios

### Runtime audit returns clean for the previously-flagged pi vulns

GIVEN reeboot's runtime dependency tree (`npm audit --omit=dev` on the migrated tree)
WHEN the upgrade is complete
THEN no open high/critical advisory remains for the pi runtime's bundled `undici`/`ws`
AND the previous 1-critical/15-high headline is not reproducible from the pi pin.

### Full-suite green gates the migration

GIVEN the SDK migration
WHEN `npm run test:run` and `tsc --noEmit` run
THEN the full suite passes (excluding pre-existing, unrelated failures) and typecheck is clean.

### Residual alerts are documented

GIVEN any reeboot-owned or unavoidable advisory remains after the upgrade
WHEN the request is finalized
THEN each remaining item is recorded in the request design/decisions with its justification
(severity, exploitability, fix path) rather than silently left.
