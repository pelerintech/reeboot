# reeboot

> Your personal AI agent. One command to install. Runs locally. Talk to it from anywhere.

---

## Quick Start

```bash
npm install -g reeboot
reeboot
```

On first run, `reeboot` detects that no config exists and launches the guided setup wizard automatically. The wizard walks you through your AI provider, agent name, channels (WhatsApp / Signal), and web search backend. After setup it offers to start the agent immediately. On every subsequent run, `reeboot` starts directly.

---

## What It Can Do

| Capability | Description |
|---|---|
| **WebChat** | Browser-based chat UI at `http://localhost:3000` — no install required |
| **WhatsApp** | Scan a QR code — your agent lives in your WhatsApp DMs |
| **Signal** | Connect via a Signal Docker container (json-rpc or polling mode) |
| **Multi-context** | Separate conversation threads (work, personal, projects) |
| **Scheduled tasks** | Ask the agent to remind you or run jobs on a cron-like schedule |
| **Proactive agent** | System heartbeat + in-session timers — agent wakes itself up |
| **Web search** | 7 search backends (DuckDuckGo, Brave, Tavily, Serper, Exa, SearXNG, none) |
| **Extensions** | Pi-compatible TypeScript extensions — tools, compaction, custom prompts |
| **Skills** | 15 bundled Markdown skill files; load more on demand |
| **Packages** | Install community tool packages: `reeboot install npm:reeboot-github-tools` |
| **Daemon mode** | Run as a background service (launchd on macOS, systemd on Linux) |
| **Doctor** | `reeboot doctor` diagnoses your setup before you even start |

---

## Architecture

Reeboot is a single Node.js process. All channels connect to the same orchestrator, which routes messages to the AI agent and returns responses.

```
                    ┌──────────────────────────────────┐
                    │           reeboot process          │
                    │                                    │
  WhatsApp ────────►│  ChannelRegistry                  │
  Signal   ────────►│       │                           │
  WebChat  ────────►│   MessageBus ──► Orchestrator     │
  HTTP API ────────►│                       │            │
                    │               AgentRunner (pi)    │
                    │                       │            │
                    │                LLM Provider        │
                    │           (Anthropic / OpenAI …)  │
                    └──────────────────────────────────┘
```

Configuration lives in `~/.reeboot/config.json`. Sessions and conversation history are stored in `~/.reeboot/db/reeboot.db` (SQLite). Extensions are loaded from `~/.reeboot/extensions/` and `~/.reeboot/packages/`.

---

## Repo Layout

```
reeboot/          # The npm package — source, tests, extensions, skills
  src/            # Core TypeScript source
  extensions/     # Built-in pi extensions (scheduler, web-search, skill-manager, …)
  skills/         # 15 bundled Markdown skill files
  container/      # Dockerfile + entrypoint
openspec/         # Change proposals, design docs, specs (OpenSpec workflow)
reespec/          # Request planning artifacts (reespec workflow)
```

---

## Development

```bash
cd reeboot
npm install
npm test          # run full test suite (vitest)
npm run build     # compile TypeScript
```

The test suite uses [vitest](https://vitest.dev/). All core modules have unit tests in `reeboot/src/**/*.test.ts` and integration tests in `reeboot/tests/`.

---

## Links

- 📦 [npm package](https://www.npmjs.com/package/reeboot) — `npm install -g reeboot`
- 🐳 [Docker Hub](https://hub.docker.com/r/reeboot/reeboot) — `docker pull reeboot/reeboot`
- 📖 [Full usage docs](reeboot/README.md) — complete CLI reference, config, channels, extensions
- 🗒️ [Changelog](CHANGELOG.md)

---

## License

MIT
