# Architecture Decisions — `reeboot` Core

---

## Week 4 Decisions (Change: signal-scheduler-packages)

### Signal adapter uses REST polling, not webhook
`bbernhard/signal-cli-rest-api` supports both REST polling (`GET /v1/receive/<number>`) and WebSocket streaming. The polling approach is simpler and avoids exposing a webhook endpoint to the Docker container. Poll interval: 1 second (configurable via `config.channels.signal.pollInterval`). This is adequate for personal use messaging latency. The adapter connects by verifying the `/v1/about` endpoint is reachable; if Docker is not running, `adapter.status()` returns `'error'`.

### Credential proxy is opt-in, defaults to off in OS mode
`src/credential-proxy.ts` starts a second Fastify instance on `127.0.0.1:3001` only when `config.credentialProxy.enabled === true` (default: false). In Phase 1, the agent process already has full access to config/env, so the proxy is only useful for sandboxed modes (Phase 3). The `X-Reeboot-Provider` header selects the target provider (anthropic, openai, google, openrouter) and the real API key is injected from config. The proxy always binds loopback only.

### Package install mechanism: npm --prefix to ~/.reeboot/packages/
`reeboot install npm:<name>` runs `npm install --prefix ~/.reeboot/packages <name>` via `spawnSync`. The identifier (e.g., `npm:reeboot-github-tools`) is appended to `config.extensions.packages[]` in `~/.reeboot/config.json`. `reeboot uninstall <name>` reverses this. Supported spec prefixes: `npm:`, `git:`, and local paths. After install, users run `reeboot reload` to activate extensions — no restart needed.

### Daemon mode uses platform detection, not flags
`startDaemon()` reads `process.platform` (or an injected `platform` option for testing). On `'darwin'`: generates `~/Library/LaunchAgents/com.reeboot.agent.plist` and calls `launchctl load -w <plist>`. On `'linux'`: generates `~/.config/systemd/user/reeboot.service` and calls `systemctl --user enable --now reeboot`. Both services write stdout to `~/.reeboot/logs/reeboot.log` and stderr to `~/.reeboot/logs/reeboot-error.log`. `stopDaemon()` calls `launchctl unload` / `systemctl --user stop` without unregistering (the service remains enabled for the next login).

### Cron expression validation via node-cron validate()
The scheduler uses `node-cron`'s `validate(expression)` function before inserting or registering a task. Invalid expressions return an immediate tool error to the agent: `"Invalid cron expression: <expr>"`. This is consistent across both the `schedule_task` tool and the `POST /api/tasks` REST endpoint. The scheduler singleton is stored in `src/scheduler-registry.ts` and wired into the `scheduler-tool.ts` extension via a `globalScheduler` export.

### Turn timeout: configurable via config.agent.turnTimeout (default 5 min)
The orchestrator races `runner.prompt()` against a `setTimeout` of `config.agent.turnTimeout` ms (default 300,000 / 5 min). If the timeout wins, `runner.abort()` is called and the user receives: `"Your request timed out. The agent took too long to respond."` The turn resolves cleanly without crashing the process.

### Rate-limit retry strategy: exponential backoff, max 3 attempts
When `runner.prompt()` throws an error with `status === 429` or a message containing "rate limit", the orchestrator notifies the user (`"Rate limited — retrying in Ns..."`) and waits `2^attempt * backoffBase` ms before retrying (default `backoffBase = 5000ms`, giving 10s, 20s, 40s). Max retries default to 3, configurable via `config.agent.rateLimitRetries`. After exhausting retries, the error is reported as-is. Non-rate-limit errors are never retried. A `_testBackoffMs` escape hatch (internal, not in config schema) allows test suites to use short delays.

---

## Week 3 Decisions (Change: whatsapp-routing-hot-reload)

### MessageBus is an EventEmitter, not a queue
For Phase 1 (single process, personal use), `MessageBus` extends Node.js `EventEmitter`. Channels call `bus.publish(IncomingMessage)` which emits `('message', msg)`. The orchestrator subscribes via `bus.onMessage(handler)`. No Redis/RabbitMQ needed at this scale. If backpressure becomes a problem in a later phase, the `MessageBus` interface can be swapped to a queue implementation without changing callers.

