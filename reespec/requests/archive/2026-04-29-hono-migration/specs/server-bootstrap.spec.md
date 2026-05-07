# Spec: Server Bootstrap

## Capability
`startServer` creates and starts a Hono-based HTTP server that is ready to accept connections.

## Scenarios

### Scenario: startServer resolves with bound address

GIVEN `startServer({ port: 0, logLevel: 'silent' })` is called
WHEN the server starts
THEN the promise resolves with `{ port: <number>, host: <string> }`
AND `port` is greater than 0
AND `host` is '127.0.0.1' (default)

### Scenario: stopServer halts the server

GIVEN a running server
WHEN `stopServer()` is called
THEN the server stops accepting new connections
AND `_server` is null

### Scenario: stopServer is idempotent

GIVEN a server that has already been stopped
WHEN `stopServer()` is called again
THEN it resolves without error

### Scenario: startServer runs DB-only resilience phase before channels

GIVEN `startServer()` is called with valid config
WHEN the startup sequence runs
THEN `runResilienceMigration(db)` executes before channel init
AND `applyScheduledCatchup(db, config)` executes before channel init

### Scenario: startServer runs deferred resilience phase after orchestrator

GIVEN `startServer()` with valid config
WHEN the startup sequence runs
THEN `notifyRestart` and `recoverCrashedTurns` execute after `_orchestrator.start()`
AND after `_channelAdapters` is populated

### Scenario: startServer initializes scheduler after orchestrator

GIVEN `startServer()` with valid config
WHEN the startup sequence runs
THEN `Scheduler.start()` executes after `_orchestrator.start()`
AND `setGlobalScheduler()` is called

### Scenario: startServer initializes heartbeat after scheduler

GIVEN `startServer()` with valid config containing `heartbeat.enabled: true`
WHEN the startup sequence runs
THEN `startHeartbeat()` executes after scheduler init
