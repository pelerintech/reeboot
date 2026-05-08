---
title: "Configuration Reference"
description: "Complete reference for every field in ~/.reeboot/config.json, verified against the Zod schema."
---

# Configuration Reference

All configuration lives in `~/.reeboot/config.json`. Every field is optional — reeboot uses safe defaults when fields are absent.

This reference is derived directly from `reeboot/src/config.ts` (the Zod schema). Field names, types, and defaults are authoritative.

---

## `agent`

Top-level agent settings.

| Field | Type | Default | Description |
|---|---|---|---|
| `agent.name` | string | `"Reeboot"` | Display name for the agent. Appears in the WebChat UI and system prompts. |
| `agent.runner` | string | `"pi"` | Agent runner implementation. Currently only `"pi"` is supported. |
| `agent.turnTimeout` | number | `300000` | Maximum ms for a single agent turn before timeout (5 minutes). |

### `agent.model`

LLM provider and credential configuration.

| Field | Type | Default | Description |
|---|---|---|---|
| `agent.model.authMode` | `"own"` \| `"pi"` | `"own"` | `"own"`: reeboot uses the provider/id/apiKey fields below. `"pi"`: reeboot delegates to your personal pi installation (`~/.pi/agent/auth.json`) and ignores provider/id/apiKey. |
| `agent.model.provider` | string | `""` | LLM provider name: `"anthropic"`, `"openai"`, `"google"`, `"groq"`, `"mistral"`, `"xai"`, `"openrouter"`, `"ollama"`. Ignored when `authMode: "pi"`. |
| `agent.model.id` | string | `""` | Model identifier (e.g. `"claude-sonnet-4-5"`, `"gpt-4o"`). Ignored when `authMode: "pi"`. |
| `agent.model.apiKey` | string | `""` | API key for the chosen provider. Ignored when `authMode: "pi"`. For Ollama, leave empty. |

**Example — own credentials:**

```json
{
  "agent": {
    "name": "Reeboot",
    "model": {
      "authMode": "own",
      "provider": "anthropic",
      "id": "claude-sonnet-4-5",
      "apiKey": "sk-ant-..."
    }
  }
}
```

**Example — reuse pi credentials:**

```json
{
  "agent": {
    "model": {
      "authMode": "pi"
    }
  }
}
```

---

## `channels`

### `channels.web` — WebChat

| Field | Type | Default | Description |
|---|---|---|---|
| `channels.web.enabled` | boolean | `true` | Enable the browser-based chat UI. |
| `channels.web.port` | number | `3000` | HTTP port for the web server and API. |
| `channels.web.trust` | `"owner"` \| `"end-user"` | `"owner"` | Trust level for all WebChat messages. |
| `channels.web.trusted_senders` | string[] | `[]` | Sender IDs granted elevated trust. |

### `channels.whatsapp` — WhatsApp

| Field | Type | Default | Description |
|---|---|---|---|
| `channels.whatsapp.enabled` | boolean | `false` | Enable the WhatsApp channel. |
| `channels.whatsapp.owner_id` | string | `""` | Owner's phone number or JID. Empty = Mode 1 (self-chat). Non-empty = Mode 2 (dedicated account). |
| `channels.whatsapp.owner_only` | boolean | `true` | Only process messages from the identified owner. |
| `channels.whatsapp.trust` | `"owner"` \| `"end-user"` | `"owner"` | Trust level for processed messages. |
| `channels.whatsapp.trusted_senders` | string[] | `[]` | JIDs that bypass `owner_only` gating. |

### `channels.signal` — Signal

| Field | Type | Default | Description |
|---|---|---|---|
| `channels.signal.enabled` | boolean | `false` | Enable the Signal channel. |
| `channels.signal.phoneNumber` | string | `""` | Phone number of the Signal account in the container. |
| `channels.signal.apiPort` | number | `8080` | Port the signal-cli-rest-api container listens on. |
| `channels.signal.pollInterval` | number | `1000` | Polling interval in ms (polling mode only; json-rpc uses WebSocket). |
| `channels.signal.owner_id` | string | `""` | Your personal phone number. Empty = Mode 1 (note-to-self). Non-empty = Mode 2. |
| `channels.signal.owner_only` | boolean | `true` | Only process messages from the identified owner. |
| `channels.signal.trust` | `"owner"` \| `"end-user"` | `"owner"` | Trust level for processed messages. |
| `channels.signal.trusted_senders` | string[] | `[]` | Phone numbers that bypass `owner_only` gating. |

---

## `sandbox`

Controls OS-level sandboxing for bash tool execution.

