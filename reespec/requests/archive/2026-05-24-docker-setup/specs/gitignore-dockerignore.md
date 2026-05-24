# Spec — .gitignore and .dockerignore

## Capability

`data/` is gitignored so user config and state are never committed. A `.dockerignore` excludes large build-irrelevant directories from the Docker build context.

## Scenarios

### GIVEN the root .gitignore
WHEN the "Runtime data" section is inspected
THEN `data/` is listed (alongside `.env`)

### GIVEN a .dockerignore exists at repo root
WHEN inspecting its contents
THEN it excludes at minimum: `node_modules/`, `.git/`, `data/`, `dist/`, and `*.tgz`

### GIVEN the Docker build context is the repo root
WHEN `docker compose build` runs
THEN `node_modules/` is NOT sent to the Docker daemon
AND `data/` is NOT sent to the Docker daemon
(both are excluded by .dockerignore)