# Findings: NanoClaw — Skill-Based Integration Model

**Research Date:** 2026-03-20
**Source Repo:** https://github.com/qwibitai/nanoclaw (24,531 stars, 7,236 forks)
**Homepage:** https://nanoclaw.dev
**License:** MIT
**Language:** TypeScript
**Created:** 2026-01-31 · **Last pushed:** 2026-03-19

---

## Key Findings

- NanoClaw is a **real, actively-maintained project** with significant traction (~24k stars in ~7 weeks of existence — extremely fast-growing)
- It is explicitly positioned as a **lightweight alternative to OpenClaw**, built for a single user, prioritizing security via container isolation over application-level permission checks
- Its "skill system" is **Claude Code skills** — SKILL.md files that guide Claude Code to apply git branch merges to the user's fork; not a standalone skill runtime
- Integrations (Telegram, Gmail, Slack, Discord, WhatsApp) are **separate git branches** merged into the user's fork — code becomes part of the project, not plugin packages loaded at runtime
- It uses the **Anthropic Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) as its agent runtime, running Claude Code inside Linux containers
- **MCP is supported** but the base project ships with empty MCP config (`"mcpServers": {}`) — MCP servers are added inside containers as needed by skills
- The core codebase is deliberately **tiny**: ~30 TypeScript files, 4 production dependencies (SQLite, cron-parser, pino, yaml, zod)

---

## What NanoClaw Is (Overview)

NanoClaw is a self-hosted, personal AI assistant framework built around the Anthropic Claude Agent SDK. The author's stated motivation:

> "OpenClaw has nearly half a million lines of code, 53 config files, and 70+ dependencies. Its security is at the application level (allowlists, pairing codes) rather than true OS-level isolation. Everything runs in one Node process with shared memory. NanoClaw provides that same core functionality, but in a codebase small enough to understand: one process and a handful of files."

**Core architecture in one line:**
```
Channels → SQLite → Polling loop → Container (Claude Agent SDK) → Response
```

The orchestrator (single Node.js process) polls SQLite for messages from any configured channel, spawns a Linux container per agent invocation running the Claude Agent SDK, and routes responses back through the originating channel.

**Key design principles:**
1. **Small enough to understand** — one process, ~30 files, no microservices
2. **Secure by isolation** — agents run in containers (Apple Container / Docker), not behind permission checks
3. **Built for the individual user** — fork it, customize it with Claude Code, own your version
4. **Skills over features** — integrations added via Claude Code skill commands, not built-in config
5. **AI-native** — no GUI, no config wizard; Claude Code is the interface for everything
6. **Best harness, best model** — uses Claude Code + Anthropic Agent SDK directly

---

## Skill Architecture — How Integrations Are Defined

NanoClaw's "skills" are **Claude Code SKILL.md files** — not a standalone skill engine or plugin runtime. They leverage Anthropic's Claude Code skills system.

### Two categories of skills

**Operational skills** (live on `main` in `.claude/skills/`):
- `/setup`, `/debug`, `/update-nanoclaw`, `/customize`, `/update-skills`
- Instruction-only SKILL.md files; no code changes
- Available immediately to any user who clones the repo

**Feature skills** (live in the marketplace repo `qwibitai/nanoclaw-skills`):
- `/add-discord`, `/add-telegram`, `/add-slack`, `/add-gmail`, `/add-whatsapp`
- Each has a SKILL.md with setup instructions whose **Step 1 is always a git branch merge**
- Available after installing the marketplace plugin

### How a skill works (e.g., `/add-telegram`)

The SKILL.md tells Claude Code to:
1. Check if already applied (does `src/channels/telegram.ts` exist?)
2. Add a git remote pointing to the skill's source repo
3. Run `git fetch telegram main && git merge telegram/main`
4. The merge adds: channel TypeScript file, unit tests, barrel import, npm dependency, `.env.example` additions
5. Run `npm install && npm run build && npx vitest run` to validate
6. Walk through interactive setup (create bot token, configure `.env`, etc.)

**The "skill" is a git branch, not a plugin.** After applying, the code is literally part of the user's fork.

### Current skill directory

```
.claude/skills/
├── add-compact/
├── add-discord/
├── add-gmail/
├── add-image-vision/
├── add-ollama-tool/
├── add-parallel/
├── add-pdf-reader/
├── add-reactions/
├── add-slack/
├── add-telegram/
├── add-telegram-swarm/
├── add-voice-transcription/
├── add-whatsapp/
├── convert-to-apple-container/
├── customize/
├── debug/
├── setup/
├── update-nanoclaw/
├── update-skills/
├── use-local-whisper/
└── x-integration/
```

