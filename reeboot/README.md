# reeboot

> Your personal AI agent. Runs locally. Talks to you from anywhere.

---

## Install

```bash
npm install -g reeboot
```

Requires **Node.js ≥ 22**.

---

## First Run

```bash
reeboot init
```

Run `reeboot init` once after installing. The setup wizard walks you through:

1. **Provider** — local-first: Ollama, llama.cpp, LM Studio, Custom endpoint, or cloud: Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter
2. **API key** — for cloud providers (skipped for local)
3. **Model** — fetched live from the provider API, with a static fallback list; every menu has an "Enter custom value..." escape hatch
4. **Agent name** — defaults to `Reeboot`
5. **Channels** — optionally link WhatsApp or Signal inline
6. **Web search** — choose a search backend (DuckDuckGo, Brave, Tavily, Serper, Exa, SearXNG, or none)
7. **Start now?** — optionally launch the agent immediately after setup

Config is saved to `~/.reeboot/config.json`. If you exit early, nothing is saved.

> **Note:** `reeboot` and `reeboot start` will error if no config exists — run `reeboot init` first.

To re-run setup at any time:

```bash
reeboot setup
```

---

## Minimal Config

`~/.reeboot/config.json` — all fields are optional; these are the most common:

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
  },
  "channels": {
    "web": { "enabled": true, "port": 3000 },
    "whatsapp": { "enabled": false },
    "signal": {
      "enabled": false,
      "phoneNumber": "+15551234567",
      "apiPort": 8080
    }
  },
  "search": {
    "provider": "duckduckgo"
  },
  "capabilities": {
    "externalToolCap": 50
  }
}
```

> Full configuration reference → [docs/configuration/reference.md](../docs/configuration/reference.md)

---

## CLI Reference

```
reeboot init              First-run setup wizard (run this once after installing)
reeboot                   Start agent (errors if no config — run `reeboot init` first)
reeboot start             Start the agent server
reeboot start --daemon    Run as a background service (launchd / systemd)
reeboot stop              Stop the running daemon
reeboot setup             Re-run the setup wizard
reeboot status            Show agent and channel status
reeboot doctor            Pre-flight diagnostics
reeboot reload            Hot-reload extensions and skills
reeboot restart           Gracefully restart the agent

reeboot logs              Tail the log file
reeboot logs --follow     Live-stream logs (SSE)
reeboot logs --level warn Minimum log level to show

reeboot install <pkg>     Install a pi-compatible package
reeboot uninstall <name>  Uninstall a package
reeboot packages list     List installed packages

reeboot skills list       List all bundled skills

reeboot channels list                    List channels and status
reeboot channels login whatsapp          Link WhatsApp (shows QR code)
reeboot channels login signal            Link Signal
reeboot channels logout <ch>             Disconnect a channel
reeboot channels setup owner-whatsapp    Capture owner WhatsApp identity

reeboot contexts list     List contexts (coming soon)
reeboot contexts create <name>   Create a context (coming soon)

reeboot sessions list     List recent sessions (coming soon)

reeboot tasks due         List overdue scheduled tasks
```

---

## Channels

### WebChat

Open `http://localhost:3000` after starting the agent. No setup required.

→ [docs/channels/webchat.md](../docs/channels/webchat.md)

### WhatsApp

1. Set `"whatsapp": { "enabled": true }` in config
2. Run `reeboot channels login whatsapp`
3. Scan the QR code with WhatsApp → Settings → Linked Devices

→ [docs/channels/whatsapp.md](../docs/channels/whatsapp.md)

### Signal

1. Run the Signal CLI Docker container
2. Link your device via the QR URL
3. Set `"signal": { "enabled": true, "phoneNumber": "+1...", "apiPort": 8080 }` in config

→ [docs/channels/signal.md](../docs/channels/signal.md)

### ree Support Integration (multi-customer)

When `config.sdk` is set to `"ree"`, reeboot runs as a single-company support/triage
agent that serves **many mutually-private end-customers** in one process over the
Web/API WebSocket transport. Each customer is an isolated conversation with its
own history and `session_search` scope, created on demand from a client-supplied
conversation id — no pre-registered context and no cross-customer leakage.

