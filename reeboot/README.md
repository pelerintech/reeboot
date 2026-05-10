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

1. **Deployment** — native (default) or Docker (coming soon)
2. **Provider** — local-first: Ollama, llama.cpp, LM Studio, Custom endpoint, or cloud: Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter
3. **API key** — for cloud providers (skipped for local)
4. **Model** — fetched live from the provider API, with a static fallback list; every menu has an "Enter custom value..." escape hatch
5. **Agent name** — defaults to `Reeboot`
6. **Channels** — optionally link WhatsApp or Signal inline
7. **Web search** — choose a search backend (DuckDuckGo, Brave, Tavily, Serper, Exa, SearXNG, or none)
8. **Start now?** — optionally launch the agent immediately after setup

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

---

## Development

```bash
cd reeboot
npm install
npm test          # vitest — full test suite
npm run build     # compile TypeScript → dist/
```

---

## Links

- 📦 [npm](https://www.npmjs.com/package/reeboot)
- 🐳 [Docker Hub](https://hub.docker.com/r/reeboot/reeboot)
- 📖 [Full docs](../docs/)
- 🗒️ [Changelog](../CHANGELOG.md)

---

## License

MIT
