# Spec — Dockerfile PATH

## Capability

The Dockerfile adds `node_modules/.bin` to `PATH` so `reeboot` CLI tools are callable inside the container via `npx reeboot` or directly as `reeboot`.

## Scenarios

### GIVEN the Dockerfile is inspected
WHEN looking at the `ENV` directives
THEN `ENV PATH="/home/reeboot/node_modules/.bin:$PATH"` is present after WORKDIR

### GIVEN the container is running
WHEN `docker compose exec reeboot npx reeboot init` is executed
THEN the reeboot CLI binary is found (npx resolves to node_modules/.bin/reeboot)
AND the setup wizard starts (TTY permitting)

### GIVEN the container is running
WHEN `docker compose exec reeboot reeboot status` is executed
THEN the reeboot CLI binary is found directly (no npx prefix needed)