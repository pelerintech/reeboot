# Spec — approval-modes

The `confirm_destructive` extension gains three new approval modes on top of the existing `deny` default from Phase 1, plus a YOLO toggle.

## Scenarios

### 1. Manual mode prompts for confirmation in CLI

**GIVEN** `security.dangerous_commands.mode` is `"manual"`
**AND** the session has UI (`ctx.hasUI === true`)
**WHEN** the agent calls bash with `"rm -rf /tmp/old-data"`
**THEN** `ctx.ui.confirm("Dangerous command: rm -rf ... Allow?")` is called
**AND** if the user confirms, the command proceeds (no block)
**AND** if the user denies, the command is blocked

### 2. Manual mode writes pending approval in headless mode

**GIVEN** `security.dangerous_commands.mode` is `"manual"`
**AND** the session has no UI (messaging channel)
**WHEN** the agent calls bash with a dangerous command
**THEN** the command is blocked with reason "Awaiting owner approval"
**AND** a pending approval file is written to the workspace meta directory
**AND** the approval request message includes the command and a prompt to reply "yes" or "no"

### 3. Manual mode approves on next turn

**GIVEN** a pending approval exists for `"rm -rf /tmp/old-data"`
**WHEN** the owner's next message is "yes"
**THEN** the `before_agent_start` handler checks for pending approvals
**AND** the approved command is added to a session-scoped allowlist
**AND** subsequent calls to the same command pattern are auto-approved

### 4. Manual mode denies on "no" response

**GIVEN** a pending approval exists for `"rm -rf /tmp/old-data"`
**WHEN** the owner's next message is "no"
**THEN** the pending approval is cleared
**AND** the command remains blocked

### 5. Smart mode auto-approves low-risk commands

**GIVEN** `security.dangerous_commands.mode` is `"smart"`
**WHEN** the agent calls bash with `"rm -rf ./node_modules"`
**THEN** a lightweight LLM call assesses risk
**AND** if risk is `low`, the command is auto-approved (no block returned)

### 6. Smart mode auto-denies high-risk commands

**GIVEN** `security.dangerous_commands.mode` is `"smart"`
**WHEN** the agent calls bash with `"rm -rf / --no-preserve-root"`
**THEN** the LLM call assesses risk as `high`
**AND** the command is blocked with reason "Command auto-denied by risk assessment"

### 7. Smart mode escalates medium-risk to manual

**GIVEN** `security.dangerous_commands.mode` is `"smart"`
**WHEN** the LLM call returns risk `medium`
**THEN** the behavior falls back to manual mode (prompt or pending approval)

### 8. Smart mode caches results per session

**GIVEN** the smart mode has already assessed `"rm -rf ./node_modules"` as low risk
**WHEN** the agent calls the same command again in the same session
**THEN** no LLM call is made — the cached result is used

### 9. Off mode logs but allows

**GIVEN** `security.dangerous_commands.mode` is `"off"`
**WHEN** the agent calls bash with any dangerous command
**THEN** the command proceeds (no block)
**AND** a log entry is written to `operational_logs` with `{ component: 'dangerous-commands', event: 'command_allowed_off_mode', command: '<cmd>' }`

### 10. YOLO auto-approves non-hardline commands

**GIVEN** YOLO mode is active (via `/yolo` or `REBOOT_YOLO_MODE=1`)
**WHEN** the agent calls bash with a dangerous (but not hardline) command
**THEN** the command is auto-approved with a log entry
**AND** the status bar / channel reply includes `⚡ YOLO` indicator

### 11. YOLO does not override hardline blocklist

**GIVEN** YOLO mode is active
**WHEN** the agent calls bash with a hardline command like `"rm -rf /"`
**THEN** the command is still blocked with reason referencing the hardline blocklist