**Endpoint:** `ws://<host>:<port>/ws/chat/:conversationId`

**Client contract:**

- **`conversationId`** (WS path segment) — the isolation axis. One stable id per
  customer conversation; same customer thread ⇒ same id; never reuse one
  customer's id for another. Rules: `^[A-Za-z0-9._:-]{1,128}$`; reserved ids
  (`main`, `__system__`, `scheduler`, `__outage_probe__`) are rejected.
- **Authentication** — `Authorization: Bearer <serverToken>` header (or
  `?token=<serverToken>` query param) for non-loopback connections. The shared
  server token authenticates the **client integration** (server-to-server), NOT
  the end-customer. Per-customer privacy is enforced solely by
  `conversationId → chat` isolation.
- **Reply routing** — each WS connection receives a unique `sessionId`; replies
  and streaming events are delivered only to the connection that sent the
  message. `conversationId` (isolation) and `sessionId` (reply routing) are
  explicit and orthogonal.
- **Cancel** — send `{ "type": "cancel" }` to abort the in-flight turn on that
  connection's conversation; other conversations are unaffected.

**Isolation guarantees:**

- Each `conversationId` maps to a distinct `ReeChat` with its own durable history
  (`chat_messages`) and FTS `session_search` scope.
- ree turns do **not** write the shared `messages` table (no cross-customer
  co-mingling surface).
- All conversations share one workspace (the RAG corpus); there is no
  per-customer filesystem. Tools that write files must not assume per-customer
  isolation.
- Lazily-created runners are evicted on inactivity so orchestrator maps stay
  bounded; a re-arriving customer resumes from `chat_messages` unless the
  underlying chat was idle-pruned.

---

## Key Capabilities

| Capability | Docs |
|---|---|
| Personal memory | [capabilities/memory.md](../docs/capabilities/memory.md) |
| Domain knowledge / RAG | [capabilities/domain-knowledge.md](../docs/capabilities/domain-knowledge.md) |
| Scheduled tasks | [capabilities/scheduling.md](../docs/capabilities/scheduling.md) |
| Web search | [capabilities/web-search.md](../docs/capabilities/web-search.md) |
| MCP tool servers | [capabilities/mcp-tools.md](../docs/capabilities/mcp-tools.md) |
| Token budget | [capabilities/token-budget.md](../docs/capabilities/token-budget.md) |
| Proactive agent | [capabilities/proactive-agent.md](../docs/capabilities/proactive-agent.md) |
| Sandbox & security | [security/sandbox.md](../docs/security/sandbox.md) |
| Observability & logs | [observability/logging.md](../docs/observability/logging.md) |
| Resilience & recovery | [deployment/resilience.md](../docs/deployment/resilience.md) |
| Extensions & skills | [extending/extensions.md](../docs/extending/extensions.md) |

> **Tool discovery:** The agent discovers all registered tools automatically via the capabilities extension. Bundled (internal) tools are always advertised. External tools from MCP servers or user extensions are capped at 50 by default (configurable via `capabilities.externalToolCap`). If memory or other tools are not working, check that the feature is enabled in `config.json` and the `capabilities_injected` event appears in the observability stream.

---

## Development

```bash
cd reeboot
npm install
npm test          # vitest — full test suite
npm run build     # compile TypeScript → dist/
```

---

## Docker

For deployments on bare machines with nothing but Docker installed — a separate,
CLI-independent deployment path:

```bash
git clone <repo>
cd reeboot
cp config.example.json ./data/config.json
# edit config.json with your provider, model, and API key
docker compose up -d
```

The full stack includes reeboot, SearXNG (web search), and Signal CLI. Caddy is
available (commented out) for automatic HTTPS when you have a domain. See the
[root README Docker section](../README.md#docker-full-stack) for details.

## Links

- 📦 [npm](https://www.npmjs.com/package/reeboot)
- 📖 [Full docs](../docs/)
- 🗒️ [Changelog](../CHANGELOG.md)

---

## License

MIT
