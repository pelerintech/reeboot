# Spec: pi Version Upgrade

## Capability

Bumping `@mariozechner/pi-coding-agent` to 0.62.0 in reeboot's `package.json` and
verifying the installed version matches.

---

## Scenario: package.json declares 0.62.0

GIVEN `reeboot/package.json` exists  
WHEN its `dependencies` are read  
THEN `@mariozechner/pi-coding-agent` is `"0.62.0"` (exact pin, not a range)

## Scenario: installed node_modules matches declared version

GIVEN the package has been installed (`npm install`)  
WHEN `node_modules/@mariozechner/pi-coding-agent/package.json` is read  
THEN its `version` field is `"0.62.0"`

## Scenario: existing tests still pass after upgrade

GIVEN the version is bumped and dependencies are installed  
WHEN the reeboot test suite is run  
THEN all tests pass with no failures or type errors