### ChannelRegistry uses a singleton Map with self-registration
```typescript
export const globalRegistry = new ChannelRegistry();
export function registerChannel(type: string, factory: () => ChannelAdapter): void {
  globalRegistry.register(type, factory);
}
```
Built-in adapters (`web.ts`, `whatsapp.ts`) call `registerChannel()` at module import time. Custom adapters (from `config.channels.<type>.adapter`) are loaded with dynamic `import()` at startup. Load errors are caught per-adapter; other channels continue. This matches the NanoClaw pattern and keeps the registry side-effect-free until explicitly initialized.

### Routing rule priority order: peer > channel > default
The orchestrator resolves context using: (1) per-peer runtime override (set by `/context` command), (2) exact peer match in `config.routing.rules`, (3) channel-type match in `config.routing.rules`, (4) `config.routing.default`. This is simple, predictable, and fully testable without running a real agent.

### reload vs restart distinction
- **`reeboot reload`** → calls `runner.reload()` → `loader.reload()` on all active runners. Picks up new `.ts` extension files and new `SKILL.md` files. Channel connections remain open. In-flight turns are not interrupted. Implemented via `POST /api/reload` IPC to the running server.
- **`reeboot restart`** → full graceful shutdown: stop accepting new messages, drain in-flight turns (30s timeout), `adapter.stop()` on all channels, `runner.dispose()` on all runners, `process.exit(0)`. Process supervisor (launchd/systemd/pm2) is responsible for restarting. Implemented via `POST /api/restart`.

### Baileys version pinned at `7.0.0-rc.9`
Baileys v7 is still in RC. We pin the exact version (`"7.0.0-rc.9"` without `^`) in `package.json` to avoid breaking changes from RC bumps. The `WhatsAppAdapter` wraps the Baileys API in a single file (`src/channels/whatsapp.ts`) for easy auditing and updating.

### Message queue depth limit: 5 per context
When a context is busy processing a turn, incoming messages are queued. The queue is capped at 5. Additional messages beyond the cap receive a "Queue full." reply and are dropped. This prevents unbounded memory growth for personal-use scale.

### `reeboot/channels` export added
`package.json#exports` now includes `"./channels": "./dist/channels/interface.js"`. This enables external channel adapter authors to import `ChannelAdapter`, `MessageBus`, `IncomingMessage`, etc. with proper TypeScript types without depending on internal reeboot module paths.

### In-chat commands are handled by the orchestrator, not the agent runner
The orchestrator checks if `IncomingMessage.content.startsWith('/')` before calling `runner.prompt()`. Known commands (`/new`, `/context`, `/contexts`, `/status`, `/compact`) are dispatched to handler methods; the message is NOT forwarded to the LLM. Unknown slash-prefixed content is forwarded to the agent as a normal message. This keeps command handling channel-agnostic and testable without an LLM.

### Inactivity timeout managed by orchestrator, not runner
Each context has a per-context `setTimeout` in the orchestrator. The timer resets on every incoming message. On expiry, `runner.dispose()` is called and the context state is cleared. The next message creates a fresh runner and session. Default: 4 hours (`14_400_000` ms), configurable via `config.session.inactivityTimeout`.

---


## 0. Repo Foundation Decisions (Change: repo-foundation)

### Drizzle `push` Strategy for Local SQLite
We use `drizzle-kit push` for schema management during development — no migration files are needed for the local SQLite store. The schema is defined in `src/db/schema.ts` and applied via `CREATE TABLE IF NOT EXISTS` at startup via `openDatabase()`. If the schema changes in later changes, run `npx drizzle-kit push` to apply changes to the existing database. For production, migration files can be generated via `npx drizzle-kit generate`.

### `reeboot doctor` is a Stub Until Week 4
The `reeboot doctor` command is registered in the CLI but outputs `"doctor: not yet implemented"` and exits 0. Full diagnostics (checking config validity, database integrity, network connectivity, channel status) will be implemented in Week 4.

### Zod for Config Validation
Config is validated with Zod at load time. Schema is defined in `src/config.ts` as `ConfigSchema`. Unknown keys are stripped (not rejected) via Zod's default behavior, ensuring forward compatibility when new config fields are added. Required fields (`agent.model.provider`, `agent.model.id`, `agent.model.apiKey`) have defaults (empty string) so a partially-configured or unconfigured system loads without error — the wizard fills them in.

