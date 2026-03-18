# Phase 1 — `reeboot` (Core Package)

**Repo:** `github.com/<org>/reeboot`
**npm:** `reeboot`
**License:** MIT (open source)
**Runtime:** Node.js ≥ 22, TypeScript, ESM

---

## What It Is

A personal AI agent that runs locally on your machine. Install it with one command, talk to it via WhatsApp, Signal, or a built-in TUI/WebChat. It can execute code, search the web, manage files, schedule tasks, and remember things — all sandboxed and secure. Powered by the pi SDK, so it works with any LLM provider (Anthropic, OpenAI, Google, etc.).

**Tagline:** "Your personal AI agent. One command to install. Runs locally. Talk to it from anywhere."

---

## Installation & Onboarding

### For Everyone (wizard-based)

```bash
npx reeboot
```

First run detects no config exists at `~/.reeboot/` and launches an **interactive setup wizard**:

1. **Welcome** — Brief explanation of what reeboot is
2. **LLM Provider** — Pick provider (Anthropic, OpenAI, Google, OpenRouter, Ollama) + enter API key
3. **Model** — Select model from provider's available models (with sensible default)
4. **Channels** — Multi-select:
   - `[x] WebChat (built-in, always on)`
   - `[ ] WhatsApp (scan QR code in terminal)`
   - `[ ] Signal (requires signal-cli setup)`
5. **WhatsApp setup** (if selected) — Displays QR code in terminal via Baileys, waits for scan
6. **Signal setup** (if selected) — Guides through signal-cli-rest-api Docker sidecar setup
7. **Agent name** — "What should your agent be called?" (default: "Reeboot")
8. **Done** — Writes `~/.reeboot/config.json`, scaffolds contexts, starts the agent

After setup: `npx reeboot` just starts the agent. No wizard unless `--setup` flag or no config exists.

### For Developers (config file)

```bash
npm install -g reeboot
```

Create `~/.reeboot/config.json` manually:

```json5
{
  "agent": {
    "name": "Reeboot",
    "runner": "pi",              // "pi" only for now; interface is swappable
    "model": {
      "provider": "anthropic",
      "id": "claude-sonnet-4-20250514"
    }
  },
  "channels": {
    "web": { "enabled": true, "port": 3000 },
    "whatsapp": { "enabled": true },
    "signal": { "enabled": false }
    // Custom channel adapters can be added here — see Extension System
  },
  "sandbox": {
    "mode": "os"  // "os" | "docker" | "off"
  },
  "extensions": {
    // Core safety extensions (disable only if you know what you're doing)
    "core": {
      "sandbox": true,
      "confirm_destructive": true,
      "protected_paths": true,
      "git_checkpoint": false    // opt-in
    },
    // Extra npm/git packages loaded globally across all contexts
    "packages": [],
    // Extra skill search paths beyond ~/.reeboot/skills/
    "skill_paths": []
  }
}
```

Then:
```bash
reeboot start                    # Start the agent
reeboot start --daemon           # Start as background service (launchd/systemd)
reeboot setup                    # Re-run setup wizard
reeboot doctor                   # Validate config, check dependencies
reeboot channels login whatsapp  # Login to WhatsApp (QR code)
reeboot channels login signal    # Setup Signal
reeboot channels list            # List connected channels
reeboot contexts list            # List contexts
reeboot contexts create <name>   # Create new context
reeboot sessions list            # List sessions
reeboot status                   # Show running status
reeboot stop                     # Stop the agent

# Extension system
reeboot install npm:<package>    # Install an extension/skill package globally
reeboot install git:<repo>       # Install from git
reeboot install ./local/path     # Install from local path
reeboot uninstall <package>      # Remove a package
reeboot packages list            # List installed packages
reeboot reload                   # Hot-reload extensions + skills (no restart)
reeboot restart                  # Full restart (required for channel adapter changes)
```

### Non-Interactive Install (CI / scripting)

```bash
npx reeboot setup \
  --provider anthropic \
  --api-key sk-... \
  --model claude-sonnet-4-20250514 \
  --channels web \
  --no-interactive
```

---

## Architecture

