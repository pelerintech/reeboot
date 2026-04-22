# Spec: Doctor Context Files Check

## Capability 1 — doctor reports context files when found

GIVEN `runDoctor()` is called  
AND one or more AGENTS.md / context files exist for the given cwd  
WHEN the check runs  
THEN a result with name "Context files" and status "pass" is included  
AND the message lists the discovered file paths

## Capability 2 — doctor warns when no context files found

GIVEN `runDoctor()` is called  
AND no AGENTS.md or context files exist for the given cwd  
WHEN the check runs  
THEN a result with name "Context files" and status "warn" is included  
AND a fix hint is present

## Capability 3 — context files check does not fail doctor on error

GIVEN `loadProjectContextFiles` throws  
WHEN the check runs  
THEN the result status is "warn" (not "fail")  
AND doctor overall exit code is not affected
