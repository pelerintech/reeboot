## ADDED Requirements

### Requirement: Fastify server starts and listens on configured port
The HTTP server SHALL start a Fastify instance listening on the port from config (default 3000). The server SHALL be startable and stoppable programmatically via `startServer(config)` and `stopServer()` functions.

#### Scenario: Server starts on configured port
- **WHEN** `startServer({ port: 3000 })` is called
- **THEN** the server is listening and `GET http://localhost:3000/api/health` returns HTTP 200

#### Scenario: Server stops gracefully
- **WHEN** `stopServer()` is called while server is running
- **THEN** the server closes all connections and the promise resolves without error

### Requirement: GET /api/health returns status and uptime
The `/api/health` endpoint SHALL return a JSON body `{ status: "ok", uptime: <seconds>, version: "<semver>" }` with HTTP 200. It SHALL never require authentication.

#### Scenario: Health endpoint returns expected shape
- **WHEN** `GET /api/health` is called
- **THEN** response body has keys `status`, `uptime`, and `version` with correct types

### Requirement: GET /api/status returns agent state
The `/api/status` endpoint SHALL return a JSON body with `{ agent: { name, model }, channels: [...], uptime }` with HTTP 200. Channel list entries include `{ type, status }`. This endpoint is a stub in this change — the full agent state will be populated in later changes.

#### Scenario: Status endpoint returns expected shape
- **WHEN** `GET /api/status` is called
- **THEN** response body includes `agent` and `channels` keys

### Requirement: Server uses pino for structured logging
All Fastify request logs SHALL use pino in JSON format (production) or pretty-print (development based on `NODE_ENV`). The log level SHALL be configurable via config or `REEBOOT_LOG_LEVEL`.

#### Scenario: Log level is respected
- **WHEN** server is started with `logLevel: "warn"`
- **THEN** info-level request logs are suppressed

### Requirement: Unknown routes return 404 JSON
Any unregistered route SHALL return HTTP 404 with body `{ error: "Not found" }` rather than the default Fastify HTML 404.

#### Scenario: Unknown route returns JSON 404
- **WHEN** `GET /api/nonexistent` is called
- **THEN** response is HTTP 404 with JSON body containing `error` key
