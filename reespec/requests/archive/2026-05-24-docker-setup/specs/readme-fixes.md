# Spec — README Fixes

## Capability

The root README has a correct Docker section describing the docker-compose path. The reeboot README no longer links to a non-existent Docker Hub image. Both READMEs reference the docker-compose deployment flow.

## Scenarios

### GIVEN the root README.md
WHEN the Docker section is inspected
THEN it does NOT contain `reeboot/reeboot:latest`
AND it does NOT contain `hub.docker.com/r/reeboot/reeboot`
AND it describes the `git clone → cp config → docker compose up -d` flow

### GIVEN the reeboot README.md
WHEN the Links section is inspected
THEN it does NOT contain a 🐳 Docker Hub link to `hub.docker.com/r/reeboot/reeboot`
AND the remaining links (npm, full docs, changelog) are preserved

### GIVEN the reeboot README.md
WHEN the setup wizard steps are described
THEN "Docker" no longer appears as a deployment option
AND the docs reference the separate docker-compose path