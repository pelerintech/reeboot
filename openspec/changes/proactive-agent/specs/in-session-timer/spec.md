## ADDED Requirements

### Requirement: timer tool registers a one-shot non-blocking wait
The `timer` pi tool SHALL accept `seconds: number` (1–3600) and `message: string`, with optional `id: string`. It SHALL return immediately (non-blocking). After the specified delay, it SHALL call `pi.sendMessage({ content: "⏰ Timer [id] fired: [message]", display: true }, { triggerTurn: true })` to wake the agent. Multiple simultaneous timers SHALL be supported. If a timer with the same `id` already exists, it SHALL be replaced.

#### Scenario: Timer returns immediately
- **WHEN** `timer(60, "Check build status")` called
- **THEN** tool returns immediately with confirmation message (does not block for 60s)

#### Scenario: Timer fires after delay and triggers new turn
- **WHEN** `timer(1, "Test message")` called in a test with fake timers
- **THEN** after 1000ms, `pi.sendMessage` called with `triggerTurn: true` and content containing "Test message"

#### Scenario: Multiple timers are independent
- **WHEN** two timers created with different ids and intervals
- **THEN** each fires independently at the correct time

#### Scenario: Timer with same id replaces previous
- **WHEN** `timer(60, "msg1", "deploy-check")` then `timer(30, "msg2", "deploy-check")` called
- **THEN** the 60s timer is cancelled; only the 30s timer fires

#### Scenario: Out-of-range seconds rejected
- **WHEN** `timer(0, "test")` or `timer(3601, "test")` called
- **THEN** tool returns error message "seconds must be between 1 and 3600"

### Requirement: In-session timers cleared on session_shutdown
All pending `timer` timeouts SHALL be cancelled when the pi session ends (via `pi.on("session_shutdown")`). No ghost firings after session end.

#### Scenario: Session shutdown clears timers
- **WHEN** 2 timers are pending and `session_shutdown` event fires
- **THEN** neither timer fires after the event
