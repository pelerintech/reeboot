# reeboot

> Your personal AI agent. One command to install. Runs locally. Talk to it from anywhere.

---

## Quick Start

```bash
npm install -g reeboot
reeboot
```

That's it. On first run, `reeboot` detects that no config exists and launches the guided setup wizard automatically. The wizard walks you through:

1. **AI Provider** — choose from 8 providers (Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama)
2. **Agent Name** — give your agent a name (default: Reeboot)
3. **Channels** — optionally link WhatsApp or Signal inline (QR code shown in terminal)
4. **Web Search** — choose DuckDuckGo (default), Brave, Tavily, Serper, Exa, SearXNG, or None

After setup, the wizard offers to start your agent immediately. On subsequent runs, `reeboot` detects the existing config and starts the agent directly — no flags needed.

To re-run setup: `reeboot setup` (asks before overwriting your existing config).

Open the WebChat URL printed on startup, or send a message to your linked WhatsApp/Signal number.

---

## What It Can Do

| Capability | Description |
|---|---|
| **WebChat** | Browser-based chat UI, available instantly at `http://localhost:3000` |
| **WhatsApp** | Scan a QR code — your agent lives in your WhatsApp DMs |
| **Signal** | Connect via a Signal Docker container (json-rpc or polling mode) |
| **Multi-context** | Separate conversation threads (work, personal, projects) |
| **Scheduled tasks** | Ask your agent to remind you or run jobs on a cron schedule |
| **Extensions** | Pi-compatible extension system — tools, compaction, custom prompts |
| **Skills** | Drop Markdown skill files into `~/.reeboot/skills/` for instant capabilities |
| **Packages** | Install community tool packages: `reeboot install npm:reeboot-github-tools` |
| **Daemon mode** | Run as a background service (launchd on macOS, systemd on Linux) |
| **Doctor** | `reeboot doctor` diagnoses your setup before you even start |

---

## Architecture Overview

Reeboot is a single Node.js process. All channels (WhatsApp, Signal, WebChat) connect to the same orchestrator, which routes messages to the AI agent and returns responses.

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

## Configuration Reference

Config file: `~/.reeboot/config.json`

```json
{
  "agent": {
    "provider": "anthropic",
    "apiKey": "sk-ant-...",
    "model": "claude-opus-4-5",
    "name": "Reeboot",
    "turnTimeout": 300000,
    "rateLimitRetries": 3
  },
  "channels": {
    "web": {
      "enabled": true,
      "port": 3000
    },
    "whatsapp": {
      "enabled": false
    },
    "signal": {
      "enabled": false,
      "phoneNumber": "+15551234567",
      "apiUrl": "http://localhost:8080",
      "pollInterval": 1000
    }
  },
  "extensions": {
    "packages": []
  },
  "credentialProxy": {
    "enabled": false
  }
}
```

**Environment variables** (override config values):
- `REEBOOT_API_KEY` — LLM provider API key
- `REEBOOT_PROVIDER` — provider name
- `REEBOOT_MODEL` — model ID
- `REEBOOT_PORT` — HTTP port (default: 3000)

---

## Extension System

Reeboot uses a three-level extension ladder. Pick the right level for what you want to do:

### Level 1 — Skills (Markdown, easiest)

Drop a `SKILL.md` file into `~/.reeboot/skills/<skill-name>/SKILL.md`. The agent reads it as a system-level instruction when the skill is invoked. Great for domain-specific personas, checklists, or prompt templates.

```
~/.reeboot/skills/
  morning-standup/
    SKILL.md        ← "When asked for standup, ask 3 questions then summarise..."
  code-review/
    SKILL.md
```

### Level 2 — Pi Extensions (TypeScript, full tool access)

Drop a `.ts` file into `~/.reeboot/extensions/`. Extensions are pi-compatible — they can register tools, hook into system prompt generation, and intercept messages.

```typescript
// ~/.reeboot/extensions/my-tool.ts
export default {
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a city',
      inputSchema: { ... },
      handler: async ({ city }) => { ... }
    }
  ]
};
```

