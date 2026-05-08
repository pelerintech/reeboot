# reeboot

> Your personal AI agent. Runs locally. Talks to you from anywhere.

One command to install. One conversation to configure. Then it's yours — running on your machine, connected to your WhatsApp or Signal, available in your browser, remembering everything you tell it.

---

## Quick Install

```bash
npm install -g reeboot
reeboot
```

First run launches the setup wizard. Subsequent runs start the agent directly.

---

## What It Can Do

| Capability | Description |
|---|---|
| **WebChat** | Browser-based chat at `http://localhost:3000` — no install required |
| **WhatsApp** | Scan a QR code — your agent lives in your WhatsApp DMs |
| **Signal** | Connect via Signal Docker container (json-rpc or polling mode) |
| **Personal Memory** | Remembers facts, preferences, and corrections across sessions |
| **Domain Knowledge** | Ingest your documents — the agent searches them with local vector embeddings |
| **Scheduled Tasks** | Ask the agent to remind you or run jobs on a cron schedule |
| **Proactive Agent** | Heartbeat + in-session timers — the agent can wake itself up |
| **Web Search** | 7 backends: DuckDuckGo, Brave, Tavily, Serper, Exa, SearXNG, or none |
| **MCP Tools** | Connect any MCP-compatible tool server via stdio |
| **Token Budget** | Per-context daily, session, and turn spend limits |
| **Observability** | Structured logs, audit event table, live SSE log stream |
| **Resilience** | Crash recovery, outage detection, scheduler catchup on restart |
| **Multi-context** | Separate conversation threads (work, personal, projects) |
| **Extensions** | Pi-compatible TypeScript extensions — tools, hooks, custom prompts |
| **Skills** | 15 bundled Markdown skill files; load more on demand |
| **Packages** | Install community tool packages: `reeboot install npm:reeboot-github-tools` |
| **Sandbox** | OS-level confinement for bash tool execution (macOS + Linux) |
| **Daemon mode** | Run as a background service (launchd on macOS, systemd on Linux) |

---

## Architecture

Reeboot is a single Node.js process. All channels connect to the same orchestrator, which routes messages to the AI agent and returns responses.

```
  WhatsApp ──┐
  Signal   ──┤                  ┌──────────────────────────────────┐
  WebChat  ──┼─► ChannelRegistry│                                  │
  HTTP API ──┘       │          │        reeboot process            │
                     ▼          │                                  │
               ChannelPolicy    │                                  │
               Layer (Tier 1)   │                                  │
                     │          │                                  │
                     ▼          │                                  │
               MessageBus ──────┼──► Orchestrator                 │
                                │         │                        │
                                │         ▼                        │
                                │    AgentRunner (pi)              │
                                │         │                        │
                                │         ▼                        │
                                │    LLM Provider                  │
                                │  (Anthropic / OpenAI / …)        │
                                └──────────────────────────────────┘

  Config:  ~/.reeboot/config.json
  Data:    ~/.reeboot/db/reeboot.db  (SQLite)
  Logs:    ~/.reeboot/logs/
  Memory:  ~/.reeboot/agent/MEMORY.md + USER.md
```

---

## Providers

Choose from 8 LLM providers during setup:

| Provider | Models |
|---|---|
| **Anthropic** | claude-sonnet-4-5, claude-opus-4-5, claude-3-5-haiku |
| **OpenAI** | gpt-4o, gpt-4o-mini, o3-mini |
| **Google** | gemini-2.0-flash, gemini-2.5-pro-preview |
| **Groq** | llama-3.3-70b-versatile |
| **Mistral** | mistral-large-latest, mistral-small-latest |
| **xAI** | grok-2-latest |
| **OpenRouter** | Any model via openrouter.ai |
| **Ollama** | Any locally-running model |

Or set `authMode: "pi"` to reuse your existing pi provider credentials.

---

## Documentation

Full documentation lives at **[docs.reeboot.dev](https://docs.reeboot.dev)** — or browse the [`docs/`](./docs/) folder in this repo.

| Section | What's there |
|---|---|
| [Getting Started](./docs/getting-started/introduction.md) | Install, setup wizard, quick start |
| [Channels](./docs/channels/webchat.md) | WebChat, WhatsApp, Signal, trust model |
| [Configuration](./docs/configuration/reference.md) | Full config reference — every field |
| [Capabilities](./docs/capabilities/memory.md) | Memory, knowledge, scheduling, budgets, MCP, and more |
| [Security](./docs/security/sandbox.md) | Sandbox, injection guard, permission tiers |
| [Observability](./docs/observability/logging.md) | Logs, events, audit trail |
| [Deployment](./docs/deployment/daemon.md) | Daemon, Docker, resilience |
| [Extending](./docs/extending/skills.md) | Skills, extensions, channel adapters, packages |

---

## Docker

```bash
docker run -d \
  -v ~/.reeboot:/home/reeboot/.reeboot \
  -p 3000:3000 \
  --name reeboot \
  reeboot/reeboot:latest
```

---

## License

MIT
