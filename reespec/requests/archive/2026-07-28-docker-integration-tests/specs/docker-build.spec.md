# Spec — Docker build and container lifecycle

## Capability

The shell scripts build the Docker image, start the container with the correct SDK config, wait for it to be healthy, and tear it down cleanly.

## Scenarios

### S1: Docker image builds successfully
- **GIVEN** the reeboot source tree with compiled TypeScript
- **WHEN** `docker build -f container/Dockerfile . -t reeboot:integration` runs
- **THEN** the build completes with exit code 0
- **AND** the image `reeboot:integration` exists locally

### S2: Container starts with correct SDK config
- **GIVEN** the Docker image exists
- **WHEN** `docker run -d -p 3000:3000 -v config-ree.json:/home/reeboot/.reeboot/config.json` runs
- **THEN** the container starts without error
- **AND** `docker logs` shows `Server running at http://localhost:3000`
- **AND** `docker logs` shows `provider=custom` (not anthropic/openai)

### S3: Health endpoint becomes available
- **GIVEN** the container is running
- **WHEN** `GET /api/health` is polled (every 1s, timeout 30s)
- **THEN** a 200 response with `{"status":"ok"}` is received within the timeout

### S4: Container teardown on script exit
- **GIVEN** the container is running
- **WHEN** the script exits (success or failure)
- **THEN** the container is removed (`docker rm`)
- **AND** no orphaned containers remain with the test name
