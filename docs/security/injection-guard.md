---
title: "Injection Guard"
description: "Protection against prompt injection attacks from external content fetched by the agent."
---

# Injection Guard

Prompt injection is an attack where malicious content embedded in an external source (a web page, a document, an API response) instructs the agent to take unintended actions. Reeboot's injection guard detects and flags this content before it influences the agent.

Injection guard is **enabled by default**.

---

## How It Works

When the agent calls a tool listed in `external_source_tools` (default: `fetch_url`, `web_fetch`), the injection guard scans the returned content for patterns that look like system-level instructions attempting to override the agent's behaviour.

Detected content is flagged and the agent is warned before processing it. If the channel's trust level is `"end-user"`, the guard is applied more aggressively.

---

## Configuration

```json
{
  "security": {
    "injection_guard": {
      "enabled": true,
      "external_source_tools": ["fetch_url", "web_fetch"]
    }
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `security.injection_guard.enabled` | boolean | `true` | Enable or disable the injection guard. |
| `security.injection_guard.external_source_tools` | string[] | `["fetch_url", "web_fetch"]` | Tool names whose output is treated as untrusted external content. Add any MCP tools that fetch external data. |

---

## Adding Custom External Tools

If you add an MCP server tool that fetches external content, add it to the list:

```json
{
  "security": {
    "injection_guard": {
      "external_source_tools": ["fetch_url", "web_fetch", "my_mcp_fetch_tool"]
    }
  }
}
```

---

## Interaction with Trust Level

- **`trust: "owner"`** (default): injection guard is applied but with lighter scrutiny — the owner is expected to request fetches from known sources.
- **`trust: "end-user"`**: injection guard is applied with full scrutiny — external users may direct the agent to fetch attacker-controlled content.

→ See [Trust and Access Control](../channels/trust-and-access.md) and [Permission Tiers](./permission-tiers.md).
