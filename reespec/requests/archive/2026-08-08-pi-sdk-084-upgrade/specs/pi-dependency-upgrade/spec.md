# Capability: pi dependency upgrade

The pi runtime is upgraded from `0.75.4` to `0.84.1`, reeboot's pi-ai surface becomes direct
pinned dependencies, and the security signal from the pi runtime is cleared.

## Scenarios

### Pi is upgraded to the current version

GIVEN reeboot pins `@earendil-works/pi-coding-agent`
WHEN the dependency task completes
THEN `reeboot/package.json` declares `@earendil-works/pi-coding-agent` at `^0.84.1` (or exact `0.84.1`)
AND `npm ls @earendil-works/pi-coding-agent` resolves to `0.84.1`.

### pi-ai and pi-agent-core are direct pinned dependencies

GIVEN reeboot must construct `Model`s directly
WHEN the dependency task completes
THEN `reeboot/package.json` declares `@earendil-works/pi-ai` as a direct dependency
AND `@earendil-works/pi-agent-core` is a direct dependency (or its absence is explicitly explained)
AND neither is a transitive-only dependency (both appear in the `dependencies` block).

### Pi-transitive vulnerabilities are cleared

GIVEN the OLD tree shipped `undici@8.3.0` and `ws` in the `8.0.0–8.20.1` vulnerable range via pi
WHEN the upgrade completes and `npm audit` runs against the runtime tree
THEN no high/critical advisory attributable to pi's bundled `undici`/`ws` remains open.

### Reeboot's own directly-vulnerable deps are reconciled

GIVEN reeboot's own deps (e.g. its direct `ws`) were also flagged in the same audit
WHEN the dependency task completes
THEN either those advisories are resolved by a compatible upgrade
OR each remaining one is explicitly listed and justified in the request/decisions rather than silently left.

### Typecheck and build remain green

GIVEN the SDK surface changed between `0.75.4` and `0.84.1`
WHEN the migration lands
THEN `npm run build` succeeds AND `tsc --noEmit` reports no errors.
