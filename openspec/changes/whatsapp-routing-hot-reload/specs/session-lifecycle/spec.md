## ADDED Requirements

### Requirement: Sessions start on first message and persist across restarts
A session begins when a context receives its first message (or after `/new`). The pi `SessionManager` persists the session file at `~/.reeboot/sessions/<contextId>/session-<date>-<id>.json`. On process restart, if the session file exists and is within the inactivity window, the session is resumed by opening the same file.

#### Scenario: Session is resumed on restart within inactivity window
- **WHEN** reeboot restarts within the inactivity timeout period of the last message
- **THEN** the runner opens the existing session file and the agent retains conversation history

#### Scenario: Session is not resumed after inactivity timeout
- **WHEN** reeboot starts and the last session file is older than the inactivity timeout
- **THEN** a new session file is created and conversation history starts fresh

### Requirement: Inactivity timeout automatically starts a new session
If a context receives no message for `config.session.inactivityTimeout` milliseconds (default: 14,400,000 ms / 4 hours), the orchestrator SHALL dispose the current runner and clear the active session reference. The next message will create a new session.

#### Scenario: Inactivity timer resets on each message
- **WHEN** a message arrives for a context
- **THEN** the inactivity timer is reset

#### Scenario: Session is closed after inactivity timeout
- **WHEN** no message arrives for a context within the inactivity timeout period
- **THEN** the runner is disposed and a new session will be created on the next message

### Requirement: reeboot reload hot-reloads extensions and skills without restarting
`reeboot reload` SHALL call `loader.reload()` on all active `PiAgentRunner` instances and return. Channel connections SHALL remain open. Active agent turns SHALL not be interrupted. The next agent turn will pick up newly loaded extensions and skills.

#### Scenario: New extension is available after reload
- **WHEN** a `.ts` file is dropped into `~/.reeboot/extensions/` and `reeboot reload` is run
- **THEN** the extension's tools are available in the next agent turn without restarting the process

#### Scenario: In-flight turn is not interrupted by reload
- **WHEN** `reeboot reload` is called while an agent turn is in progress
- **THEN** the in-flight turn completes normally

### Requirement: reeboot restart performs graceful shutdown and re-spawn
`reeboot restart` SHALL: (1) stop accepting new messages from all channels, (2) wait for all in-flight agent turns to complete (timeout: 30 seconds), (3) call `adapter.stop()` on all channel adapters, (4) call `runner.dispose()` on all active runners, (5) exit the process with code 0. The process supervisor (launchd/systemd) is responsible for restarting.

#### Scenario: Graceful restart waits for in-flight turn
- **WHEN** `reeboot restart` is called while a turn is in-flight
- **THEN** the process waits for the turn to complete before shutting down

#### Scenario: Restart times out after 30 seconds
- **WHEN** an in-flight turn is still running 30 seconds after restart is initiated
- **THEN** the turn is aborted and the process exits
