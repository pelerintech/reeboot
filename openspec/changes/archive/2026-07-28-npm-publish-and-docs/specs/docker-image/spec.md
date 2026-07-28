## ADDED Requirements

### Requirement: Docker image starts the agent on port 3000
`docker run -v ~/.reeboot:/home/reeboot/.reeboot -p 3000:3000 reeboot/reeboot` SHALL start the agent with the mounted config and expose WebChat at `http://localhost:3000`.

#### Scenario: Docker container starts and serves health endpoint
- **WHEN** `docker run -v ~/.reeboot:/home/reeboot/.reeboot -p 3000:3000 reeboot/reeboot` is run with a valid config
- **THEN** `GET http://localhost:3000/api/health` returns HTTP 200 within 10 seconds of container start

#### Scenario: Container runs as non-root user
- **WHEN** the Docker container is running
- **THEN** the process runs as uid 1000 (not root)

### Requirement: Docker image is published to Docker Hub as reeboot/reeboot
The image SHALL be built and pushed via GitHub Actions on version tag push. Tags: `reeboot/reeboot:latest` and `reeboot/reeboot:<version>`.

#### Scenario: Both latest and versioned tags are pushed
- **WHEN** a `v1.0.0` git tag is pushed
- **THEN** both `reeboot/reeboot:latest` and `reeboot/reeboot:1.0.0` are available on Docker Hub
