---
title: "WebChat"
description: "Browser-based chat interface available instantly at http://localhost:3000."
---

# WebChat

WebChat is a browser-based chat UI that is enabled by default. No additional setup is required — start reeboot and open the URL.

```
http://localhost:3000
```

WebChat is a **Tier 2 channel**: it runs on the same machine as the agent, all messages are treated as coming from the owner, and no identity verification is required.

## Configuration

```json
{
  "channels": {
    "web": {
      "enabled": true,
      "port": 3000
    }
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `channels.web.enabled` | boolean | `true` | Enable or disable the WebChat channel |
| `channels.web.port` | number | `3000` | HTTP port for the web server |
| `channels.web.trust` | string | `"owner"` | Trust level for all WebChat messages (`"owner"` or `"end-user"`) |
| `channels.web.trusted_senders` | string[] | `[]` | Additional sender IDs granted elevated trust |

## Changing the Port

```json
{
  "channels": {
    "web": { "enabled": true, "port": 8080 }
  }
}
```

Or set the environment variable:

```bash
REEBOOT_PORT=8080 reeboot start
```

## Disabling WebChat

```json
{
  "channels": {
    "web": { "enabled": false }
  }
}
```

When WebChat is disabled, the HTTP server still starts (for health checks and the API), but the chat UI is not served.

## Health Check

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptime":42,"version":"1.2.0"}
```

## Multi-Context Routing

By default all WebChat messages go to the `main` context. To route to a different context, configure routing rules:

```json
{
  "routing": {
    "default": "main",
    "rules": [
      { "channel": "web", "context": "work" }
    ]
  }
}
```

→ See [Configuration Reference](../configuration/reference.md#routing) for routing options.
