## ADDED Requirements

### Requirement: heartbeat tool provides periodic non-blocking wake-up
The `heartbeat` pi tool SHALL accept `action: 'start' | 'stop' | 'status'`. When `action = 'start'`, it SHALL also require `interval_seconds: number` (10–3600) and `message: string`. Only one in-session heartbeat SHALL be active at a time. Starting a new heartbeat replaces the previous one. The heartbeat fires `pi.sendMessage({ triggerTurn: true })` on each tick. The tool returns immediately in all cases.

#### Scenario: Heartbeat start returns immediately
- **WHEN** `heartbeat(action: 'start', interval_seconds: 30, message: "Check deploy")` called
- **THEN** tool returns immediately with confirmation

#### Scenario: Heartbeat fires on each tick
- **WHEN** heartbeat started with `interval_seconds: 1` using fake timers
- **THEN** `pi.sendMessage` called with `triggerTurn: true` after 1s, then 2s, then 3s

#### Scenario: Heartbeat tick message includes tick count and message
- **WHEN** heartbeat fires its 3rd tick
- **THEN** sent message content includes "tick 3" and the user's message string

#### Scenario: Starting new heartbeat stops previous one
- **WHEN** heartbeat A (60s) is active and heartbeat B (30s) is started
- **THEN** A no longer fires; only B fires going forward

#### Scenario: Stop action cancels heartbeat
- **WHEN** `heartbeat(action: 'stop')` called while heartbeat is active
- **THEN** heartbeat fires no more ticks

#### Scenario: Status action shows heartbeat state
- **WHEN** `heartbeat(action: 'status')` called while heartbeat is active
- **THEN** returns summary with interval, tick count, message, start time

#### Scenario: Status when no heartbeat active
- **WHEN** `heartbeat(action: 'status')` called with no active heartbeat
- **THEN** returns "No active heartbeat."

#### Scenario: Out-of-range interval_seconds rejected on start
- **WHEN** `heartbeat(action: 'start', interval_seconds: 5, message: "test")` called
- **THEN** returns error "interval_seconds must be between 10 and 3600"

### Requirement: In-session heartbeat cleared on session_shutdown
The active in-session heartbeat interval SHALL be cancelled when `session_shutdown` fires.

#### Scenario: Session shutdown stops heartbeat
- **WHEN** heartbeat is active and `session_shutdown` fires
- **THEN** heartbeat no longer fires ticks