```
WhatsApp (Baileys) ──┐
Signal (signal-cli) ──┤
TUI (terminal) ──────┤
WebChat (HTTP+WS) ───┤
Custom adapters ─────┘  ← ChannelAdapter interface (user-extensible)
                      ▼
        ┌──────────────────────────┐
        │     Orchestrator         │
        │   (single Node.js proc)  │
        │                          │
        │  ┌────────────────────┐  │
        │  │  Channel Registry  │  │  ← self-registering adapters
        │  └────────┬───────────┘  │
        │           │              │
        │  ┌────────▼───────────┐  │
        │  │  Message Router    │  │  ← routes to context by rules
        │  └────────┬───────────┘  │
        │           │              │
        │  ┌────────▼───────────┐  │
        │  │  Agent Runner      │  │  ← AgentRunner interface
        │  │  (PiAgentRunner    │  │     swappable backend
        │  │   wraps pi SDK)    │  │
        │  └────────┬───────────┘  │
        │           │              │
        │  ┌────────▼───────────┐  │
        │  │  Scheduler         │  │  ← node-cron tasks
        │  └────────────────────┘  │
        │                          │
        │  ┌────────────────────┐  │
        │  │  Extension Loader  │  │  ← pi extensions + skills
        │  │  (hot-reloadable)  │  │     ~/.reeboot/extensions/
        │  └────────────────────┘  │     ~/.reeboot/skills/
        │                          │
        │  ┌────────────────────┐  │
        │  │  SQLite (data)     │  │  ← better-sqlite3
        │  └────────────────────┘  │
        │                          │
        │  ┌────────────────────┐  │
        │  │  Credential Proxy  │  │  ← agents never see real keys
        │  └────────────────────┘  │
        │                          │
        │  ┌────────────────────┐  │
        │  │  HTTP + WS Server  │  │  ← Fastify, serves WebChat + API
        │  └────────────────────┘  │
        └──────────────────────────┘
```

**Single Node.js process.** No microservices. The orchestrator IS the server.

---

## HTTP + WebSocket API

The core exposes a **Fastify server** on a configurable port (default: 3000) with both REST and WebSocket endpoints. This is how the built-in WebChat works, and it's the same API that the Phase 2 web UI will connect to.

### REST Endpoints

```
GET  /api/health                        → { status, uptime, version }
GET  /api/status                        → { agent, channels, contexts, activeSession }

GET  /api/contexts                      → [{ id, name, model, status }]
POST /api/contexts                      → create context
GET  /api/contexts/:id                  → context details
PATCH /api/contexts/:id                 → update context config

GET  /api/contexts/:id/sessions         → list sessions for context
GET  /api/contexts/:id/sessions/:sid    → session details + message history

GET  /api/channels                      → [{ type, status, connectedAt }]
POST /api/channels/:type/login          → initiate channel login
POST /api/channels/:type/logout         → disconnect channel

GET  /api/tasks                         → list scheduled tasks
POST /api/tasks                         → create task
DELETE /api/tasks/:id                   → delete task
```

### WebSocket Endpoint

```
WS /ws/chat/:contextId
```

**Protocol:**
```
→ Client connects
← Server: { type: "connected", contextId, sessionId }

→ Client: { type: "message", content: "Hello" }
← Server: { type: "message_start", runId }
← Server: { type: "text_delta", delta: "Hi! " }
← Server: { type: "text_delta", delta: "How can I help?" }
← Server: { type: "tool_call_start", id, tool: "bash", args: {...} }
← Server: { type: "tool_call_delta", id, delta: "..." }
← Server: { type: "tool_call_end", id, result: {...} }
← Server: { type: "message_end", runId, usage: { input: 150, output: 42 } }

→ Client: { type: "cancel" }
← Server: { type: "cancelled", runId }
```

**Auth:** Token-based. `REEBOOT_API_TOKEN` env var or `config.server.token`. Required for non-loopback connections. Sent as `Authorization: Bearer <token>` header on WS upgrade or `?token=<token>` query param.

### Built-in WebChat

Served at `GET /` — a minimal HTML+JS chat UI bundled with the package. No build step, no framework. Just enough to test and use the agent from a browser. Think "websocat with a nice face."

---

## Channel Adapters

### Channel Registry Pattern (from NanoClaw)

```typescript
// src/channels/registry.ts
export interface ChannelAdapter {
  readonly type: string;
  init(config: ChannelConfig, bus: MessageBus): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, content: MessageContent): Promise<void>;
  status(): ChannelStatus;
}

const registry = new Map<string, () => ChannelAdapter>();

export function registerChannel(type: string, factory: () => ChannelAdapter) {
  registry.set(type, factory);
}
```

### WhatsApp (Baileys)

- **Package:** `@whiskeysockets/baileys` (v7)
- **Connection:** Direct WebSocket to WhatsApp servers (no Puppeteer/Chromium)
- **Auth state:** Persisted at `~/.reeboot/channels/whatsapp/auth/` using Baileys multi-auth state
- **QR code:** Displayed in terminal during `reeboot channels login whatsapp` or during setup wizard
- **Message handling:** Listen for `messages.upsert`, extract text/media, route to orchestrator
- **Sending:** Support text, images, documents. Chunking for long responses.
- **Reconnection:** Baileys handles automatic reconnection. Orchestrator monitors status.

### Signal (signal-cli-rest-api)

- **Docker sidecar:** `bbernhard/signal-cli-rest-api` (2.4k stars)
- **Communication:** REST API from Node.js to Docker container
- **Setup:** `reeboot channels login signal` → guides through docker pull + registration
- **Registration:** Link as secondary device to existing Signal account OR register new number
- **Message handling:** Poll or webhook from signal-cli-rest-api → orchestrator
- **Gotcha:** signal-cli must be updated every ~3 months for protocol changes