Reload without restart: `reeboot reload`

### Level 3 — Channel Adapters (TypeScript, custom channels)

Implement the `ChannelAdapter` interface from `reeboot/channels` to add new messaging channels (Telegram, SMS, Slack, etc.):

```typescript
import type { ChannelAdapter } from 'reeboot/channels';

export class TelegramAdapter implements ChannelAdapter {
  // ...
}
```

### Community Packages

Install published packages that bundle tools, extensions, or channel adapters:

```bash
reeboot install npm:reeboot-github-tools
reeboot install npm:reeboot-obsidian-tools
reeboot install git:github.com/you/my-reeboot-pack
reeboot install ./path/to/local-package
```

List installed packages:

```bash
reeboot packages list
```

Uninstall:

```bash
reeboot uninstall reeboot-github-tools
```

**Publishing a community package** — add a `pi` manifest to your `package.json`:

```json
{
  "name": "reeboot-github-tools",
  "pi": {
    "extensions": ["./dist/github-extension.js"],
    "skills": ["./skills/"]
  }
}
```

---

## Web Search

Reeboot includes a built-in web search extension that registers two agent tools:

- **`fetch_url`** — Always available. Fetches any URL and returns clean readable text (Readability extraction with HTML-strip fallback).
- **`web_search`** — Available when `search.provider` is not `"none"`. Searches the web via the configured backend and returns an array of `{ title, url, snippet }` results.

### Providers

| Provider | Free Tier | Config |
|----------|-----------|--------|
| `duckduckgo` | ✅ Zero config, HTML scraping | No API key needed |
| `brave` | ✅ 2,000 queries/month free | `BRAVE_API_KEY` or `config.search.apiKey` |
| `tavily` | ✅ 1,000 queries/month free | `TAVILY_API_KEY` or `config.search.apiKey` |
| `serper` | ✅ 2,500 queries free | `SERPER_API_KEY` or `config.search.apiKey` |
| `exa` | ✅ 1,000 queries/month free | `EXA_API_KEY` or `config.search.apiKey` |
| `searxng` | ✅ Self-hosted (Docker) | `searxngBaseUrl` in config |
| `none` | — | Disables `web_search`; `fetch_url` still available |

### Configuration

Add a `search` block to `~/.reeboot/config.json`:

```json
{
  "search": {
    "provider": "duckduckgo"
  }
}
```

For API-key providers:

```json
{
  "search": {
    "provider": "brave",
    "apiKey": "your-brave-api-key"
  }
}
```

Or set the env var instead of storing the key in config:

```bash
export BRAVE_API_KEY=your-key     # for brave
export TAVILY_API_KEY=your-key    # for tavily
export SERPER_API_KEY=your-key    # for serper
export EXA_API_KEY=your-key       # for exa
```

### SearXNG (Self-Hosted)

```json
{
  "search": {
    "provider": "searxng",
    "searxngBaseUrl": "http://localhost:8080"
  }
}
```

Start SearXNG with Docker:

```bash
docker run -d -p 8080:8080 searxng/searxng
```

If SearXNG is unreachable at agent startup, reeboot automatically falls back to DuckDuckGo for the session.

### Disabling Web Search

```json
{
  "search": {
    "provider": "none"
  }
}
```

`fetch_url` remains available even when `provider = "none"`.


---

## WhatsApp Setup

1. Enable WhatsApp in your config (`"whatsapp": { "enabled": true }`)
2. Start the agent: `reeboot start`
3. Run the channel login: `reeboot channel login whatsapp`
4. A QR code appears in your terminal — scan it with WhatsApp (Settings → Linked Devices → Link a Device)
5. The agent is now available in your WhatsApp DMs

```
┌─────────────────────────────────────┐
│  ██████░░██░░░░████░░███░░░██████   │
│  ██░░░░░░██░░░░██░░░░██░██░░██      │   ← Scan with WhatsApp
│  ██░░░░░░████░░████░░█████░░██      │
│  ██░░░░░░██░░░░██░░░░██░██░░██      │
│  ██████░░██░░░░████░░███░░░██████   │
└─────────────────────────────────────┘
```