### `better-sqlite3` Pre-Built Binary Approach
`better-sqlite3` ships pre-built binaries for Node 22 on macOS and Linux via `@mapbox/node-pre-gyp`. No native compilation is required on install on supported platforms. This is well-established and reliable. If a target platform doesn't have pre-built binaries, `node-gyp` is used as fallback (requires build tools). This is acceptable for a local personal agent.

---

## 0b. Agent Runner & WebChat Implementation (Change: agent-runner-and-webchat)

### Pi SDK Event Field Names Used in PiAgentRunner

Verified against `@mariozechner/pi-agent-core/dist/types.d.ts` and `@mariozechner/pi-coding-agent` sources:

| Pi `AgentEvent` type | Field accessed | Mapped to `RunnerEvent` |
|---|---|---|
| `message_update` | `.assistantMessageEvent.type === "text_delta"`, `.assistantMessageEvent.delta` | `text_delta { delta }` |
| `tool_execution_start` | `.toolCallId`, `.toolName`, `.args` | `tool_call_start { toolCallId, toolName, args }` |
| `tool_execution_end` | `.toolCallId`, `.toolName`, `.result`, `.isError` | `tool_call_end { toolCallId, toolName, result, isError }` |
| `agent_end` | `.messages` (last assistant message `.usage.inputTokens/outputTokens`) | `message_end { runId, usage: { input, output } }` |

All other events (e.g. `agent_start`, `turn_start`, `turn_end`, `message_start`, `message_end`, `tool_execution_update`, compaction events, retry events) are silently ignored by `PiAgentRunner`.

**Note**: `AgentSessionEvent` extends `AgentEvent` with session-level events (`auto_compaction_start`, `auto_compaction_end`, `auto_retry_*`). None of these are forwarded.

### DefaultResourceLoader agentDir/cwd Split

In `src/extensions/loader.ts` and `src/agent-runner/index.ts`:
- `agentDir` = `~/.reeboot/` — global extensions (`~/.reeboot/extensions/`), skills (`~/.reeboot/skills/`)
- `cwd` = `context.workspacePath` = `~/.reeboot/contexts/<contextId>/workspace/` — project-local `.pi/extensions/`, `.pi/skills/` discovery

These MUST NOT be confused. The variable names in both files are explicit (`agentDir`, `workspacePath`) to prevent accidental swap.

### reload() on Runner Pattern

`PiAgentRunner.reload()` calls `loader.reload()` on the `DefaultResourceLoader` instance. This hot-reloads extensions and skills from disk without restarting the process or the underlying `AgentSession`. The `reeboot reload` command (Week 3) will iterate over all active runners and call `reload()` on each. The session continues with the same conversation history — only the resource set changes.

### @fastify/websocket Approach

WebSocket support is added via `@fastify/websocket` (Fastify v5 compatible). The route is declared as `{ websocket: true }` in the route options:

```typescript
server.get('/ws/chat/:contextId', { websocket: true }, async (socket, req) => { ... });
```

The `socket` object is a standard `WebSocket` instance from the `ws` library. Messages are raw `Buffer | string` received via `socket.on('message', ...)`. The plugin handles upgrade handshakes automatically.

**Protocol**: one `{ type: "message", content }` at a time. Server streams back `text_delta`, `tool_call_start`, `tool_call_end`, `message_end`. Client sends `{ type: "cancel" }` to abort. Concurrent messages from the same context are rejected with `{ type: "error", message: "Agent is busy..." }`.

**Graceful shutdown**: `stopServer()` iterates `_activeRunners` and calls `runner.abort()` on each before `fastify.close()`.

---

## 1. Agent Runner Abstraction (Swappable Backends)

### The Question
How hard is it to make the agent runner pluggable — swap pi SDK for Claude Code API (or anything else) and back?

### What pi SDK Actually Gives Us

The pi SDK entry point is `createAgentSession()`. It returns an `AgentSession` that:
- Accepts prompts via `session.prompt(text)`
- Streams events via `session.subscribe(handler)`
- Exposes the running agent state
- Manages session persistence, compaction, model switching

