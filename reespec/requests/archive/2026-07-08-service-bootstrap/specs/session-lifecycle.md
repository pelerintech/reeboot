# Spec — Session Lifecycle (bindExtensions + shutdown)

## Capability

`PiAgentRunner` correctly participates in the pi session lifecycle: `session_start` fires after session creation, `session_shutdown` fires before session teardown. A `shutdownHandler` bridges pi-internal shutdown requests to the runner's reset path.

## Scenarios

### GIVEN a new PiAgentRunner and a first prompt
WHEN `_getOrCreateSession()` creates the session
THEN `session.bindExtensions()` is called exactly once
AND `session_start` fires on the extension runner
AND extensions that registered `session_start` handlers have their handlers invoked

### GIVEN bindExtensions is called
WHEN a shutdownHandler is passed
THEN if anything inside the extension context calls `ctx.shutdown()`
THEN the runner's `reset()` is invoked

### GIVEN an active session
WHEN `runner.reset()` is called
THEN `session_shutdown` is emitted on the extension runner with `reason: 'new'` before `_session` is nulled
AND extensions that registered `session_shutdown` handlers have their handlers invoked
AND `_session` is null after reset completes

### GIVEN an active session
WHEN `runner.dispose()` is called
THEN `session_shutdown` is emitted on the extension runner with `reason: 'quit'` before `_session` is nulled
AND `_session` is null after dispose completes

### GIVEN no active session (e.g. reset called before first prompt)
WHEN `runner.reset()` is called
THEN no error is thrown
AND `session_shutdown` is NOT emitted (nothing to shut down)

### GIVEN emitSessionShutdownEvent throws
WHEN `runner.reset()` is called
THEN the error is caught and logged
AND `_session` is still nulled (teardown completes despite the error)

### GIVEN a session is created and then reset and a new prompt arrives
WHEN the second prompt triggers `_getOrCreateSession()`
THEN `bindExtensions()` is called again on the new session
AND `session_start` fires again for the new session
