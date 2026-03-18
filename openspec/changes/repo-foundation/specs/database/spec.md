## ADDED Requirements

### Requirement: SQLite database is initialised on startup
The database module SHALL create `~/.reeboot/reeboot.db` (or the path from config) on first access and apply the Drizzle schema. Subsequent startups SHALL connect to the existing database without re-running schema creation.

#### Scenario: Database file is created on first run
- **WHEN** `openDatabase(path)` is called and the file does not exist
- **THEN** the file is created, all tables are present, and the function returns a database handle

#### Scenario: Existing database is connected without data loss
- **WHEN** `openDatabase(path)` is called and the file already exists with data
- **THEN** the existing data is preserved and the function returns a valid handle

### Requirement: Schema covers all Phase 1 tables
The Drizzle schema SHALL define the following tables with the specified columns: `contexts` (id, name, model_provider, model_id, status, created_at), `messages` (id, context_id FK, channel, peer_id, role, content, tokens_used, created_at), `tasks` (id, context_id FK, schedule, prompt, enabled, last_run, created_at), `channels` (type PK, status, config JSON, connected_at), `usage` (id autoincrement, context_id FK, input_tokens, output_tokens, model, created_at).

#### Scenario: All tables exist after schema push
- **WHEN** schema is applied to a fresh database
- **THEN** querying `sqlite_master` returns all five expected table names

#### Scenario: Foreign key constraints are enforced
- **WHEN** inserting a message with a `context_id` that does not exist in `contexts`
- **THEN** the insert fails with a foreign key constraint error

### Requirement: Database connection is a singleton per process
The module SHALL export a `getDb()` function that returns the same `BetterSQLite3.Database` instance for the lifetime of the process. Calling `getDb()` multiple times SHALL not open multiple file handles.

#### Scenario: Same instance returned on repeated calls
- **WHEN** `getDb()` is called twice in the same process
- **THEN** both calls return the same object reference

### Requirement: Database can be closed cleanly
The module SHALL export a `closeDb()` function that closes the connection and allows the process to exit without hanging.

#### Scenario: Process exits cleanly after close
- **WHEN** `closeDb()` is called
- **THEN** subsequent calls to `getDb()` throw an error indicating the database is closed