The SDK also owns: `ResourceLoader` (extensions + skills discovery), `SessionManager`, `AuthStorage`, `ModelRegistry`, `SettingsManager`. These are all pi-specific classes with pi-specific interfaces.

The good news: the event streaming protocol that pi emits is already fairly generic:
```
message_start → text_delta* → tool_call_start → tool_result → message_end → agent_end
```
Claude Code API (if Anthropic ever exposes one externally) would produce almost identical semantics. The surface area that differs is **mostly at session creation time**, not at the message-exchange level.

### Recommended Architecture: `AgentRunnerAdapter` Interface

Define reeboot's own thin abstraction over the runner. The orchestrator talks *only* to this interface:

```typescript
// src/agent-runner/interface.ts

export interface RunnerEvent {
  type: "text_delta";       delta: string;
} | {
  type: "tool_call_start";  id: string; tool: string; args: unknown;
} | {
  type: "tool_call_end";    id: string; result: unknown; isError: boolean;
} | {
  type: "message_end";      usage: { input: number; output: number };
} | {
  type: "error";            message: string;
}

export interface AgentRunner {
  /**
   * Send a prompt and stream events back.
   * Returns when the agent has finished its turn.
   */
  prompt(text: string, onEvent: (e: RunnerEvent) => void): Promise<void>;

  /** Cancel the current in-flight prompt. */
  abort(): Promise<void>;

  /** Cleanly tear down (persist state, close connections). */
  dispose(): void;
}

export interface AgentRunnerFactory {
  /** Creates a runner for a given context. Called once per session. */
  create(context: ContextConfig): Promise<AgentRunner>;
}
```

The orchestrator becomes:
```typescript
class Orchestrator {
  constructor(private runnerFactory: AgentRunnerFactory) {}

  async handleMessage(contextId: string, text: string, reply: ReplyFn) {
    const runner = await this.getOrCreateRunner(contextId);
    await runner.prompt(text, (event) => {
      // translate RunnerEvent → WS/channel message
    });
  }
}
```

### Two Concrete Implementations

#### `PiAgentRunner` (default, Phase 1)

Wraps `createAgentSession()` from `@mariozechner/pi-coding-agent`.

```typescript
// src/agent-runner/pi-runner.ts
import { createAgentSession, DefaultResourceLoader, ... } from "@mariozechner/pi-coding-agent";

export class PiAgentRunner implements AgentRunner {
  private session: AgentSession;

  static async create(context: ContextConfig): Promise<PiAgentRunner> {
    const authStorage = AuthStorage.create(`${context.workspacePath}/.pi/auth.json`);
    authStorage.setRuntimeApiKey(context.model.provider, context.model.apiKey);

    const loader = new DefaultResourceLoader({ cwd: context.workspacePath });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd: context.workspacePath,
      model: new ModelRegistry(authStorage).find(context.model.provider, context.model.id),
      tools: createCodingTools(context.workspacePath),
      resourceLoader: loader,
      sessionManager: SessionManager.open(context.sessionFile),
      authStorage,
      modelRegistry: new ModelRegistry(authStorage),
    });

    return new PiAgentRunner(session);
  }

  async prompt(text: string, onEvent: (e: RunnerEvent) => void): Promise<void> {
    return new Promise((resolve) => {
      this.session.subscribe((event) => {
        // translate pi events → RunnerEvent
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
}
```

#### `ClaudeCodeRunner` (future, when/if SDK exists)

```typescript
// src/agent-runner/claude-code-runner.ts
// When Anthropic exposes a Claude Code programmatic API:
export class ClaudeCodeRunner implements AgentRunner {
  async prompt(text: string, onEvent: (e: RunnerEvent) => void): Promise<void> {
    // Same RunnerEvent interface, different SDK underneath
  }
}
```

Switching in config:
```json5
{
  "agent": {
    "runner": "pi"  // "pi" | "claude-code" | "custom"
  }
}
```

### Complexity Assessment

| Task | Effort |
|------|--------|
| Define the interface | Trivial (30 lines) |
| Implement `PiAgentRunner` wrapping pi SDK | Low (~100 lines, mostly event translation) |
| Implement `ClaudeCodeRunner` when API exists | Low–Medium (depends on what their SDK looks like, but same translation pattern) |
| **The hidden cost: extensions/skills** | **Medium–High** |

