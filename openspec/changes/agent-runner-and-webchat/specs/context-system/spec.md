## ADDED Requirements

### Requirement: Context manager initialises default contexts on startup
The context system SHALL read `config.contexts` (or default to a single `main` context) and ensure their workspace directories and AGENTS.md files exist on disk before the first agent turn. The `main` context SHALL always exist.

#### Scenario: Main context workspace is created on startup
- **WHEN** the agent starts and `~/.reeboot/contexts/main/` does not exist
- **THEN** the directory is created with `workspace/`, `.pi/extensions/`, `.pi/skills/` subdirectories and `AGENTS.md` from template

#### Scenario: Existing context directory is left unchanged
- **WHEN** `~/.reeboot/contexts/main/AGENTS.md` already exists
- **THEN** the file is not overwritten

### Requirement: Global AGENTS.md is prepended to all contexts
`~/.reeboot/contexts/global/AGENTS.md` SHALL be passed to the pi `DefaultResourceLoader` as a global AGENTS.md, causing it to be included in every context's system prompt before the context-specific AGENTS.md.

#### Scenario: Global AGENTS.md content appears in agent system prompt
- **WHEN** an agent session starts for any context
- **THEN** the content of `~/.reeboot/contexts/global/AGENTS.md` is included in the effective system prompt

### Requirement: Session files are stored per context
Pi session files SHALL be stored at `~/.reeboot/sessions/<contextId>/session-<timestamp>-<id>.json`. The context system SHALL resolve the active session file path for a given context and pass it to `SessionManager.open()`.

#### Scenario: Session file path is deterministic
- **WHEN** `getActiveSessionPath("main")` is called
- **THEN** the returned path is within `~/.reeboot/sessions/main/`

### Requirement: Context metadata is persisted in SQLite
Creating a context via `POST /api/contexts` SHALL insert a row into the `contexts` table. Listing contexts via `GET /api/contexts` SHALL read from `contexts` table and return `[{ id, name, model_provider, model_id, status }]`.

#### Scenario: New context appears in list
- **WHEN** `POST /api/contexts` is called with `{ name: "work", model_provider: "anthropic", model_id: "claude-sonnet-4-20250514" }`
- **THEN** subsequent `GET /api/contexts` returns an array including the new context

### Requirement: Context sessions are listable via API
`GET /api/contexts/:id/sessions` SHALL return an array of session file metadata `[{ sessionId, startedAt, messageCount }]` by reading the `~/.reeboot/sessions/<contextId>/` directory.

#### Scenario: Session list returns existing sessions
- **WHEN** `GET /api/contexts/main/sessions` is called after at least one session has been created
- **THEN** response includes an entry for each session file in `~/.reeboot/sessions/main/`