| Field | Type | Default | Description |
|---|---|---|---|
| `sandbox.mode` | `"os"` \| `"docker"` | `"os"` | `"os"`: uses `sandbox-exec` on macOS or `bwrap` on Linux. `"docker"`: wraps execution in a Docker container (planned). |

To disable sandboxing entirely, set `extensions.core.sandbox: false`. See [Sandbox](../security/sandbox.md).

---

## `server`

HTTP server settings.

| Field | Type | Default | Description |
|---|---|---|---|
| `server.token` | string | `undefined` | Bearer token required for all HTTP API requests. Leave unset to disable authentication (suitable for local-only deployments). |

---

## `credentialProxy`

An optional credential proxy server that can broker API key access for clients that cannot store secrets directly.

| Field | Type | Default | Description |
|---|---|---|---|
| `credentialProxy.enabled` | boolean | `false` | Enable the credential proxy server. |
| `credentialProxy.port` | number | `3001` | Port the credential proxy listens on. |

---

## `logging`

Structured logging via [pino](https://getpino.io). Logs are written to stdout (NDJSON) and to `~/.reeboot/logs/`.

| Field | Type | Default | Description |
|---|---|---|---|
| `logging.level` | string | `"info"` | Minimum log level: `"trace"`, `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"`. |
| `logging.rate_limit_warn_threshold` | number | `5000` | Remaining tokens below which a `rate_limit_warning` event is emitted. |
| `logging.retention_days` | number | `30` | Days to retain records in `operational_logs` and `turn_journal` before pruning. |

→ See [Logging](../observability/logging.md) for CLI commands and the live SSE stream.

---

## `search`

Web search backend for the `web_search` agent tool.

| Field | Type | Default | Description |
|---|---|---|---|
| `search.provider` | string | `"none"` | Search backend: `"duckduckgo"`, `"brave"`, `"tavily"`, `"serper"`, `"exa"`, `"searxng"`, `"none"`. |
| `search.apiKey` | string | `""` | API key for the chosen provider (not needed for duckduckgo, searxng, or none). |
| `search.searxngBaseUrl` | string | `"http://localhost:8888"` | Base URL of your SearXNG instance (only used when `provider: "searxng"`). |

Alternatively, set provider-specific env vars: `BRAVE_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`.

The `fetch_url` tool is always available regardless of `search.provider`.

→ See [Web Search](../capabilities/web-search.md) for full provider details.

---

## `heartbeat`

System heartbeat fires on a schedule and dispatches a prompt to the agent. If the agent has nothing to do, it responds `IDLE` (silently suppressed).

| Field | Type | Default | Description |
|---|---|---|---|
| `heartbeat.enabled` | boolean | `false` | Enable the system heartbeat. |
| `heartbeat.interval` | string | `"every 5m"` | Interval string: `"every 5m"`, `"every 1h"`, `"daily"`, or a cron expression. |
| `heartbeat.contextId` | string | `"main"` | Which context the heartbeat runs in. |

→ See [Proactive Agent](../capabilities/proactive-agent.md).

---

## `session`

| Field | Type | Default | Description |
|---|---|---|---|
| `session.inactivityTimeout` | number | `14400000` | Ms of inactivity before a session is closed and a new one started on the next message (4 hours). |

---

## `routing`

Controls which context handles messages from which channel or peer.

| Field | Type | Default | Description |
|---|---|---|---|
| `routing.default` | string | `"main"` | Default context for messages that match no rule. |
| `routing.rules` | array | `[]` | Ordered list of routing rules. Each rule is `{ peer, context }` or `{ channel, context }`. First match wins. |

**Example:**

```json
{
  "routing": {
    "default": "main",
    "rules": [
      { "channel": "whatsapp", "context": "personal" },
      { "peer": "+15559999999", "context": "work" }
    ]
  }
}
```

---

## `memory`

Personal memory persists facts, preferences, and corrections across sessions. Memory is on by default.

| Field | Type | Default | Description |
|---|---|---|---|
| `memory.enabled` | boolean | `true` | Enable personal memory. When enabled, the agent has access to the `memory` tool and `MEMORY.md`/`USER.md` are injected into every system prompt. |
| `memory.memoryCharLimit` | number | `2200` | Maximum characters for `MEMORY.md`. When reached, the agent auto-consolidates to make room. |
| `memory.userCharLimit` | number | `1375` | Maximum characters for `USER.md`. |
| `memory.consolidation.enabled` | boolean | `true` | Enable background memory consolidation (mines past sessions for patterns). |
| `memory.consolidation.schedule` | string | `"0 2 * * *"` | Cron schedule for background consolidation (default: 2 AM daily). |

The `session_search` tool (full-text search over past conversations) is always available regardless of `memory.enabled`.

→ See [Personal Memory](../capabilities/memory.md).

---

## `knowledge`

Domain knowledge enables the agent to ingest and search your local documents using vector embeddings.

| Field | Type | Default | Description |
|---|---|---|---|
| `knowledge.enabled` | boolean | `false` | Enable domain knowledge. When false, no sqlite-vec extension is loaded and no vector index is created. |
| `knowledge.embeddingModel` | string | `"nomic-ai/nomic-embed-text-v1.5"` | Local ONNX embedding model (downloaded once on first use via Hugging Face Transformers.js). |
| `knowledge.dimensions` | number | `768` | Embedding vector dimensions. Must match the model. |
| `knowledge.chunkSize` | number | `512` | Token chunk size for document splitting. |
| `knowledge.chunkOverlap` | number | `64` | Overlap between consecutive chunks. |
| `knowledge.wiki.enabled` | boolean | `false` | Enable wiki synthesis mode: the agent maintains a set of Markdown pages that synthesise knowledge across documents. Disable for pure RAG mode. |
| `knowledge.wiki.lint.schedule` | string | `"0 9 * * 1"` | Cron schedule for wiki lint (orphan/stale detection). Default: 9 AM every Monday. |

→ See [Domain Knowledge](../capabilities/domain-knowledge.md).

---

## `budget`

Token and cost limits. All limits are **per-context per-day/session/turn** — not instance-wide.

| Field | Type | Default | Description |
|---|---|---|---|
| `budget.daily_tokens` | number \| null | `null` | Maximum tokens per context per day. `null` = no limit. |
| `budget.daily_cost_usd` | number \| null | `null` | Maximum spend (USD) per context per day. `null` = no limit. |
| `budget.session_tokens` | number \| null | `null` | Maximum tokens per session. |
| `budget.session_cost_usd` | number \| null | `null` | Maximum spend (USD) per session. |
| `budget.turn_tokens` | number \| null | `null` | Maximum tokens per single agent turn. |
| `budget.turn_cost_usd` | number \| null | `null` | Maximum spend (USD) per turn. |
| `budget.warn_threshold` | number | `0.8` | Fraction of limit at which a warning is emitted (0.8 = warn at 80% of limit). |

Cost is tracked via pi's built-in ModelRegistry. For local/Ollama models, cost is unavailable (displayed as "cost unavailable", not $0.00).

→ See [Token Budget](../capabilities/token-budget.md).

---

## `resilience`

Controls how reeboot handles provider outages, crashed turns, and missed scheduled tasks.

| Field | Type | Default | Description |
|---|---|---|---|
| `resilience.recovery.mode` | string | `"safe_only"` | How to handle crashed turns on restart: `"safe_only"` (replay only turns that used no side-effect tools), `"always"` (replay all), `"never"` (discard all). |
| `resilience.recovery.side_effect_tools` | string[] | `[]` | Tool names considered unsafe to replay (e.g. `"send_email"`). Used by `safe_only` mode. |
| `resilience.outage_threshold` | number | `3` | Consecutive provider failures before an outage is declared. |
| `resilience.probe_interval` | string | `"1h"` | How often to probe the provider during an active outage to detect recovery. |
| `resilience.scheduler.catchup_window` | string | `"1h"` | How far back to look for missed scheduled tasks on restart. Tasks missed beyond this window are skipped. |

→ See [Resilience](../deployment/resilience.md).

---

## `extensions`

### `extensions.core`

Toggle built-in extensions. All default to `true` (enabled).

| Field | Type | Default | Description |
|---|---|---|---|
| `extensions.core.sandbox` | boolean | `true` | OS-level sandboxing for bash tool execution. |
| `extensions.core.confirm_destructive` | boolean | `true` | Ask the agent to confirm before running destructive file operations. |
| `extensions.core.protected_paths` | boolean | `true` | Prevent the agent from writing to sensitive paths (e.g. `~/.ssh`, `~/.reeboot/config.json`). |
| `extensions.core.git_checkpoint` | boolean | `false` | Automatically commit a git checkpoint before destructive operations (opt-in). |
| `extensions.core.session_name` | boolean | `true` | Assign a human-readable name to each session. |
| `extensions.core.custom_compaction` | boolean | `true` | Custom context compaction strategy (summarises old turns rather than truncating). |
| `extensions.core.scheduler_tool` | boolean | `true` | Register the `schedule_task`, `timer`, and `heartbeat` tools. |
| `extensions.core.token_meter` | boolean | `true` | Track token and cost usage per turn in the `usage` table. |
| `extensions.core.mcp` | boolean | `true` | Enable the MCP proxy tool (requires `mcp.servers` to be configured). |
| `extensions.core.injection_guard` | boolean | `true` | Prompt injection detection for content fetched from external sources. |

---

## `mcp`

MCP (Model Context Protocol) tool servers accessed via the `mcp` proxy tool.

### `mcp.servers[]`

Each entry in the `servers` array defines one MCP server:

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | Unique name for this server (used in `mcp({ action: "list" })`). |
| `command` | string | required | Executable to spawn (e.g. `"npx"`, `"/usr/local/bin/my-server"`). |
| `args` | string[] | `[]` | Arguments passed to the command. |
| `env` | object | `{}` | Environment variables set for the server process. |
| `permissions.network` | boolean | `false` | Allow the server process to make outbound network requests. |
| `permissions.filesystem` | boolean | `false` | Allow the server process to access the filesystem. |

**Example:**

```json
{
  "mcp": {
    "servers": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        "env": {},
        "permissions": { "network": false, "filesystem": true }
      }
    ]
  }
}
```

→ See [MCP Tools](../capabilities/mcp-tools.md).

---

## `security`

### `security.injection_guard`

| Field | Type | Default | Description |
|---|---|---|---|
| `security.injection_guard.enabled` | boolean | `true` | Enable prompt injection detection. |
| `security.injection_guard.external_source_tools` | string[] | `["fetch_url", "web_fetch"]` | Tools whose output is treated as untrusted external content and scanned for injection attempts. |

---

## `permissions`

### `permissions.violations`

| Field | Type | Default | Description |
|---|---|---|---|
| `permissions.violations.log` | boolean | `true` | Log permission violations (tool access denied, injection detected) to the audit events table. |

---

## `skills`

| Field | Type | Default | Description |
|---|---|---|---|
| `skills.permanent` | string[] | `[]` | Skills always loaded into the system prompt (by name). E.g. `["github", "notion"]`. |
| `skills.ephemeral_ttl_minutes` | number | `60` | Default lifetime for on-demand skill loads. After this, the skill is unloaded from context. |
| `skills.catalog_path` | string | `""` | Path to an additional skill catalog directory (beyond the bundled skills). |

---

## `contexts[]`

Define named contexts for multi-thread conversations.

| Field | Type | Default | Description |
|---|---|---|---|
| `contexts[].name` | string | required | Context identifier (used in routing rules and `--context` flag). |
| `contexts[].tools.whitelist` | string[] | `[]` | If non-empty, only the listed tool names are available in this context. |

**Example:**

```json
{
  "contexts": [
    { "name": "work", "tools": { "whitelist": ["web_search", "fetch_url"] } },
    { "name": "personal" }
  ]
}
```

---

## Complete Annotated Example

```json
{
  "agent": {
    "name": "Reeboot",
    "turnTimeout": 300000,
    "model": {
      "authMode": "own",
      "provider": "anthropic",
      "id": "claude-sonnet-4-5",
      "apiKey": "sk-ant-..."
    }
  },
  "channels": {
    "web": { "enabled": true, "port": 3000 },
    "whatsapp": {
      "enabled": true,
      "owner_id": "+15551234567",
      "owner_only": true,
      "trust": "owner"
    },
    "signal": {
      "enabled": false,
      "phoneNumber": "+15559876543",
      "apiPort": 8080
    }
  },
  "search": { "provider": "duckduckgo" },
  "memory": {
    "enabled": true,
    "memoryCharLimit": 2200,
    "userCharLimit": 1375,
    "consolidation": { "enabled": true, "schedule": "0 2 * * *" }
  },
  "knowledge": {
    "enabled": false,
    "wiki": { "enabled": false }
  },
  "budget": {
    "daily_tokens": null,
    "daily_cost_usd": 2.00,
    "session_tokens": 100000,
    "session_cost_usd": null,
    "turn_tokens": 20000,
    "turn_cost_usd": null,
    "warn_threshold": 0.8
  },
  "heartbeat": {
    "enabled": true,
    "interval": "every 30m",
    "contextId": "main"
  },
  "resilience": {
    "recovery": { "mode": "safe_only" },
    "outage_threshold": 3,
    "probe_interval": "1h",
    "scheduler": { "catchup_window": "1h" }
  },
  "logging": { "level": "info", "retention_days": 30 },
  "sandbox": { "mode": "os" },
  "mcp": {
    "servers": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/documents"],
        "env": {},
        "permissions": { "network": false, "filesystem": true }
      }
    ]
  },
  "skills": {
    "permanent": [],
    "ephemeral_ttl_minutes": 60
  },
  "routing": {
    "default": "main"
  },
  "session": {
    "inactivityTimeout": 14400000
  }
}
```