### Web/WebSocket (built-in)

- Always enabled by default
- Fastify WebSocket at `/ws/chat/:contextId`
- Built-in WebChat UI at `/`
- This is the same endpoint the Phase 2 TanStack Start UI will connect to

---

## Context System

Contexts are isolated agent workspaces. Each context has its own AGENTS.md (persona/memory), extensions, skills, and sessions.

### Directory Structure (user's machine)

```
~/.reeboot/
├── config.json                    # Global config
├── reeboot.db                     # SQLite database
├── channels/
│   ├── whatsapp/
│   │   └── auth/                  # Baileys auth state
│   └── signal/
│       └── config.json            # signal-cli connection info
├── contexts/
│   ├── global/
│   │   └── AGENTS.md              # Shared memory across all contexts
│   ├── main/
│   │   ├── AGENTS.md              # "You are Reeboot, my personal assistant..."
│   │   ├── workspace/             # Agent's working directory (sandboxed)
│   │   └── .pi/
│   │       ├── extensions/
│   │       │   ├── sandbox/       # OS-level sandboxing
│   │       │   ├── confirm-destructive.ts
│   │       │   ├── protected-paths.ts
│   │       │   ├── git-checkpoint.ts
│   │       │   └── scheduler-tool.ts
│   │       └── skills/
│   │           ├── web-search/SKILL.md
│   │           └── send-message/SKILL.md
│   └── work/
│       ├── AGENTS.md
│       ├── workspace/
│       └── .pi/
│           └── extensions/
│               ├── sandbox/
│               └── protected-paths.ts
└── sessions/
    ├── main/                      # Sessions for main context
    │   ├── session-2026-03-17-abc.json
    │   └── session-2026-03-18-def.json
    └── work/
        └── ...
```

### Context Routing

Messages from channels need to reach the right context. Routing rules in config:

```json5
{
  "routing": {
    "default": "main",
    "rules": [
      // Route WhatsApp group "Work Team" to work context
      { "match": { "channel": "whatsapp", "peer": "120363...@g.us" }, "context": "work" },
      // Route all Signal messages to main
      { "match": { "channel": "signal" }, "context": "main" },
      // Explicit context switch via command
      // Users can also type "/context work" in any channel
    ]
  }
}
```

**Priority order** (most specific wins, inspired by OpenClaw):
1. Exact peer match (specific DM/group)
2. Channel match
3. Default context

**In-chat commands:**
- `/context <name>` — switch current conversation to a different context
- `/contexts` — list available contexts
- `/new` — start new session in current context
- `/status` — show current context, model, token usage
- `/compact` — compact/summarize session context

---

## Agent Runner

### Swappable Interface

The orchestrator never talks directly to the pi SDK. It talks to an `AgentRunner` interface. This keeps the swap cost small if a second backend (e.g. a future Claude Code SDK) is ever needed.

```typescript
// src/agent-runner/interface.ts

export type RunnerEvent =
  | { type: "text_delta";      delta: string }
  | { type: "tool_call_start"; id: string; tool: string; args: unknown }
  | { type: "tool_call_end";   id: string; result: unknown; isError: boolean }
  | { type: "message_end";     usage: { input: number; output: number } }
  | { type: "error";           message: string };

export interface AgentRunner {
  prompt(text: string, onEvent: (e: RunnerEvent) => void): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

export interface AgentRunnerFactory {
  create(context: ContextConfig): Promise<AgentRunner>;
}
```

Config selects the backend:
```json5
{ "agent": { "runner": "pi" } }  // "pi" is the only built-in for Phase 1
```

### `PiAgentRunner` — Phase 1 Implementation

Wraps `createAgentSession()` from `@mariozechner/pi-coding-agent` and translates pi's event stream into `RunnerEvent`.

