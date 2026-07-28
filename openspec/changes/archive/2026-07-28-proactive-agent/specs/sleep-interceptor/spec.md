## ADDED Requirements

### Requirement: Sleep interceptor blocks sleep when it is the sole or last bash command
The extension SHALL register a bash pre-hook that intercepts `sleep` commands. The hook SHALL block execution and return a redirect message when `sleep` is the only command or the last command in a chain (`&&`, `|`). It SHALL NOT block `sleep` when it appears as a non-last command in a chain (startup delays before real work).

#### Scenario: Bare sleep blocked
- **WHEN** bash is called with `sleep 60`
- **THEN** hook blocks execution and returns "Use timer(60, message) instead"

#### Scenario: Sleep last in chain blocked
- **WHEN** bash is called with `npm run build && sleep 60`
- **THEN** hook blocks execution and returns redirect message

#### Scenario: Sleep not-last in chain allowed
- **WHEN** bash is called with `sleep 2 && npm start`
- **THEN** hook does NOT block; execution proceeds normally

#### Scenario: Sleep in middle of chain allowed
- **WHEN** bash is called with `sleep 1 && echo ready && start_server`
- **THEN** hook does NOT block

### Requirement: Sleep interceptor disabled by REEBOOT_SLEEP_INTERCEPTOR=0
When `REEBOOT_SLEEP_INTERCEPTOR=0` is set in the environment, the bash pre-hook SHALL be registered but SHALL NOT block any commands.

#### Scenario: Interceptor disabled
- **WHEN** `REEBOOT_SLEEP_INTERCEPTOR=0` and `sleep 60` called
- **THEN** hook does not block; execution proceeds