The real coupling isn't `createAgentSession()` — it's the pi extension system. The bundled safety extensions (sandbox, confirm-destructive, protected-paths), the scheduler tool, and the skills are all pi-extension-format. If you swap to a different runner, those don't come along for free. See Section 2 for how to handle this.

### Recommendation for Phase 1

Don't build two runners on day one. Instead:
1. **Define the `AgentRunner` interface now** (it's 30 lines, zero cost)
2. **Build `PiAgentRunner` as the only implementation**
3. Keep all orchestrator code behind the interface
4. When/if a second runner is needed, the swap surface is well-contained

The investment is small; the payoff is that you never accidentally let pi-specific API calls leak into the orchestrator.

---

## 2. Extension & Skills System — How the Core Can Be Extended

### Design Philosophy

The core should be **minimal but not closed**. The goal is:
- Ship zero-friction defaults (sandbox, web-search, memory — all just work)
- Let power users drop in capabilities without touching core code
- Let the community publish capabilities as packages
- Never require a restart for skill additions (extension additions need reload)

There are three distinct extension points, and they compose:

```
┌─────────────────────────────────────────────────────────┐
│                     REEBOOT CORE                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Pi          │  │  Skills      │  │  Channel     │  │
│  │  Extensions  │  │  (SKILL.md)  │  │  Adapters    │  │
│  │  (tools,     │  │  (agent      │  │  (WhatsApp,  │  │
│  │   guards,    │  │   behaviors) │  │   Signal,    │  │
│  │   commands)  │  │              │  │   custom)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Extension Point 1: Pi Extensions (Tools + Guards + Hooks)

Pi extensions are TypeScript files that plug directly into the agent's execution loop. They can:
- Register **tools** the LLM can call (e.g. `schedule_task`, `send_message`, `browser_open`)
- **Block or modify** tool calls before execution (security guards)
- **Inject context** before each agent turn
- Subscribe to **lifecycle events** (turn start/end, session start/shutdown)
- Register **/slash commands** for the user
- Read and write **persistent state** via session entries

**Discovery order** (pi SDK handles all of this automatically):

```
~/.reeboot/extensions/         ← global, all contexts
  my-tool.ts
  browser/index.ts

~/.reeboot/contexts/<name>/.pi/extensions/   ← per-context
  scheduler-tool.ts
  my-custom-guard.ts
```

**Bundled-with-reeboot extensions** (copied from pi examples, zero custom code):

```
src/extensions/              ← shipped inside the npm package
  sandbox/                   ← OS-level sandboxing (macOS sandbox-exec, Linux bubblewrap)
  confirm-destructive.ts     ← confirms rm -rf, sudo, etc.
  protected-paths.ts         ← blocks writes to .env, *.pem, *.key
  git-checkpoint.ts          ← auto-commits workspace at each turn
  session-name.ts            ← auto-names sessions from first message
  scheduler-tool.ts          ← registers schedule_task/list_tasks/cancel_task tools
  token-meter.ts             ← tracks token usage per context → SQLite
```

These are loaded via `DefaultResourceLoader`'s `extensionFactories` or `additionalExtensionPaths` option, so they are always active for every context without user setup.

**User-installed extensions** (drop-in, no restart needed for skills, `/reload` for extensions):

```bash
# Drop a file
cp my-github-tool.ts ~/.reeboot/extensions/

# Or install a pi package
pi install npm:reeboot-browser-extension

# Or context-specific
cp my-tool.ts ~/.reeboot/contexts/work/.pi/extensions/
```

**Writing a reeboot extension** (same as writing a pi extension):

```typescript
// ~/.reeboot/extensions/notion-tool.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "notion_create_page",
    description: "Create a page in Notion",
    parameters: Type.Object({
      title: Type.String(),
      content: Type.String(),
    }),
    async execute(_id, params) {
      const notionKey = process.env.NOTION_API_KEY;
      // ... call Notion API
      return { content: [{ type: "text", text: `Created: ${pageUrl}` }], details: {} };
    },
  });
}
```

No build step, no registration — drop the file, type `/reload` in chat.

**Security model for user extensions:**

Extensions run with the same OS permissions as the reeboot process. This is intentional (they need to, to be useful). The same warning that applies to pi packages applies here: only install from trusted sources. The `protected-paths.ts` and `confirm-destructive.ts` bundled guards protect the agent's own actions; they don't sandbox extension code.

---

### Extension Point 2: Skills (Agent Behaviors)

Skills are pure Markdown — no code, no build step, no trust boundary. They teach the agent *how* to do something by providing step-by-step instructions the agent reads on demand.

**Bundled skills** (shipped with reeboot):

```
src/skills/
  web-search/SKILL.md      ← teaches agent to use web search API
  send-message/SKILL.md    ← teaches agent to send back via originating channel