```typescript
// src/agent-runner/pi-runner.ts
import {
  createAgentSession, AuthStorage, ModelRegistry,
  DefaultResourceLoader, SessionManager, SettingsManager,
  createCodingTools,
} from "@mariozechner/pi-coding-agent";

export class PiAgentRunner implements AgentRunner {
  private session: AgentSession;

  static async create(context: ContextConfig): Promise<PiAgentRunner> {
    const cwd = context.workspacePath;
    const authStorage = AuthStorage.create(`${cwd}/.pi/auth.json`);
    authStorage.setRuntimeApiKey(context.model.provider, context.model.apiKey);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: REEBOOT_AGENT_DIR,           // ~/.reeboot — global extensions + skills
      // Bundled extensions always loaded:
      extensionFactories: BUNDLED_EXTENSIONS,
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd,
      agentDir: REEBOOT_AGENT_DIR,
      model: new ModelRegistry(authStorage).find(context.model.provider, context.model.id),
      tools: createCodingTools(cwd),
      resourceLoader: loader,
      sessionManager: SessionManager.open(context.sessionFile),
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: true } }),
      authStorage,
      modelRegistry: new ModelRegistry(authStorage),
    });

    return new PiAgentRunner(session);
  }

  async prompt(text: string, onEvent: (e: RunnerEvent) => void): Promise<void> {
    return new Promise((resolve) => {
      this.session.subscribe((event) => {
        if (event.type === "message_update") {
          const ae = event.assistantMessageEvent;
          if (ae.type === "text_delta") onEvent({ type: "text_delta", delta: ae.delta });
        }
        if (event.type === "tool_execution_start")
          onEvent({ type: "tool_call_start", id: event.toolCallId, tool: event.toolName, args: event.args });
        if (event.type === "tool_execution_end")
          onEvent({ type: "tool_call_end", id: event.toolCallId, result: event.result, isError: event.isError });
        if (event.type === "agent_end") {
          onEvent({ type: "message_end", usage: event.usage });
          resolve();
        }
      });
      this.session.prompt(text);
    });
  }

  async abort() { await this.session.abort(); }
  dispose()     { this.session.dispose(); }
}
```

### Container Mode (Phase 3 / SaaS)

Same interface, different factory. Switch via config:

```json5
{ "sandbox": { "mode": "docker" } }  // "os" | "docker" | "off"
```

Docker mode uses the NanoClaw IPC pattern:
- Stdin/stdout for primary request/response with sentinel markers
- Credential proxy on host (agents never see real API keys)
- Per-context isolated filesystem mounts

---

## Credential Proxy (from NanoClaw)

**Problem:** Agents running in sandbox/container shouldn't have access to real API keys.

**Solution:** A tiny HTTP proxy running on the host (localhost:3001) that:
1. Receives API requests from the agent with a placeholder key
2. Replaces the placeholder with the real API key
3. Forwards to the LLM provider
4. Returns the response

```typescript
// src/credential-proxy.ts
const proxy = Fastify();

proxy.all('/v1/*', async (req, reply) => {
  const realKey = getApiKey(req.headers['x-reeboot-provider']);
  const response = await fetch(providerUrl + req.url, {
    method: req.method,
    headers: { ...req.headers, 'authorization': `Bearer ${realKey}` },
    body: req.body,
  });
  return reply.send(response.body);
});
```

In sandbox/container mode, the agent's environment gets:
```
ANTHROPIC_API_KEY=placeholder-reeboot
REEBOOT_PROXY_URL=http://127.0.0.1:3001
```

Real `.env` file is shadow-mounted as `/dev/null` in container mode.

---

## Sandboxing

### OS-Level (Phase 1 default, personal use)

Uses the `@anthropic-ai/sandbox-runtime` pi extension (copied from pi examples):
- `sandbox-exec` on macOS, `bubblewrap` on Linux
- Filesystem + network restrictions
- Zero Docker overhead, millisecond startup
- Agent can only access its own context workspace directory

### Docker (Phase 3 / SaaS)

Docker container per context/tenant:
- `node:22-slim` base image
- Non-root user (uid 1000)
- Ephemeral (`--rm`)
- Only context workspace mounted (rw)
- Global AGENTS.md mounted (ro)
- Credential proxy for API access

---

## Scheduler

Built-in task scheduler for recurring/scheduled agent actions.

```typescript
// src/scheduler.ts
import cron from 'node-cron';

interface ScheduledTask {
  id: string;
  contextId: string;
  schedule: string;       // cron expression
  prompt: string;         // what to tell the agent
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}
```

**As a pi extension tool** (available to the agent):

```typescript
// The agent can schedule its own tasks
tools: [
  {
    name: "schedule_task",
    description: "Schedule a recurring task",
    parameters: { schedule: "cron expression", prompt: "what to do", contextId: "optional" },
  },
  {
    name: "list_tasks",
    description: "List scheduled tasks",
  },
  {
    name: "cancel_task",
    description: "Cancel a scheduled task",
    parameters: { taskId: "string" },
  },
]
```

Tasks are persisted in SQLite. When a task fires, the scheduler sends the prompt to the agent runner for the specified context.

---

## Extension System

Reeboot has three extension points. They compose and are designed so that zero-friction tasks (teaching the agent a workflow) don't require code, and heavier tasks (new tools, new input channels) have clear interfaces.

### Extension Point 1 — Pi Extensions (Tools, Guards, Hooks)

TypeScript files the pi SDK loads into the agent's execution loop. No build step required. Hot-reloadable via `reeboot reload` or `/reload` in chat.

**Discovery order** (pi `DefaultResourceLoader` handles this automatically):
```
~/.reeboot/extensions/                       ← global, all contexts
~/.reeboot/contexts/<name>/.pi/extensions/   ← per-context
```

**Bundled extensions** (always active, shipped inside the npm package):