### Skills-as-branches model (detailed)

The upstream repo (`qwibitai/nanoclaw`) maintains:
- `main` — core NanoClaw (no channel code)
- `skill/whatsapp`, `skill/telegram`, `skill/slack`, `skill/discord`, `skill/gmail` — each branch contains the full delta for that integration
- Skill branches are **kept merged-forward with main** by CI (GitHub Action using Claude Haiku to resolve conflicts)
- Skill dependencies expressed in git: `skill/telegram-swarm` branches from `skill/telegram`, so merging swarm also gets telegram

**Applying multiple skills:**
```bash
git merge upstream/skill/discord
git merge upstream/skill/telegram
# Git handles composition; Claude resolves conflicts
```

**Updating core:**
```bash
git fetch upstream main
git merge upstream/main
# Skill changes already in user's history — just works
```

**Contributing a skill:**
1. Fork nanoclaw, branch from `main`, make code changes, open a PR
2. Maintainer creates `skill/<name>` branch from the PR
3. CI keeps skill branch merged-forward with main forever

---

## External Service Integrations (Gmail, Calendar, etc.)

### Available integrations

| Integration | Type | How Added |
|-------------|------|-----------|
| WhatsApp | Full channel | `/add-whatsapp` (merges `skill/whatsapp`) |
| Telegram | Full channel | `/add-telegram` (merges `skill/telegram`) |
| Slack | Full channel | `/add-slack` (merges `skill/slack`) |
| Discord | Full channel | `/add-discord` (merges `skill/discord`) |
| Gmail | Channel or tool | `/add-gmail` (merges `skill/gmail`) |
| Voice transcription | Tool (Whisper) | `/add-voice-transcription` |
| Image vision | Tool | `/add-image-vision` |
| PDF reader | Tool | `/add-pdf-reader` |
| Ollama | MCP server | `/add-ollama-tool` |
| Local Whisper | Tool | `/use-local-whisper` |
| Agent swarms | Capability | `/add-telegram-swarm` etc. |

### Channel interface (all integrations implement this)

```typescript
interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
  syncGroups?(force: boolean): Promise<void>;
}
```

### Self-registration pattern

Each channel file calls `registerChannel()` at module load time. The barrel file `src/channels/index.ts` imports all channel modules, triggering registration. The orchestrator connects whichever ones return a valid instance (i.e., have credentials). **No credentials = channel silently skipped.**

### Gmail specifically

Gmail skill can be installed in two modes:
- **Tool mode**: Agent gets Gmail tools (read, send, search, draft) but doesn't monitor inbox
- **Channel mode**: Gmail acts like WhatsApp/Telegram — incoming emails trigger the agent

The Gmail skill merges in: `GmailChannel` TypeScript class, GCP OAuth setup, Gmail MCP server (`@gongrzhe/server-gmail-autoauth-mcp`), and `mcp__gmail__*` allowed tools inside the container runner.

**No Calendar integration found** — not currently in the skill list. Would need to be added as a community skill.

---

## MCP Support

NanoClaw has explicit MCP support, but it's **container-side, not host-side**.

**Base config** (`.mcp.json` on host):
```json
{ "mcpServers": {} }
```

The host orchestrator has no MCP servers. MCP servers run **inside the Linux container** alongside the Claude Agent SDK. Skills can add MCP servers to the container runner configuration.

Example from Gmail skill:
- Adds `@gongrzhe/server-gmail-autoauth-mcp` as an MCP server inside the container
- Exposes `mcp__gmail__*` tools to the agent

Example from Ollama skill:
- Adds Ollama MCP server for local model access inside the container

**The approach:** MCP is a transport mechanism used within containers for tool access. The core architecture doesn't depend on MCP — it uses the Claude Agent SDK's native tool system. MCP is addable per-skill.

**No marketplace of MCP servers** like in OpenClaw. MCP servers are added per-integration by specific skills.

---

## Comparison to OpenClaw

