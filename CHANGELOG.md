# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.2] - 2026-03-21

### Fixed

- **WhatsApp device linking hangs after QR scan** — `linkWhatsAppDevice` now reconnects automatically on stream error 515 (`restartRequired`), which WhatsApp sends as a normal part of the post-pairing handshake. Previously the function had no reconnect logic and would hit the 2-minute timeout instead of completing the link.

---

## [1.3.1] - 2026-03-21

### Fixed

- **Scheduler init crash** — stale `dist/scheduler.js` was importing `node-cron` (removed in 1.3.0 in favour of the poll-loop) causing `ERR_MODULE_NOT_FOUND` on startup; fixed by rebuilding from updated source
- **TypeScript build error in `src/index.ts`** — accidental `import type { Prompter }` from test helper (`tests/helpers/fake-prompter.ts`) instead of `src/wizard/prompter.ts`; caused `rootDir` violation and blocked `tsc`
- **WhatsApp timeout: `sock.end()` arity** — baileys 6.7.21 requires `end(error: Error | undefined)`; calling it with no arguments caused a TypeScript error (`Expected 1 arguments, but got 0`)

---

## [1.3.0] - 2026-03-21

### Added

**Setup Wizard UX**
- Revamped interactive setup wizard with dedicated steps: provider selection, agent name, channel linking, and web search backend
- First-run entrypoint — wizard launches automatically when no config exists, starts agent on completion
- `reeboot setup` re-runs the wizard and asks before overwriting existing config
- Support for 8 AI providers in wizard (Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama)
- Inline QR code display during channel linking (WhatsApp and Signal) within the wizard
- Ollama model list loaded dynamically from local Ollama instance during setup

**Scheduler Upgrade**
- Natural language schedule parsing — `"every 5m"`, `"daily at 9am"`, `"every monday"`, etc.
- Task run log with per-task execution history
- Task poll loop — scheduler continuously checks for due tasks
- `reeboot tasks due` command — shows upcoming scheduled tasks
- Task management tools exposed to the agent (`schedule_task`, `cancel_task`, `list_tasks`, `pause_task`, `resume_task`)

**Proactive Agent**
- System heartbeat — fires at a configurable interval, dispatches a task snapshot prompt to the agent; silent when nothing to do
- In-session `timer` tool — non-blocking one-shot wait; agent can set a timer and be woken up after delay
- In-session `heartbeat` tool — periodic non-blocking wake-up within a session (`start`, `stop`, `status`)
- Sleep interceptor extension — blocks `sleep` when it is the sole or last command in a bash chain, redirects agent to use `timer` instead

**Web Search Extension**
- `web_search` tool with 7 pluggable backends: DuckDuckGo (zero config), Brave, Tavily, Serper, Exa, SearXNG (self-hosted), none
- `fetch_url` tool — always available; fetches any URL and returns clean readable text (Readability + HTML-strip fallback)
- Automatic fallback to DuckDuckGo when configured backend is unreachable at startup
- API key support via environment variables (`BRAVE_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`) or config

**Skill Manager Extension**
- `load_skill`, `unload_skill`, `list_available_skills` tools exposed to the agent
- Agent can load/unload skills on demand with optional TTL
- `reeboot skills list` — browse all bundled skills
- `reeboot skills update` — pull extended skill catalog (coming soon)