The session persists across restarts (credentials saved in `~/.reeboot/credentials/`).

---

## Signal Setup

Signal requires the [`bbernhard/signal-cli-rest-api`](https://github.com/bbernhard/signal-cli-rest-api) Docker container.

**Step 1 — Link your Signal account**

```bash
docker run -p 8080:8080 \
  -v ~/.reeboot/signal-data:/home/user/.local/share/signal-cli \
  -e MODE=native \
  bbernhard/signal-cli-rest-api:latest
```

Then open `http://localhost:8080/v1/qrcodelink?device_name=reeboot` in your browser and scan the QR with Signal (Settings → Linked Devices → Link new device).

**Step 2 — Run in json-rpc mode (recommended)**

```bash
docker run -p 8080:8080 \
  -v ~/.reeboot/signal-data:/home/user/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest
```

**Step 3 — Enable in reeboot config**

```json
"signal": {
  "enabled": true,
  "phoneNumber": "+15551234567",
  "apiUrl": "http://localhost:8080"
}
```

Then: `reeboot start`

---

## Bundled Skills

Reeboot ships 15 skills inside the package — no extra install needed. The agent can load them on demand via `load_skill("name")` or you can make them permanently available via config.

| Skill | What it does | Requires |
|---|---|---|
| `github` | Issues, PRs, releases, Actions, code search | `gh` CLI + `gh auth login` |
| `gmail` | Search, read, send, draft, labels, attachments | `gmcli` npm CLI + GCP OAuth |
| `gcal` | List, create, update, delete calendar events | `gccli` npm CLI + GCP OAuth |
| `gdrive` | List, read, upload, search Drive files | `gdcli` npm CLI + GCP OAuth |
| `notion` | Pages, databases, blocks, search | `NOTION_API_KEY` env var |
| `slack` | Send messages, list channels, thread replies | `SLACK_BOT_TOKEN` env var |
| `linear` | Issues, projects, teams, cycles | `LINEAR_API_KEY` env var |
| `hubspot` | Contacts, deals, companies, pipelines | `HUBSPOT_ACCESS_TOKEN` env var |
| `postgres` | Query, inspect schema, run statements | `psql` CLI + `DATABASE_URL` |
| `sqlite` | Query, inspect tables, run statements | `sqlite3` CLI + `DATABASE_PATH` |
| `docker` | Containers, images, compose stacks | `docker` CLI |
| `files` | Read, write, search local filesystem | bash (built-in) |
| `reeboot-tasks` | Schedule, list, pause, cancel own tasks | scheduler extension (built-in) |
| `web-research` | Structured multi-query web research | web-search extension |
| `send-message` | Send a message to the originating channel | reeboot channels (built-in) |

### Skill configuration

```yaml
# ~/.reeboot/config.yaml
skills:
  permanent: [github, gmail]   # always in context
  ephemeral_ttl_minutes: 60    # default lifetime for on-demand loads
```

### Managing skills

```bash
reeboot skills list             # browse all 15 bundled skills
reeboot skills update           # pull extended catalog (coming soon)
```

The agent can also manage its own skills:

```
User: load the notion skill for 30 minutes
Agent: → calls load_skill("notion", 30)

User: what integrations do you have available?
Agent: → calls list_available_skills()

User: unload notion, I'm done
Agent: → calls unload_skill("notion")
```

---

## CLI Reference

```
reeboot [command] [options]

Commands:
  start         Start the agent server
  stop          Stop the running daemon
  setup         Interactive setup wizard
  status        Show agent and channel status
  doctor        Run pre-flight diagnostics
  reload        Hot-reload extensions and skills
  restart       Gracefully restart the agent

  install <pkg>         Install a pi-compatible package
  uninstall <name>      Uninstall a package

  packages list         List installed packages

  skills list           List all bundled skills
  skills update         Update extended skill catalog

  channel list          List channels and their status
  channel login <ch>    Authenticate a channel (whatsapp, signal)
  channel logout <ch>   Disconnect a channel

Options:
  start:
    --daemon              Run as background service (launchd/systemd)
    --no-interactive      Skip prompts (use with --provider etc.)
    --provider <name>     LLM provider
    --api-key <key>       API key
    --model <id>          Model ID
    --channels <list>     Comma-separated channel list
    --name <name>         Agent name

  setup:
    --no-interactive      Non-interactive (use with flags below)
    --provider, --api-key, --model, --channels, --name

  doctor:
    --skip-network        Skip network checks (API key validation, Signal version)
```

---

## Docker

Run reeboot as a container, mounting your config from the host:

```bash
docker run -d \
  -v ~/.reeboot:/home/reeboot/.reeboot \
  -p 3000:3000 \
  --name reeboot \
  reeboot/reeboot:latest
```

Health check:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptime":42,"version":"1.0.0"}
```

WebChat is available at `http://localhost:3000`.

**Docker Compose example:**

```yaml
services:
  reeboot:
    image: reeboot/reeboot:latest
    ports:
      - "3000:3000"
    volumes:
      - ~/.reeboot:/home/reeboot/.reeboot
    restart: unless-stopped
```

---

## CI/CD Secrets

To use the GitHub Actions publish pipeline, add these repository secrets:

| Secret | Description |
|---|---|
| `NPM_TOKEN` | npm automation token (`npm token create --type=automation`) |
| `DOCKERHUB_TOKEN` | Docker Hub access token (Hub → Account Settings → Security) |

The workflow automatically publishes to npm and pushes Docker images when you push a `v*` tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## License

MIT

---

## Links

- [npm package](https://www.npmjs.com/package/reeboot)
- [Docker Hub](https://hub.docker.com/r/reeboot/reeboot)
- [Architecture decisions](../architecture-decisions.md)

---

## Proactive Agent

Reeboot supports a **proactive agent** mode where the agent can wake itself up, check for tasks, and act without being asked.

### System Heartbeat

The system heartbeat fires at a configurable interval and dispatches a prompt to the agent with the current task snapshot. If the agent has nothing to do, it responds with `IDLE` (silently suppressed). Otherwise, the response is sent to the default channel.

Configure in `~/.reeboot/config.json`:

```json
{
  "heartbeat": {
    "enabled": true,
    "interval": "every 5m",
    "contextId": "main"
  }
}
```

- `enabled`: Default `false`. Set to `true` to enable.
- `interval`: Human-friendly interval string (same parser as `schedule_task`). Examples: `"every 5m"`, `"every 1h"`, `"daily"`.
- `contextId`: Which context the heartbeat runs in. Default `"main"`.

### In-Session Timer Tool

The `timer` tool lets the agent set a **non-blocking** one-shot wait. It returns immediately and fires a new agent turn after the delay:

```
timer(seconds: 10, message: "Check build status", id: "build-check")
```

- `seconds`: 1–3600
- `message`: Included in the wake-up message
- `id` (optional): If a timer with the same id exists, it is replaced

### In-Session Heartbeat Tool

The `heartbeat` tool starts a periodic non-blocking wake-up:

```
heartbeat(action: "start", interval_seconds: 60, message: "Deploy check")
heartbeat(action: "stop")
heartbeat(action: "status")
```

- Only one heartbeat is active per session. Starting a new one replaces the previous.
- `interval_seconds`: 10–3600

### Sleep Interceptor

The extension automatically blocks `sleep` when it is the **sole or last** command in a bash chain, redirecting the agent to use `timer` instead:

| Command | Outcome |
|---------|---------|
| `sleep 60` | ❌ Blocked — use `timer(60, msg)` |
| `npm build && sleep 60` | ❌ Blocked — sleep is last |
| `sleep 2 && npm start` | ✅ Allowed — sleep is not last |
| `npm build \|\| sleep 5` | ✅ Allowed — `\|\|` is not a split point |

Disable the interceptor: `REEBOOT_SLEEP_INTERCEPTOR=0 reeboot start`
