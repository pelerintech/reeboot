# Spec — hardline-blocklist

A permanent, non-overridable blocklist of catastrophic commands that are blocked regardless of approval mode or YOLO toggle.

## Scenarios

### 1. Blocks `rm -rf /` in all modes

**GIVEN** `security.dangerous_commands.mode` is `"manual"`, `"smart"`, `"off"`, or `"deny"`
**AND** YOLO is on or off
**WHEN** the agent calls bash with `"rm -rf /"` or `"rm -rf --no-preserve-root /"`
**THEN** the command is blocked with reason "This command is permanently blocked (hardline)"

### 2. Blocks fork bomb

**GIVEN** any mode, any YOLO state
**WHEN** the agent calls bash with `":(){ :|:& };:"`
**THEN** the command is blocked (hardline)

### 3. Blocks disk zeroing

**GIVEN** any mode, any YOLO state
**WHEN** the agent calls bash with `"dd if=/dev/zero of=/dev/sda"`
**THEN** the command is blocked (hardline)

### 4. Blocks formatting root device

**GIVEN** any mode, any YOLO state
**WHEN** the agent calls bash with `"mkfs.ext4 /dev/sda1"`
**THEN** the command is blocked (hardline)

### 5. Blocks overwriting /etc/passwd

**GIVEN** any mode, any YOLO state
**WHEN** the agent calls bash with `"echo hacker::0:0::/:/bin/sh > /etc/passwd"`
**THEN** the command is blocked (hardline)

### 6. Hardline checked before dangerous patterns

**GIVEN** a command matches both a hardline pattern and a dangerous pattern
**WHEN** the confirm_destructive extension checks the command
**THEN** the hardline block is applied (the more severe response)
**AND** no approval prompt is generated