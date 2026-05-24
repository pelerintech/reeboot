# Spec — docker-compose.yml

## Capability

A `docker-compose.yml` at the repo root defines the full reeboot stack: reeboot (built locally), searxng, signal-cli, and caddy (commented out). All non-caddy services are on by default. All services are comment-outable.

## Scenarios

### GIVEN the user runs `docker compose up -d` from repo root
WHEN no `data/config.json` exists
THEN reeboot starts and logs a clear error about missing config
(container does not crash — entrypoint handles missing config gracefully)

### GIVEN a valid `data/config.json` exists
WHEN `docker compose up -d` runs
THEN reeboot starts, binds to 0.0.0.0:3000, and WebChat is accessible
AND searxng starts on host port 8080
AND signal-cli starts on host port 8081
AND caddy is NOT started (commented out)

### GIVEN the user uncomments the caddy service block
WHEN `docker compose up -d` runs
THEN caddy starts on ports 80 and 443

### GIVEN the user comments out searxng
WHEN `docker compose up -d` runs
THEN searxng is NOT started
AND reeboot still starts (no hard dependency on searxng)

### GIVEN `docker compose down` runs
WHEN `docker compose up -d` runs again
THEN reeboot resumes with the same config, DB, and state from `./data/`
(bind mount persists across container lifecycle)

### GIVEN the user runs `docker compose build`
WHEN the build completes
THEN the reeboot image is built from `container/Dockerfile` using the repo
root as build context (no external image pull for reeboot)