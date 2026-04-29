# Spec: REST API Routes

## Capability
All existing REST API routes continue to work with identical request/response contracts.

## Scenarios

### Scenario: GET / returns WebChat HTML

GIVEN the server is running with `webchat/index.html` present
WHEN `GET /` is requested
THEN response status is 200
AND `Content-Type` is `text/html`
AND body is the contents of `webchat/index.html`

### Scenario: GET /api/health returns server metadata

GIVEN the server is running
WHEN `GET /api/health` is requested
THEN response status is 200
AND body contains `{ status: 'ok', uptime: <number>, version: <string> }`

### Scenario: GET /api/status returns agent metadata

GIVEN the server is running
WHEN `GET /api/status` is requested
THEN response status is 200
AND body contains `{ agent: { name, model }, channels: <array> }`

### Scenario: GET /api/channels returns adapter list

GIVEN channels are initialized
WHEN `GET /api/channels` is requested
THEN response status is 200
AND body is an array where each item has `{ type, status, connectedAt }`

### Scenario: POST /api/channels/:type/login starts login asynchronously

GIVEN a valid channel type is configured
WHEN `POST /api/channels/:type/login` is requested
THEN response status is 202
AND body contains `{ message: 'Login initiated...' }`
AND `adapter.start()` is called (async fire-and-forget)

### Scenario: POST /api/channels/:type/login for unknown type returns 404

GIVEN the channel type does not exist in `_channelAdapters`
WHEN `POST /api/channels/:type/login` is requested
THEN response status is 404
AND body contains `{ error: 'Unknown channel type: <type>' }`

### Scenario: POST /api/channels/:type/logout stops adapter

GIVEN a valid channel type is configured
WHEN `POST /api/channels/:type/logout` is requested
THEN response status is 200
AND body contains `{ message: '<type> logged out.' }`
AND `adapter.stop()` is awaited

### Scenario: POST /api/channels/:type/logout for unknown type returns 404

GIVEN the channel type does not exist in `_channelAdapters`
WHEN `POST /api/channels/:type/logout` is requested
THEN response status is 404
AND body contains `{ error: 'Unknown channel type: <type>' }`

### Scenario: POST /api/reload hot-reloads all runners

GIVEN the orchestrator is running with multiple runners
WHEN `POST /api/reload` is requested
THEN `runner.reload()` is called for each runner
AND response status is 200 with `{ message: 'Extensions and skills reloaded.' }`

### Scenario: POST /api/reload with errors returns 500

GIVEN at least one runner throws during `reload()`
WHEN `POST /api/reload` is requested
THEN response status is 500
AND body contains `{ error: '<id>: <message>; ...' }`

### Scenario: POST /api/reload without orchestrator returns 503

GIVEN `_orchestrator` is null
WHEN `POST /api/reload` is requested
THEN response status is 503
AND body contains `{ error: 'Orchestrator not running' }`

### Scenario: POST /api/restart triggers graceful shutdown and process exit

GIVEN the server is running with active components
WHEN `POST /api/restart` is requested
THEN response sends 200 with `{ message: 'Restarting...' }`
AND orchestrator stops, adapters stop, runners dispose, server closes, and `process.exit(0)` is called

### Scenario: GET /api/tasks returns task list

GIVEN tasks exist or not in the database
WHEN `GET /api/tasks` is requested
THEN response status is 200
AND body is an array of task objects

### Scenario: POST /api/tasks creates and returns new task

GIVEN valid `{ contextId, schedule, prompt }` in body
WHEN `POST /api/tasks` is requested
THEN task is inserted into DB
AND registered with scheduler if available
AND response status is 201
AND body contains the created task with `id`

### Scenario: POST /api/tasks with invalid schedule returns 400

GIVEN a body with invalid schedule string
WHEN `POST /api/tasks` is requested
THEN no DB write occurs
AND response status is 400
AND body contains `{ error: 'invalid schedule expression' }`

### Scenario: POST /api/tasks missing required fields returns 400

GIVEN a body missing `schedule` or `prompt`
WHEN `POST /api/tasks` is requested
THEN response status is 400
AND body contains `{ error: 'schedule and prompt are required' }`

### Scenario: DELETE /api/tasks/:id removes task

GIVEN a task with id `del1` exists in DB
WHEN `DELETE /api/tasks/del1` is requested
THEN the task is removed from DB
AND scheduler cancels the job if available
AND response status is 204

### Scenario: DELETE /api/tasks/:id for unknown id returns 404

GIVEN no task with id `nonexistent` exists
WHEN `DELETE /api/tasks/nonexistent` is requested
THEN response status is 404
AND body contains `{ error: 'Task not found: nonexistent' }`

### Scenario: GET /api/contexts returns context list

GIVEN the DB has contexts (including 'main')
WHEN `GET /api/contexts` is requested
THEN response status is 200
AND body is an array of context objects

### Scenario: POST /api/contexts creates context

GIVEN a body with `{ name: 'work', model_provider, model_id }`
WHEN `POST /api/contexts` is requested
THEN context is created in DB
AND workspace directory is initialized
AND response status is 201
AND body contains `{ id, name }`

### Scenario: POST /api/contexts missing name returns 400

GIVEN a body without `name`
WHEN `POST /api/contexts` is requested
THEN response status is 400
AND body contains `{ error: 'name is required' }`

### Scenario: GET /api/contexts/:id/sessions returns sessions

GIVEN a context with id `main` exists
WHEN `GET /api/contexts/main/sessions` is requested
THEN response status is 200
AND body is an array of session objects

### Scenario: GET /api/contexts/:id/sessions for unknown context returns 404

GIVEN no context with id `nonexistent` exists
WHEN `GET /api/contexts/nonexistent/sessions` is requested
THEN response status is 404
AND body contains `{ error: 'Context not found' }`

### Scenario: Unknown routes return 404 JSON

GIVEN any path not matching a registered route
WHEN requested
THEN response status is 404
AND body is JSON with `{ error: 'Not found' }`