| Extension | Source | Purpose |
|-----------|--------|---------|
| `sandbox/` | pi examples | OS-level sandboxing (macOS sandbox-exec, Linux bubblewrap) |
| `confirm-destructive.ts` | pi examples | Confirm before `rm -rf`, `sudo` |
| `protected-paths.ts` | pi examples | Block writes to `.env`, `*.pem`, `*.key` |
| `git-checkpoint.ts` | pi examples | Auto-commit workspace at each turn (opt-in) |
| `session-name.ts` | pi examples | Auto-name sessions from first message |
| `custom-compaction.ts` | pi examples | Smarter context summarization |
| `scheduler-tool.ts` | custom (~80 lines) | Registers `schedule_task` / `list_tasks` / `cancel_task` tools |
| `token-meter.ts` | custom (~60 lines) | Tracks token usage per context → SQLite |

Bundled extensions are loaded via `DefaultResourceLoader`'s `extensionFactories` option so they are always active regardless of `~/.reeboot/extensions/` contents. Core safety ones (sandbox, confirm-destructive, protected-paths) can be toggled via `config.extensions.core`.

**User-installed extensions:**

```bash
# Drop a file — no restart, type /reload in chat or run reeboot reload
cp my-notion-tool.ts ~/.reeboot/extensions/

# Or install a package
reeboot install npm:reeboot-github-tools

# Per-context only
cp my-work-tool.ts ~/.reeboot/contexts/work/.pi/extensions/
```

**Security note:** Extensions run in the reeboot process with full OS permissions. The bundled safety extensions protect the agent's own actions; they do not sandbox extension code itself. Only install extensions from sources you trust.

### Extension Point 2 — Skills (Agent Behaviors, Pure Markdown)

Skills teach the agent *how* to do something. No code, no build step, no restart required. The agent sees all skill descriptions at startup; full instructions load on-demand when a task matches.

**Discovery:**
```
~/.reeboot/skills/                           ← global
~/.reeboot/contexts/<name>/.pi/skills/       ← per-context
+ any paths in config.extensions.skill_paths ← e.g. ~/.claude/skills
```

**Bundled skills** (shipped with reeboot, always active):

| Skill | Purpose |
|-------|---------|
| `web-search/SKILL.md` | Teaches agent to use web search API |
| `send-message/SKILL.md` | Lets agent send messages back via originating channel |

**User-installed skills:**

```bash
# Drop a directory — instant, no restart, no reload
mkdir -p ~/.reeboot/skills/docker-management
# write SKILL.md with frontmatter name + description + instructions

# Or install a package that includes skills
reeboot install npm:reeboot-skills-devops

# Re-use skills from other agents
# config.extensions.skill_paths: ["~/.claude/skills"]
```

### Extension Point 3 — Channel Adapters (New Input/Output Channels)

Reeboot-specific interface for adding new communication channels (Telegram, Discord, Slack, email, webhooks, etc.). Requires restart to take effect (adapters hold persistent connections).

```typescript
// src/channels/interface.ts  — already in plan, kept for completeness
export interface ChannelAdapter {
  readonly type: string;
  init(config: ChannelConfig, bus: MessageBus): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, content: MessageContent): Promise<void>;
  status(): ChannelStatus;
}
```

**Custom adapter wiring in config:**
```json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "...",
      "adapter": "~/.reeboot/channels/telegram.ts"  // path to ChannelAdapter impl
    }
  }
}
```

**Restart UX:** `reeboot restart` performs a graceful stop (waits for in-flight agent turns, closes channel connections) then restarts. Required after: adding/removing channel adapters, adding npm-packaged extensions. **Not** required after: dropping `.ts` files into `extensions/` or SKILL.md directories into `skills/`.

### The Extension Ladder

```
ZERO FRICTION ────────────────────────────── FULL CONTROL
      │                                             │
      ▼                                             ▼

  [Skills]           [Pi Extensions]       [Channel Adapters]
  SKILL.md files     TypeScript files      TypeScript class

  No code            No build step         Requires restart
  No restart         reeboot reload        Full TS interface
  Pure markdown      Tools + guards        New I/O channels
  Agent reads        LLM-callable tools    Bidirectional

  How-to guides      API integrations      Telegram, Discord
  Workflows          Security rules        Webhooks, email
  Procedures         New capabilities      IoT, internal apps
```

### Package System (Community Extensions)

`reeboot install` is a thin wrapper over pi's package mechanism, pointing at `~/.reeboot/` as the agent directory. Packages can contain extensions, skills, or both.

```bash
reeboot install npm:reeboot-github-tools@1.2.0
reeboot install git:github.com/user/my-reeboot-ext
reeboot install ./local/my-extension
reeboot uninstall reeboot-github-tools
reeboot packages list
```

A community package just needs `pi` manifest in `package.json`:
```json
{
  "name": "reeboot-github-tools",
  "keywords": ["pi-package", "reeboot-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  }
}
```

No new infrastructure — this is the pi package system with reeboot's agent dir.

