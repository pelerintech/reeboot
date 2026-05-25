# Approval Modes

Reeboot's `confirm_destructive` extension supports four approval modes for dangerous bash commands, plus a YOLO toggle for auto-approval.

## Configuration

```json
{
  "security": {
    "dangerous_commands": {
      "mode": "deny",
      "yolo": false,
      "timeout": 60
    }
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `"deny"` \| `"manual"` \| `"smart"` \| `"off"` | `"deny"` | How dangerous commands are handled |
| `yolo` | `boolean` | `false` | Auto-approve all non-hardline dangerous commands |
| `timeout` | `number` | `60` | Seconds to wait for approval response |

## Modes

### `deny` (default)
Block all dangerous commands outright. No approval path. This is reeboot's safest mode.

### `manual`
Prompt the user before executing a dangerous command.

- **CLI mode (has UI):** A confirmation dialog appears showing the command. The user chooses "Allow" or "Deny."
- **Headless mode (messaging):** The command is blocked and a pending approval file is written. On the next message, if the owner replies "yes," the command is approved. If "no," it stays blocked.

### `smart`
Uses an LLM risk assessment to decide:

- **Low risk:** Auto-approved (e.g., `rm -rf ./node_modules`)
- **Medium risk:** Falls back to manual mode (prompt or pending approval)
- **High risk:** Auto-denied (e.g., `rm -rf / --no-preserve-root`)

Assessment results are cached per session — the same command won't trigger multiple LLM calls.

### `off`
Dangerous commands are allowed but logged. Only the hardline blocklist still applies.

## YOLO Mode

YOLO auto-approves all non-hardline dangerous commands:

- **Config:** `"dangerous_commands.yolo": true`
- **CLI:** `/yolo` slash command toggles on/off
- **Env:** `REBOOT_YOLO_MODE=1` pre-activates for the session

Hardline commands (like `rm -rf /`, fork bombs) are **never** auto-approved, even in YOLO mode.

## Approval Timeout

When an approval prompt is shown (manual or smart-escalated), reeboot waits for `timeout` seconds. No response = denied (fail-closed). After timeout expiry, the pending approval is cleared.

## Hardline Blocklist

Certain commands are so catastrophic that they are blocked permanently, regardless of mode or YOLO:

| Pattern | Why Irreversible |
|---|---|
| `rm -rf /` | Wipes filesystem root |
| `:(){ :\|:& };:` | Bash fork bomb |
| `dd if=/dev/zero of=/dev/sd*` | Zeroes physical disk |
| `mkfs.*` | Formats filesystem |
| `> /dev/sd[a-z]` | Direct block device write |
| `> /etc/passwd` | Overwrites user database |
| `chmod 000 /` | Removes all permissions from root |
| `iptables -F && iptables -P` | Flushes firewall + denies all |

These patterns are checked first and cannot be overridden by any mode or toggle.