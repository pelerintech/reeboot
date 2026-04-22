# Spec: Prompt Cache Retention

## Capability 1 — Docker entrypoint sets PI_CACHE_RETENTION

GIVEN a Docker container starts using `entrypoint.sh`  
WHEN the entrypoint script executes  
THEN `PI_CACHE_RETENTION=long` is exported into the process environment

## Capability 2 — launchd plist includes PI_CACHE_RETENTION

GIVEN `generatePlist()` is called in `daemon.ts`  
WHEN the generated plist string is inspected  
THEN it contains `PI_CACHE_RETENTION` with value `long` in an `EnvironmentVariables` dict

## Capability 3 — systemd unit includes PI_CACHE_RETENTION

GIVEN `generateSystemdUnit()` is called in `daemon.ts`  
WHEN the generated unit string is inspected  
THEN it contains `Environment=PI_CACHE_RETENTION=long` in the `[Service]` section
