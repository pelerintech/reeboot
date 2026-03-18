## MODIFIED Requirements

### Requirement: GET /api/contexts returns context list
The `/api/contexts` endpoint SHALL return a JSON array of context objects `[{ id, name, model_provider, model_id, status }]` from the SQLite `contexts` table.

#### Scenario: Context list is returned
- **WHEN** `GET /api/contexts` is called
- **THEN** response is HTTP 200 with an array (may be empty on fresh install)

### Requirement: POST /api/contexts creates a new context
The `/api/contexts` endpoint SHALL accept `{ name, model_provider, model_id }` and create a new context in the database and on disk. It SHALL return `{ id, name, model_provider, model_id, status: "active" }` with HTTP 201.

#### Scenario: Valid context creation returns 201
- **WHEN** `POST /api/contexts` is called with valid body
- **THEN** response is HTTP 201 with the new context object

#### Scenario: Missing required field returns 400
- **WHEN** `POST /api/contexts` is called without `name`
- **THEN** response is HTTP 400 with `{ error: "..." }`

### Requirement: GET /api/contexts/:id/sessions returns session list
The endpoint SHALL return `[{ sessionId, startedAt, messageCount }]` by reading `~/.reeboot/sessions/<id>/`.

#### Scenario: Session list is returned
- **WHEN** `GET /api/contexts/main/sessions` is called
- **THEN** response is HTTP 200 with an array

#### Scenario: Unknown context returns 404
- **WHEN** `GET /api/contexts/nonexistent/sessions` is called
- **THEN** response is HTTP 404