| Dimension | NanoClaw | OpenClaw |
|-----------|----------|----------|
| Codebase size | ~30 TS files, 4 prod deps | ~500k lines, 53 config files, 70+ deps |
| Security model | Container/VM isolation (OS-level) | Application-level (allowlists, pairing codes) |
| Process model | Single Node.js process | Multiple services / microservices |
| Integration model | Skills as git branches | Built-in feature flags / config |
| Customization | Fork + modify code | Configuration files |
| Setup | Claude Code guides everything | Setup wizard / config files |
| Target user | Individual, technical | Broader audience |
| Multi-user | No (single user, groups = conversations) | Yes |
| Channel discovery | Self-registration at startup | Configuration-driven |
| Agent runtime | Anthropic Claude Agent SDK (Claude Code) | Not Claude-specific |
| Memory | Per-group CLAUDE.md + SQLite | Feature-rich memory system |
| Scheduling | Built-in task scheduler | Built-in |
| MCP | Supported inside containers | Integrated marketplace |
| Stars (as of research) | ~24.5k (7 weeks old) | Established project |
| License | MIT | (varies) |

**Key philosophical difference:** OpenClaw is a *product* that tries to support all users. NanoClaw is a *codebase* that each user forks and makes their own. "Instead of becoming bloatware, NanoClaw is designed to be bespoke."

---

## Fit for Reeboot

### Strong alignment points

1. **Architecture philosophy**: NanoClaw's "single process, small codebase, container isolation" maps well to reeboot's self-hosted, privacy-first goals
2. **Skills-as-branches model**: The git branch approach to integrations is clever — users get exactly the code they need, no dead weight. Reeboot could adopt this for its integration model
3. **Channel self-registration**: The `registerChannel()` factory pattern is a clean way to make integrations optional without if-chains in the core
4. **Container isolation for security**: Running agents in containers is the right security model for a personal assistant with broad permissions
5. **MCP inside containers**: Using MCP as a tool protocol within the sandbox (not as the primary architecture) is a reasonable approach

### Key differences / concerns for reeboot

1. **Tightly Claude-coupled**: NanoClaw uses `@anthropic-ai/claude-agent-sdk` (essentially Claude Code) as its agent runtime. Reeboot aims to be model-agnostic. NanoClaw does allow any Anthropic API-compatible endpoint, but the SDK itself is Claude Code.
2. **Skills require Claude Code**: The skill system assumes Claude Code as the setup interface. Reeboot needs a setup system that doesn't require Claude Code.
3. **No Calendar integration**: NanoClaw has Gmail but not Google Calendar, Notion, GitHub etc. These would need community skills.
4. **Fork model is personal**: NanoClaw's "fork and customize" model works for technical individuals but may not suit reeboot's goal of being installable by less-technical users.
5. **No structured task/memory system beyond CLAUDE.md**: Memory is per-group markdown files. Reeboot likely needs richer structured memory.

### What reeboot should borrow

- **Self-registration channel pattern** — clean, extensible, zero coupling
- **Skills-as-git-branches** — the most elegant integration distribution model found in research
- **Container isolation for agent execution** — the right security primitive
- **MCP as container-side tool protocol** — don't expose MCP on the host, run it in the sandbox
- **"No config files, modify code" philosophy** — resist configuration sprawl
- **Per-group isolated memory (CLAUDE.md)** — group/conversation scoped context is the right granularity

### What reeboot should do differently

- Support multiple model providers (not just Anthropic)
- Offer a setup path that doesn't require Claude Code
- Build richer structured memory (not just markdown files)
- Include Calendar/GitHub/Notion integrations in the official skill set
- Consider a more user-friendly onboarding for non-technical users

---

## Sources

- **GitHub Repository**: https://github.com/qwibitai/nanoclaw
  - README.md — overview, philosophy, quick start, architecture
  - docs/SPEC.md — full architecture specification, channel system, MCP, container details
  - docs/skills-as-branches.md — complete skills distribution model documentation
  - docs/SECURITY.md — security model, container isolation, credential proxy
  - docs/SDK_DEEP_DIVE.md — Anthropic Claude Agent SDK internals
  - `.claude/skills/add-gmail/SKILL.md` — Gmail skill implementation
  - `.claude/skills/add-telegram/SKILL.md` — Telegram skill implementation
  - `package.json` — dependency list (4 production deps)
  - `.mcp.json` — MCP configuration (empty base)
- **GitHub API**: https://api.github.com/repos/qwibitai/nanoclaw — repo metadata
- **NanoClaw Homepage**: https://nanoclaw.dev (referenced but not fetched — 403 on SearXNG)