```

**User-installed skills** (zero friction, no restart):

```bash
# Drop a directory
mkdir -p ~/.reeboot/skills/docker-management
cat > ~/.reeboot/skills/docker-management/SKILL.md << 'EOF'
---
name: docker-management
description: Manage Docker containers, images, and compose stacks. Use when asked about Docker.
---
# Docker Management
## List running containers
\`\`\`bash
docker ps
\`\`\`
...
EOF

# Or install a community skill package
pi install npm:reeboot-skills-devops
```

The agent sees the skill's description in its system prompt automatically. When a task matches, it loads the full SKILL.md and follows the instructions.

**Skills from the broader ecosystem** — because reeboot uses pi's skill discovery, skills published for pi or Claude Code can be used directly:

```json
// ~/.reeboot/config.json
{
  "skills": {
    "extra_paths": [
      "~/.claude/skills",    // Claude Code skills
      "~/.pi/agent/skills"   // Pi global skills
    ]
  }
}
```

Internally this maps to `DefaultResourceLoader`'s `skillsOverride`.

---

### Extension Point 3: Channel Adapters (New Input Sources)

Channel adapters are reeboot-specific (not pi SDK concepts). They let you add new ways to talk to the agent.

```typescript
// src/channels/interface.ts
export interface ChannelAdapter {
  readonly type: string;
  init(config: ChannelConfig, bus: MessageBus): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, content: MessageContent): Promise<void>;
  status(): ChannelStatus;
}
```

**Bundled adapters:** `whatsapp`, `signal`, `web`

**Custom adapter example** (Telegram, Discord, Slack, etc.):

```typescript
// ~/.reeboot/channels/telegram.ts
import type { ChannelAdapter } from "reeboot/channels";

export default class TelegramAdapter implements ChannelAdapter {
  readonly type = "telegram";
  // ...
}
```

```json
// ~/.reeboot/config.json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "...",
      "adapter": "~/.reeboot/channels/telegram.ts"
    }
  }
}
```

Channel adapters are loaded at startup, not hot-reloadable (they hold persistent WebSocket connections). Restart required.

---

### The Full Extension Ladder

Here's the complete picture of how a user can extend reeboot, from zero friction to deep integration:

```
ZERO FRICTION ──────────────────────────────── FULL CONTROL
      │                                               │
      ▼                                               ▼

  [Skills]          [Pi Extensions]         [Channel Adapters]
  SKILL.md files    TypeScript files        TypeScript classes

  No code           No build step           Requires restart
  No restart        /reload in chat         Full TS interface
  Pure markdown     Tools + hooks + guards  New input channels
  Agent reads       LLM can call tools      Bidirectional comms
  on-demand         it registers

  Perfect for:      Perfect for:            Perfect for:
  - Workflows       - API integrations      - New platforms
  - Procedures      - Security rules        - Internal tools
  - Reference docs  - New capabilities      - Webhooks
  - How-to guides   - Agent behaviors       - IoT/sensors
```

---

### Package System for Community Extensions

Because reeboot uses pi's package system underneath, community members can publish reusable packages:

```bash
# Install a community reeboot extension package
reeboot install npm:reeboot-github-tools
reeboot install npm:reeboot-notion-integration
reeboot install git:github.com/user/my-reeboot-skills

# Under the hood this is `pi install` pointed at reeboot's agent dir
```

A community package `package.json`:

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

The `pi install` mechanism (npm + git) handles downloading, dependency installation, and discovery automatically. Reeboot just needs to point `DefaultResourceLoader.agentDir` at `~/.reeboot/` and everything resolves.

---

