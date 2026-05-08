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
reeboot
```

On first run, the setup wizard launches automatically. It walks you through:

1. **Auth mode** — use your existing pi credentials, or enter your own API key
2. **Provider** — Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, or Ollama
3. **Model** — curated list per provider, or enter any model ID
4. **Agent name** — defaults to `Reeboot`
5. **Channels** — optionally link WhatsApp or Signal inline
6. **Web search** — choose a search backend (DuckDuckGo, Brave, Tavily, Serper, Exa, SearXNG, or none)

Config is written to `~/.reeboot/config.json` at the end. If you exit early, nothing is saved.

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
reeboot                   Start agent (or run wizard on first run)
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

reeboot channel list      List channels and status
reeboot channel login whatsapp   Link WhatsApp (shows QR code)
reeboot channel login signal     Link Signal
reeboot channel logout <ch>      Disconnect a channel

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
2. Run `reeboot channel login whatsapp`
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