---

## Database Schema (SQLite)

```sql
-- Contexts
CREATE TABLE contexts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at INTEGER
);

-- Messages (audit log, not used for agent context)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  context_id TEXT REFERENCES contexts(id),
  channel TEXT NOT NULL,
  peer_id TEXT,
  role TEXT NOT NULL,         -- 'user' | 'assistant'
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at INTEGER
);

-- Scheduled tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  context_id TEXT REFERENCES contexts(id),
  schedule TEXT NOT NULL,     -- cron expression
  prompt TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  last_run INTEGER,
  created_at INTEGER
);

-- Channel state
CREATE TABLE channels (
  type TEXT PRIMARY KEY,
  status TEXT NOT NULL,       -- 'connected' | 'disconnected' | 'error'
  config TEXT,                -- JSON blob
  connected_at INTEGER
);

-- Token usage tracking
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_id TEXT REFERENCES contexts(id),
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT,
  created_at INTEGER
);
```

---

## Memory System

### AGENTS.md Hierarchy

```
~/.reeboot/contexts/global/AGENTS.md     → shared across all contexts (read by all)
~/.reeboot/contexts/<name>/AGENTS.md     → per-context persona + memory
```

**Global AGENTS.md example:**
```markdown
# Global Memory

## User Profile
- Name: Ben
- Location: [city]
- Preferences: prefers concise responses, uses TypeScript

## Important Facts
- [accumulated facts the agent learns over time]
```

**Context AGENTS.md example (main):**
```markdown
# Reeboot — Personal Assistant

You are Reeboot, Ben's personal AI assistant.

## Personality
- Helpful, concise, proactive
- Remember things Ben tells you
- When unsure, ask rather than guess

## Capabilities
- You can execute code, read/write files, search the web
- You can schedule tasks for later
- You can send messages back via the channel the user contacted you from

## Memory
- [things the agent learns and writes here]
```

### Agent Self-Updating Memory

The agent can (and should) update its own AGENTS.md. When it learns something important, it writes to the Memory section. This is natural with pi SDK — the agent has `write` tool access to its context directory.

---

## Session Lifecycle

**When does a session start?**
- First message from a user after agent startup
- After `/new` command
- After a configurable inactivity timeout (default: 4 hours)

**When does a session end?**
- User sends `/new` or `/reset`
- Inactivity timeout
- Agent process restart

**Session persistence:**
- Sessions are saved by pi's `SessionManager` as JSON files
- Located at `~/.reeboot/sessions/<contextId>/`
- Can be resumed on restart (within the inactivity window)
- Session history browsable via API (`GET /api/contexts/:id/sessions`)

**Compaction:**
- Pi's built-in auto-compaction handles long sessions
- User can trigger manual compaction via `/compact`

---

## Deployment / Running as Service

### macOS (launchd)

```bash
reeboot start --daemon
# Generates ~/Library/LaunchAgents/com.reeboot.agent.plist
# Starts automatically on login
```

### Linux (systemd)

```bash
reeboot start --daemon
# Generates ~/.config/systemd/user/reeboot.service
# Starts automatically on boot
```

### Manual

```bash
reeboot start
# Runs in foreground, Ctrl+C to stop
```

### Docker (alternative)

```bash
docker run -d \
  -v ~/.reeboot:/root/.reeboot \
  -p 3000:3000 \
  --name reeboot \
  reeboot/reeboot
```

---

## Package Structure (npm)

