# Spec — approval-timeout

Dangerous command approval prompts have a configurable timeout. No response within the timeout = denied (fail-closed).

## Scenarios

### 1. Denies on timeout in CLI mode

**GIVEN** `security.dangerous_commands.timeout` is `30`
**AND** `mode` is `"manual"` in CLI (hasUI)
**WHEN** the confirm dialog appears and 30 seconds pass with no response
**THEN** the command is denied

### 2. Denies on timeout in messaging mode

**GIVEN** a pending approval was created at timestamp `T`
**AND** `security.dangerous_commands.timeout` is `60`
**WHEN** the owner sends their next message at `T + 61` seconds
**THEN** the approval is treated as expired (denied)
**AND** the agent is told "Approval timed out"

### 3. Accepts within timeout in messaging mode

**GIVEN** a pending approval was created at `T`
**AND** timeout is `60`
**WHEN** the owner replies "yes" at `T + 45`
**THEN** the approval is granted

### 4. Clears pending approval on deny

**GIVEN** a pending approval file exists in the workspace
**WHEN** the timeout expires and the next turn processes it as denied
**THEN** the pending approval file is deleted

### 5. Configurable timeout value

**GIVEN** `security.dangerous_commands.timeout` is `120`
**WHEN** a dangerous command triggers an approval prompt
**THEN** the prompt/approval wait window is 120 seconds