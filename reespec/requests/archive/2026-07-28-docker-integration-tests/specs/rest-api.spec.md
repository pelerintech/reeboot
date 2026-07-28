# Spec — REST API integration tests

## Capability

The REST endpoints respond correctly in both SDK modes. Tests verify the most critical read and write endpoints.

## Scenarios

### S1: Health endpoint returns valid status
- **GIVEN** the container is running and healthy
- **WHEN** `GET /api/health` is called
- **THEN** response is `200 OK` with JSON body
- **AND** body contains `status: "ok"`
- **AND** body contains `version` (non-empty string)
- **AND** body contains `uptime` (number > 0)

### S2: Status endpoint returns runtime info
- **GIVEN** the container is running
- **WHEN** `GET /api/status` is called
- **THEN** response is `200 OK` with JSON body
- **AND** body is valid JSON (no parse error)

### S3: Channels endpoint lists registered channels
- **GIVEN** the container is running
- **WHEN** `GET /api/channels` is called
- **THEN** response is `200 OK` with JSON array
- **AND** array contains a channel with `type: "web"`

### S4: Contexts endpoint lists contexts
- **GIVEN** the container is running
- **WHEN** `GET /api/contexts` is called
- **THEN** response is `200 OK` with JSON array
- **AND** array has at least 1 context
- **AND** at least one context has `id: "main"`

### S5: Tasks CRUD (ree only)
- **GIVEN** the container is running with sdk=ree
- **WHEN** `GET /api/tasks` is called
- **THEN** response is `200 OK` with JSON array
- **WHEN** `POST /api/tasks` with `{ prompt: "test task" }` is called
- **THEN** response is `201` or `200` with task object containing `id`
- **WHEN** `DELETE /api/tasks/{id}` is called
- **THEN** response is `200 OK` or `204 No Content`

### S6: Budget CRUD (ree only)
- **GIVEN** the container is running with sdk=ree
- **WHEN** `GET /api/settings/budget` is called
- **THEN** response is `200 OK` with JSON body
- **WHEN** `PUT /api/settings/budget` with `{ daily_tokens: 1000 }` is called
- **THEN** response is `200 OK`
- **WHEN** `GET /api/settings/budget` is called again
- **THEN** body reflects the updated value

### S7: Reload endpoint keeps server alive
- **GIVEN** the container is running
- **WHEN** `POST /api/reload` is called
- **THEN** response is `200 OK`
- **WHEN** `GET /api/health` is called after reload
- **THEN** response is `200 OK` (server is still up)

### S8: Logs stream delivers SSE frames
- **GIVEN** the container is running
- **WHEN** `GET /api/logs/stream` is called (with timeout 10s)
- **THEN** at least 1 SSE frame is received
- **AND** frame starts with `data: `