**Bundled Skills (15)**
- `github` — issues, PRs, releases, Actions, code search (requires `gh` CLI)
- `gmail` — search, read, send, draft, labels, attachments (requires `gmcli` + GCP OAuth)
- `gcal` — list, create, update, delete calendar events (requires `gccli` + GCP OAuth)
- `gdrive` — list, read, upload, search Drive files (requires `gdcli` + GCP OAuth)
- `notion` — pages, databases, blocks, search (`NOTION_API_KEY`)
- `slack` — send messages, list channels, thread replies (`SLACK_BOT_TOKEN`)
- `linear` — issues, projects, teams, cycles (`LINEAR_API_KEY`)
- `hubspot` — contacts, deals, companies, pipelines (`HUBSPOT_ACCESS_TOKEN`)
- `postgres` — query, inspect schema, run statements (`psql` + `DATABASE_URL`)
- `sqlite` — query, inspect tables, run statements (`sqlite3` + `DATABASE_PATH`)
- `docker` — containers, images, compose stacks (`docker` CLI)
- `files` — read, write, search local filesystem
- `reeboot-tasks` — schedule, list, pause, cancel own tasks
- `web-research` — structured multi-query web research
- `send-message` — send a message back to the originating channel

**Docker & CI/CD**
- Official Docker container image (`reeboot/reeboot`) with `Dockerfile` and `entrypoint.sh`
- GitHub Actions CI workflow — lint, test, build, publish to npm and Docker Hub on `v*` tags
- Ollama model templates (`templates/models-ollama.json`)

---

## [1.2.0] - 2026-03-19

### Added

- Signal **json-rpc transport mode** — recommended over polling; lower latency, more reliable message delivery
- Signal RPC connection management — automatic reconnect, structured error handling

### Changed

- Signal channel refactored to support both `json-rpc` (recommended) and `polling` modes, configured via `signal.mode` in config
- WhatsApp session stability improvements — reduced disconnection rate on long-running instances

---

## [1.0.0] - 2026-03-18

### Added

**Channels**
- **WebChat** — browser-based chat UI served at `http://localhost:3000` via WebSocket
- **WhatsApp** — QR-code-based pairing; session credentials persisted across restarts
- **Signal** — polling mode via `bbernhard/signal-cli-rest-api` Docker container
- Channel registry — pluggable adapter interface for adding new channels

**Core Agent**
- Pi-compatible agent runner — wraps `pi` SDK to drive any supported LLM provider
- Multi-context conversations — separate isolated threads (e.g. work, personal, projects)
- 8 AI provider adapters: Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama
- Orchestrator — routes inbound messages to the correct agent context and returns responses

**Scheduler**
- Scheduled task system — cron-based job scheduling with persistent task storage
- Task API exposed to agent (create, cancel, list tasks)

**Infrastructure**
- SQLite database — sessions, conversation history, scheduled tasks (`~/.reeboot/db/reeboot.db`)
- HTTP REST API — status, health, context management endpoints
- WebSocket chat endpoint (`/ws`)
- Config system — `~/.reeboot/config.json` with environment variable overrides
- Extension loader — loads pi-compatible `.ts` extensions from `~/.reeboot/extensions/` and installed packages
- Package system — install/uninstall community tool packages from npm, git, or local paths
- Credential proxy — secure API key delegation without exposing keys to extensions
- Daemon mode — run as background service via launchd (macOS) or systemd (Linux)

**CLI**
- `reeboot` / `reeboot start` — start the agent server
- `reeboot setup` — interactive setup wizard
- `reeboot stop` / `reeboot restart` / `reeboot reload` — lifecycle management
- `reeboot doctor` — pre-flight diagnostics for channels, config, and connectivity
- `reeboot status` — agent and channel status
- `reeboot install` / `reeboot uninstall` — package management
- `reeboot channel login|logout|list` — channel authentication

**Bundled Extensions**
- `confirm-destructive` — intercepts potentially destructive operations and asks for confirmation
- `custom-compaction` — custom conversation compaction strategy
- `protected-paths` — blocks agent access to sensitive filesystem paths
- `sandbox` — optional filesystem sandbox for agent operations
- `session-name` — enriches system prompt with the current context/session name
- `token-meter` — tracks and reports token usage per turn
- `scheduler-tool` (basic) — exposes schedule/cancel/list tools to the agent

**Skills**
- `send-message` — send a reply to the originating channel
- `web-search` (basic) — web search stub