### Proposed Config Shape for Extensions

```json5
// ~/.reeboot/config.json
{
  "extensions": {
    // Globally installed packages (applies to all contexts)
    "packages": [
      "npm:reeboot-github-tools@1.2.0",
      "git:github.com/user/my-reeboot-ext",
      "/home/user/my-local-ext"
    ],
    // Extra skill search paths beyond ~/.reeboot/skills/
    "skill_paths": [
      "~/.claude/skills",
      "~/my-company/agent-skills"
    ],
    // Core safety extensions — disable only if you know what you're doing
    "core": {
      "sandbox": true,
      "confirm_destructive": true,
      "protected_paths": true,
      "git_checkpoint": false    // opt-in
    }
  }
}
```

Per-context extension config lives in `.pi/settings.json` inside the context directory and follows the same pi package/extension format — full compatibility with the pi ecosystem.

---

### What to Clarify / Decide Before Implementation

#### Re: Runner Abstraction

1. **Do we want the interface now, or after pi?** — Recommended: define the interface now (30 lines), implement only `PiAgentRunner`. Costs nothing, future-proofs the orchestrator.

2. **Claude Code API** — At the time of writing, Anthropic has not published a standalone Claude Code programmatic SDK distinct from the Anthropic Messages API. "Claude Code" is essentially Claude Sonnet + specific system prompt + tools. If reeboot used it, `ClaudeCodeRunner` would wrap the Anthropic SDK directly, bypassing pi entirely — meaning you'd lose: model-switching, pi extensions, skills, session management, compaction. It's a significant regression in capability. The more realistic scenario is that pi continues to be updated and you switch models/providers through pi's `registerProvider` mechanism, not by replacing the runner.

3. **RPC mode as escape hatch** — pi supports a JSON-RPC subprocess mode (`runRpcMode`). This means even if you wanted to sandbox the runner in a separate process, you could spawn `pi --mode rpc` and drive it over stdio, without writing a new runner from scratch.

#### Re: Extension System

4. **Reeboot `install` command or raw `pi install`?** — Options:
   - **A**: Expose `reeboot install <package>` as a thin wrapper over pi's install, pointing at `~/.reeboot/`. Clean UX, adds ~20 lines.
   - **B**: Tell users to use `pi install` directly with `--agent-dir ~/.reeboot`. Simpler, but weird UX.
   - **Recommended: Option A** — one command, consistent brand.

5. **Per-context vs. global extensions** — The current plan puts extensions at both `~/.reeboot/extensions/` (global) and `~/.reeboot/contexts/<name>/.pi/extensions/` (per-context). This is correct and already supported by pi's `DefaultResourceLoader`. Just needs documenting clearly for users.

6. **Sandboxing extensions** — Extensions are NOT sandboxed (they run in the reeboot process). Should there be a "trusted extensions" model? E.g., only load extensions from `~/.reeboot/extensions/` automatically; require explicit config opt-in for per-context extensions. This is a security-vs-convenience tradeoff to decide.

7. **Should reeboot publish a `reeboot/channels` package** so external channel adapter authors get TypeScript types? Minor but nice for ecosystem.

---

### Summary: Implementation Path for Phase 1

**Week 2 additions** (alongside agent runner):
```
src/
  agent-runner/
    interface.ts       ← AgentRunner + AgentRunnerFactory interfaces (30 lines)
    pi-runner.ts       ← PiAgentRunner: wraps createAgentSession()
    index.ts           ← factory that reads config.agent.runner and instantiates

  channels/
    interface.ts       ← ChannelAdapter interface (already in plan)

extensions/            ← bundled pi extensions (already in plan)
  sandbox/
  confirm-destructive.ts
  protected-paths.ts
  scheduler-tool.ts
  token-meter.ts

skills/                ← bundled skills (already in plan)
  web-search/SKILL.md
  send-message/SKILL.md
```

**What this buys you at launch:**
- Clean swap boundary for future runner backends
- Full pi extension ecosystem compatibility (drop `.ts` file → `/reload`)
- Full pi skill ecosystem compatibility (drop SKILL.md → instant)
- Pi package system for community extensions (`reeboot install npm:...`)
- Per-context isolated extension sets
- No new infrastructure invented — leverage everything pi already built
