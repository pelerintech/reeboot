---
title: "Permission Tiers"
description: "How channel trust levels control tool access and what gets logged when permissions are violated."
---

# Permission Tiers

Reeboot applies different permission levels to agent turns depending on the trust level of the channel that originated the message. This prevents untrusted senders from using the agent as a vector to run privileged operations.

---

## Trust Levels

| Level | Who it applies to | Tool access | Injection guard |
|---|---|---|---|
| `"owner"` | The agent's owner — the person who controls the deployment | Full access to all registered tools | Applied with lighter scrutiny |
| `"end-user"` | An external user messaging the agent | Restricted (see below) | Applied with full scrutiny |

The trust level is set **per channel** in `~/.reeboot/config.json`:

```json
{
  "channels": {
    "whatsapp": { "trust": "owner" },
    "signal": { "trust": "end-user" }
  }
}
```

Default is `"owner"` for all channels.

---

## Tool Restrictions for `end-user` Trust

When a message arrives on a channel configured with `trust: "end-user"`, the agent's available tools are restricted. Specifically:

- Tools that write to the filesystem, run bash commands, or interact with the host system are not available.
- Only tools explicitly safe for external users are offered (web search, fetch_url, knowledge search, and any tools explicitly whitelisted for the context).

To whitelist specific tools for a context used by end-users:

```json
{
  "contexts": [
    {
      "name": "support",
      "tools": {
        "whitelist": ["web_search", "fetch_url", "knowledge_search"]
      }
    }
  ]
}
```

---

## Violation Logging

When a permission violation occurs (a tool call denied due to trust level, or an injection attempt detected), it is logged to the audit events table by default.

```json
{
  "permissions": {
    "violations": { "log": true }
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `permissions.violations.log` | boolean | `true` | Log permission violations to the audit events table. |

---

## Protected Paths

The `protected_paths` extension (enabled by default) prevents the agent from writing to sensitive filesystem paths regardless of trust level:

- `~/.reeboot/config.json`
- `~/.ssh/`
- `~/.aws/`
- System directories

To disable:

```json
{
  "extensions": {
    "core": { "protected_paths": false }
  }
}
```

---

## Destructive Action Confirmation

The `confirm_destructive` extension (enabled by default) requires the agent to confirm before executing operations that could cause data loss (e.g. `rm -rf`, overwriting files without a backup).

To disable:

```json
{
  "extensions": {
    "core": { "confirm_destructive": false }
  }
}
```

→ See [Injection Guard](./injection-guard.md) for prompt injection protection details.
→ See [Trust and Access Control](../channels/trust-and-access.md) for channel trust configuration.
