## MODIFIED Requirements

### Requirement: GET /api/tasks returns all scheduled tasks
`GET /api/tasks` SHALL return `[{ id, contextId, schedule, prompt, enabled, lastRun, nextRun }]` from the SQLite `tasks` table.

#### Scenario: Task list is returned
- **WHEN** `GET /api/tasks` is called
- **THEN** response is HTTP 200 with an array (may be empty)

### Requirement: POST /api/tasks creates a scheduled task
`POST /api/tasks` SHALL accept `{ contextId, schedule, prompt }`, validate the cron expression, insert a row into `tasks`, and register the cron job. Returns HTTP 201 with the created task object.

#### Scenario: Valid task is created
- **WHEN** `POST /api/tasks` is called with valid cron and prompt
- **THEN** response is HTTP 201 with the task object

#### Scenario: Invalid cron expression returns 400
- **WHEN** `POST /api/tasks` is called with `schedule: "not-cron"`
- **THEN** response is HTTP 400 with `{ error: "Invalid cron expression" }`

### Requirement: DELETE /api/tasks/:id removes a scheduled task
`DELETE /api/tasks/:id` SHALL cancel the cron job, delete the row from `tasks`, and return HTTP 204.

#### Scenario: Task is deleted
- **WHEN** `DELETE /api/tasks/<existing-id>` is called
- **THEN** response is HTTP 204 and the task no longer appears in `GET /api/tasks`

#### Scenario: Unknown task id returns 404
- **WHEN** `DELETE /api/tasks/nonexistent` is called
- **THEN** response is HTTP 404