```
reeboot/
├── src/
│   ├── index.ts                  # CLI entrypoint (commander)
│   ├── orchestrator.ts           # Message routing, context dispatch
│   ├── scheduler.ts              # node-cron task runner
│   ├── credential-proxy.ts       # API key proxy for sandboxed agents
│   ├── server.ts                 # Fastify HTTP + WS server
│   ├── config.ts                 # Config loading + defaults
│   ├── setup-wizard.ts           # Interactive first-run wizard
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema (SQLite)
│   │   └── index.ts              # Database connection
│   ├── channels/
│   │   ├── interface.ts          # ChannelAdapter interface + MessageBus type
│   │   ├── registry.ts           # Self-registering adapter registry
│   │   ├── whatsapp.ts           # Baileys adapter (implements ChannelAdapter)
│   │   ├── signal.ts             # signal-cli-rest-api adapter
│   │   └── web.ts                # WebSocket adapter
│   ├── agent-runner/
│   │   ├── interface.ts          # AgentRunner + AgentRunnerFactory interfaces
│   │   ├── pi-runner.ts          # PiAgentRunner: wraps pi createAgentSession()
│   │   ├── index.ts              # Factory: reads config.agent.runner, instantiates
│   │   └── container.ts          # Docker spawn (NanoClaw IPC) — Phase 3
│   ├── extensions/
│   │   └── loader.ts             # Wires DefaultResourceLoader with reeboot's agentDir
│   │                             # Mounts bundled extensions + user extensions + packages
│   └── webchat/
│       └── index.html            # Minimal built-in web chat UI
├── extensions/                   # Bundled pi extensions (always loaded)
│   ├── sandbox/                  # OS sandboxing — from pi examples
│   ├── confirm-destructive.ts    # from pi examples
│   ├── protected-paths.ts        # from pi examples
│   ├── git-checkpoint.ts         # from pi examples (opt-in via config)
│   ├── session-name.ts           # from pi examples
│   ├── custom-compaction.ts      # from pi examples
│   ├── scheduler-tool.ts         # custom: schedule_task / list_tasks / cancel_task
│   └── token-meter.ts            # custom: usage tracking → SQLite
├── skills/                       # Bundled pi skills (always active)
│   ├── web-search/SKILL.md
│   └── send-message/SKILL.md
├── templates/                    # Scaffolded into ~/.reeboot/ on first run
│   ├── global-agents.md          # ~/.reeboot/contexts/global/AGENTS.md
│   └── main-agents.md            # ~/.reeboot/contexts/main/AGENTS.md
├── container/                    # Docker image for container mode (Phase 3)
│   ├── Dockerfile
│   └── entrypoint.sh
├── package.json
│   # bin: { "reeboot": "./dist/index.js" }
│   # main: "./dist/index.js"
│   # exports: { ".": "./dist/index.js", "./channels": "./dist/channels/interface.js" }
│   #   ↑ exporting channels/interface.ts lets external adapter authors get types
├── tsconfig.json
└── README.md
```

### Key Dependencies

```json
{
  "dependencies": {
    "@mariozechner/pi-coding-agent": "latest",
    "@whiskeysockets/baileys": "^7.0.0",
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/static": "^8.0.0",
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.38.0",
    "node-cron": "^3.0.0",
    "commander": "^13.0.0",
    "inquirer": "^12.0.0",
    "pino": "^9.0.0",
    "nanoid": "^5.0.0"
  }
}
```

---

## Error Handling & Resilience

| Scenario | Behavior |
|----------|----------|
| LLM rate limit | Exponential backoff, notify user "Rate limited, retrying in Xs" |
| LLM provider down | Try failover model if configured, otherwise notify user |
| Sandbox blocks action | Agent sees the error, can adjust approach |
| WhatsApp disconnected | Auto-reconnect (Baileys handles this). Notify user via other channels if persistent. |
| Signal-cli outdated | `reeboot doctor` warns. Notify user via other channels. |
| Agent crash | Catch, log, notify user "Something went wrong. Starting new session." |
| Long-running agent task | Configurable timeout (default: 5 min). User can `/cancel`. |
| Disk full | Pre-check before agent runs. Alert user. |

---

## V1 Capabilities (What the Agent Can Do Out of the Box)

Based on research across NanoClaw, OpenClaw, Goose, Khoj, and others:

### Core (ships in v1)
- 💬 **Chat** — Natural conversation with memory across sessions
- 🖥️ **Execute code** — Run bash commands, scripts (sandboxed)
- 📁 **File management** — Read, write, edit files in workspace
- 🔍 **Web search** — Research topics via web search skill
- ⏰ **Scheduled tasks** — Cron-based automation ("remind me", "check X every morning")
- 🧠 **Persistent memory** — AGENTS.md auto-updated by the agent
- 📱 **Multi-channel** — WhatsApp + Signal + WebChat simultaneously
- 🔀 **Multiple contexts** — Separate "brains" for personal, work, projects
- 🔒 **Sandboxed** — Agent can't escape its workspace

### V2 Candidates (post-launch)
- 📧 Email integration (Gmail/IMAP)
- 📅 Calendar management
- 🌐 Browser automation (Playwright)
- 📸 Image understanding (vision models)
- 🔊 Voice interaction
- 🤖 Multi-agent coordination
- 🔌 MCP server support

---

## Build Order (Phase 1 Timeline)

### Week 1 — Foundation
- [ ] Repo setup (TypeScript, ESM, tsconfig, package.json with `bin`)
- [ ] Config system (`~/.reeboot/config.json`, defaults, validation) — include `agent.runner`, `extensions`, `channels` custom adapter fields
- [ ] SQLite + Drizzle schema
- [ ] Fastify server skeleton (health, status endpoints)
- [ ] CLI framework (commander: `start`, `setup`, `doctor`, `status`, `reload`, `restart`, `install`, `uninstall`, `packages list`)
- [ ] Setup wizard (inquirer-based, writes config + scaffolds contexts)

### Week 2 — Agent Runner + Extension System + First Channel
- [ ] `src/agent-runner/interface.ts` — `AgentRunner` + `AgentRunnerFactory` interfaces (30 lines, do this first)
- [ ] `src/channels/interface.ts` — `ChannelAdapter` + `MessageBus` interfaces (do this alongside runner)
- [ ] `PiAgentRunner` — wraps pi `createAgentSession()`, translates events to `RunnerEvent`
- [ ] `src/extensions/loader.ts` — wires `DefaultResourceLoader` with `~/.reeboot/` as agentDir; mounts bundled extensions
- [ ] Bundle pi extensions (sandbox, confirm-destructive, protected-paths, session-name, custom-compaction)
- [ ] Bundle skills (web-search, send-message)
- [ ] WebSocket endpoint (`/ws/chat/:contextId`)
- [ ] Built-in WebChat UI (minimal HTML)
- [ ] Context system (AGENTS.md hierarchy, workspace directories)
- [ ] **Milestone: WebChat message → AgentRunner interface → PiAgentRunner → response ✓**

### Week 3 — WhatsApp + Routing + Hot-Reload
- [ ] `ChannelRegistry` (self-registering, reads `channels.*.adapter` from config for custom adapters)
- [ ] Baileys WhatsApp adapter (`implements ChannelAdapter`)
- [ ] QR code login flow in terminal
- [ ] Message routing (channel → context rules)
- [ ] In-chat commands (`/context`, `/new`, `/status`, `/compact`)
- [ ] Session lifecycle (timeout, persistence, resume)
- [ ] `reeboot reload` — calls `loader.reload()` on the running `DefaultResourceLoader`; no restart needed for extensions/skills
- [ ] `reeboot restart` — graceful stop (drain in-flight turns, close channels) then re-spawn; required for channel adapter changes
- [ ] **Milestone: WhatsApp message → ChannelAdapter interface → response ✓**

### Week 4 — Signal + Scheduler + Package System + Polish
- [ ] Signal channel adapter (signal-cli-rest-api Docker sidecar, `implements ChannelAdapter`)
- [ ] Scheduler (node-cron + `scheduler-tool.ts` extension)
- [ ] `token-meter.ts` extension (usage tracking → SQLite)
- [ ] `reeboot install / uninstall / packages list` — thin wrapper over pi's install, `agentDir = ~/.reeboot`
- [ ] Credential proxy (agents never see real API keys)
- [ ] `reeboot doctor` diagnostics (checks config, extensions load, channel connections, API key validity)
- [ ] Daemon mode (launchd / systemd)
- [ ] Error handling + reconnection logic
- [ ] **Milestone: Full Phase 1 feature-complete ✓**

### Week 5 — npm Publish + Docs
- [ ] npm package preparation (`bin`, `exports` including `./channels` for adapter authors)
- [ ] README: installation, extension guide (skills → extensions → channel adapters ladder), screenshots
- [ ] `npx reeboot` zero-config experience tested end-to-end
- [ ] Docker image published
- [ ] **Milestone: Published on npm ✓**

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Baileys v7 RC breaking changes | Medium | Pin version, monitor releases, test on each update |
| Signal-cli protocol update | Medium | Pin version, quarterly update cadence, `reeboot doctor` warns |
| pi SDK API changes | Low | Pin version, pi is actively maintained |
| WhatsApp ban at scale | N/A | Phase 1 is personal use only — negligible risk |
| SQLite concurrency | Low | Single process, synchronous reads (better-sqlite3) |
| Large context windows exhausting tokens | Medium | Auto-compaction enabled, configurable limits |
| Node.js 22 not installed by user | Low | `npx` requires Node.js. Docs mention nvm/fnm. |
| User installs malicious extension/skill | Medium | Extensions run with full OS permissions. `reeboot install` warns clearly. `reeboot doctor` lists active extensions. Per-context extension isolation limits blast radius. |
| `reeboot reload` fails mid-session | Low | Reload errors are surfaced to the user; previous extension state remains active. Partial loads don't corrupt the session. |
| Custom channel adapter crashes on load | Low | Channel registry catches adapter errors per-adapter; other channels stay up. `reeboot doctor` checks adapter load. |
| Future runner swap breaks extension assumptions | Low | `AgentRunner` interface defined in Week 2 ensures orchestrator is decoupled. Extensions are pi-specific and would need porting only if pi is abandoned. |

---

## Differentiation from NanoClaw / OpenClaw

| Aspect | NanoClaw | OpenClaw | Reeboot |
|--------|----------|----------|---------|
| Install | Fork + claude /setup | `npm install -g openclaw` + wizard | `npx reeboot` (one command) |
| LLM lock-in | Claude only | Multi-provider (pi) | Multi-provider (pi); runner interface swappable |
| Web UI | None | Built-in WebChat | Built-in WebChat + Phase 2 standalone |
| npm package | No | Yes | Yes |
| Extension system | Claude skills | pi extensions + Skills + Plugins | Skills (no-restart) + pi extensions (hot-reload) + channel adapters |
| Package ecosystem | No | No | `reeboot install npm/git` — pi package system |
| Codebase size | ~35k tokens | Very large (320k stars) | Targeting ~2k lines |
| SaaS-ready | No | No | Phase 3 separate repo |
