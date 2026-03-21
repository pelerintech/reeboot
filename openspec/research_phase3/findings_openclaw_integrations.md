# Findings: OpenClaw Integration Architecture

**Research Date:** 2026-03-20  
**Research Question:** How does OpenClaw handle third-party integrations (Gmail, Calendar, GitHub, Notion)? What is its plugin/extension model? Does it use MCP? How does a user add a new integration?

---

## Key Findings

1. **OpenClaw does NOT bundle Gmail, Calendar, or Notion as first-class integrations.** Instead it uses a **Skills** system — SKILL.md files that teach the agent to call external CLIs or APIs using the model's code execution capabilities. Gmail is handled via `gog` (a separate Google Workspace CLI) and webhook triggers, not a built-in OAuth adapter.

2. **OpenClaw's integration model is: Skills + Plugins + MCP = three separate layers.** Skills are prompt instructions, Plugins are in-process runtime modules, and MCP adds external tool servers. They compose but are distinct.

3. **The `ClawHub` skills registry (clawhub.ai) hosts 13,729+ community skills** as of Feb 2026, served by a `clawhub` CLI tool (`clawhub install <slug>`). This is the primary discovery/distribution channel for integrations.

4. **OpenClaw supports MCP (Model Context Protocol) for running external tool servers.** MCP servers are configured in `mcp.servers` and exposed to the agent as normal tools. Only stdio transport is currently supported (not HTTP/SSE). The official `@modelcontextprotocol/sdk` is used.

5. **The Plugin system is for in-process runtime code** — channels, model providers, memory systems, speech providers. Channel plugins (Discord, Telegram, Slack, WhatsApp, etc.) are bundled directly in source at `extensions/`. Optional channels (Matrix, Teams, Nostr, Zalo, Voice Call) are published as `@openclaw/<plugin>` npm packages and installed on demand.

6. **GitHub integration = `gh` CLI skill.** The bundled `skills/github/SKILL.md` teaches the agent to use the standard `gh` CLI. There is no custom OAuth adapter — users configure `gh auth login` once and the agent then uses it via `system.run`.

7. **Gmail = `gog` CLI skill + webhook push.** The `gog` (Google OAuth CLI, `gogcli.sh`) skill wraps Gmail/Calendar/Drive/Contacts/Sheets/Docs via OAuth. Gmail real-time triggers use Gmail Pub/Sub → webhook → OpenClaw Gateway, wired by the `openclaw webhooks gmail setup` wizard. This requires `gcloud`, `gog`, and `tailscale` (for the Pub/Sub push endpoint).

8. **Notion = API key + curl-based skill.** The `skills/notion/SKILL.md` teaches the agent to call the Notion REST API directly using `curl` with a `NOTION_API_KEY`. No separate auth abstraction layer — it's just env variable injection.

9. **For compatible external bundles**, OpenClaw can read Codex-style, Claude-style, and Cursor-style plugin manifests (`.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`), extracting MCP server configs from them. This is a cross-compatibility bridge, not a first-class marketplace.

---

## How OpenClaw Bundles Integrations (Gmail, Calendar, GitHub, Notion)

### Not a Traditional Integration Layer

OpenClaw does **not** have an OAuth token vault or a "Composio-style" integration manager. There is no per-user credential store for third-party apps baked into the core. Instead, integrations work through three mechanisms:

### 1. Skills (primary method)

Skills are directories containing a `SKILL.md` file. The SKILL.md file contains:
- YAML frontmatter with `name`, `description`, and `metadata`
- Markdown instructions for the agent on how to use a tool or API
- Dependency declarations (`requires.bins`, `requires.env`, `requires.config`)
- Install hints (`install` array with brew/apt/npm/go/download entries)

**Concrete examples:**

**GitHub** (`skills/github/SKILL.md`):
```yaml
name: github
description: "GitHub operations via `gh` CLI: issues, PRs, CI runs, code review, API queries."
metadata:
  openclaw:
    emoji: "🐙"
    requires:
      bins: ["gh"]
    install:
      - id: brew, kind: brew, formula: gh
      - id: apt, kind: apt, package: gh
```
The agent uses `gh` CLI commands. Auth is handled externally via `gh auth login`.

**Gmail + Google Calendar** (`skills/gog/SKILL.md`):
```yaml
name: gog
description: "Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs."
metadata:
  openclaw:
    emoji: "🎮"
    requires:
      bins: ["gog"]
    install:
      - id: brew, kind: brew, formula: steipete/tap/gogcli
```
The agent uses `gog gmail search`, `gog calendar events`, etc. Auth setup is one-time via `gog auth add <account> --services gmail,calendar`.

**Notion** (`skills/notion/SKILL.md`):
```yaml
name: notion
description: "Notion API for creating and managing pages, databases, and blocks."
metadata:
  openclaw:
    requires:
      env: ["NOTION_API_KEY"]
    primaryEnv: "NOTION_API_KEY"
```
No CLI — just `curl` + REST API. The API key is injected via `skills.entries.notion.apiKey` in config.

### 2. Gmail Pub/Sub Webhooks (real-time triggers)

For Gmail push notifications (new email arrives → agent responds), OpenClaw uses a dedicated pipeline:

```
Gmail → Google Pub/Sub → gog gmail watch serve → OpenClaw /hooks/gmail → Agent
```

Setup: `openclaw webhooks gmail setup --account user@gmail.com`  
This wizard installs deps, creates GCP topic/subscription, starts `gog gmail watch serve`, and uses Tailscale Funnel as the public HTTPS endpoint. Configured under `hooks.presets: ["gmail"]`.

### 3. Android Node: Native Calendar Access

The Android node app exposes `CalendarHandler.kt` to let the agent read the device's native calendar. This is an on-device native integration only available when an Android phone is connected as a node.

### Skills Loading Precedence

```
<workspace>/skills  (highest)
~/.openclaw/skills  (managed/local)
bundled skills      (shipped with npm package)
```

Bundled skills at install time (~40 skills):
- `1password`, `apple-notes`, `apple-reminders`, `bear-notes`
- `canvas`, `clawhub`, `coding-agent`, `discord`, `gemini`
- `gh-issues`, `github`, `gog`, `goplaces`, `healthcheck`
- `himalaya`, `imsg`, `mcporter`, `model-usage`, `notion`
- `obsidian`, `openai-image-gen`, `openai-whisper`, `oracle`
- `peekaboo`, `sag`, `session-logs`, `skill-creator`, `slack`
- `spotify-player`, `summarize`, `things-mac`, `tmux`, `trello`
- `voice-call`, `wacli`, `weather`, `xurl`, etc.

---

## Plugin/Extension SDK — How Users Add New Integrations

### Three Extension Points

**A. Skills** (easiest, for prompt-level integrations):
- Create a folder with `SKILL.md`
- Drop in `~/.openclaw/skills/<skill-name>/` or workspace `skills/`
- The agent immediately picks it up in the next session
- Distribute via `clawhub publish` → `clawhub install <slug>`

**B. Native Plugins** (for runtime capabilities — channels, providers):
- TypeScript module using `openclaw/plugin-sdk/*` subpaths
- Must export a `register(api)` function or `{ id, register }` object
- `openclaw.plugin.json` manifest declares capabilities
- Install with `openclaw plugins install @npm-org/my-plugin` or local path
- Capabilities: `registerChannel`, `registerProvider`, `registerTool`, `registerHook`, `registerHttpRoute`, `registerCommand`, `registerService`, `registerSpeechProvider`, `registerWebSearchProvider`, `registerContextEngine`

**Plugin manifest** (`openclaw.plugin.json`):
```json
{
  "id": "my-plugin",
  "channels": ["my-channel"],
  "providers": [],
  "skills": ["./skills/my-skill"],
  "name": "My Plugin",
  "description": "Adds My Channel"
}
```

**Plugin SDK subpaths** (enforced by lint):
- `openclaw/plugin-sdk/core` — entry definitions, base types
- `openclaw/plugin-sdk/channel-setup` — setup wizards
- `openclaw/plugin-sdk/channel-pairing` — DM pairing
- `openclaw/plugin-sdk/channel-reply-pipeline` — reply wiring
- `openclaw/plugin-sdk/provider-oauth` — OAuth PKCE helpers
- `openclaw/plugin-sdk/runtime-store` — persistent storage
- `openclaw/plugin-sdk/testing` — test utilities

**Example plugin entry:**
```typescript
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";

export default defineChannelPluginEntry({
  id: "my-channel",
  name: "My Channel",
  description: "Connects OpenClaw to My Channel",
  plugin: { /* ChannelPlugin implementation */ },
});
```

**C. Compatible Bundles** (for external tool ecosystems):
- Codex-style: `.codex-plugin/plugin.json`
- Claude-style: `.claude-plugin/plugin.json`
- Cursor-style: `.cursor-plugin/plugin.json`
- These are primarily used to bridge MCP server configs from other agent environments

### User Flow for Adding an Integration

1. **Discover:** Browse `clawhub.ai` or run `clawhub search "calendar"`
2. **Install skill:** `clawhub install gog` (puts skill in `./skills/gog/`)
3. **Install binary dependency:** OpenClaw auto-detects `requires.bins` and shows install button in macOS Skills UI, or user runs `brew install steipete/tap/gogcli`
4. **Configure auth:** `gog auth add me@gmail.com --services gmail,calendar`
5. **Set API key (if needed):** Add to `~/.openclaw/openclaw.json`:
   ```json
   { "skills": { "entries": { "notion": { "enabled": true, "apiKey": "ntn_xxx" } } } }
   ```
6. **Start new session:** OpenClaw picks up the skill in the next session

---

## MCP Support

### Current MCP Support in OpenClaw

OpenClaw has **first-class MCP client support** — it can consume any stdio MCP server as a source of tools for the agent.

**How it works:**
1. Configure MCP servers in `~/.openclaw/openclaw.json`:
   ```json
   { "mcp": { "servers": { "my-server": { "command": "node", "args": ["./server.js"] } } } }
   ```
2. On session start, OpenClaw launches each configured stdio MCP server as a subprocess via `@modelcontextprotocol/sdk`
3. It calls `list_tools` to discover available tools
4. MCP tools are exposed to the agent identically to native OpenClaw tools
5. When the agent calls a MCP tool, OpenClaw calls `call_tool` on the subprocess and returns the result

**Limitation:** Only stdio transport is supported. HTTP/SSE MCP servers are not yet supported.

**Bundle MCP Integration:** Plugins installed as compatible bundles (Claude/Codex/Cursor format) can declare MCP server configs in their `.mcp.json` file. OpenClaw merges these into the MCP server set automatically when the bundle is enabled.

**`mcporter` skill:** A bundled skill that lets the agent directly manage and call MCP servers via the `mcporter` CLI (`mcporter list`, `mcporter call <server.tool> args`). This enables the agent to dynamically discover and use any MCP server.

**What OpenClaw does NOT have:**
- An MCP *server* endpoint (it is an MCP client, not server)
- Remote/HTTP MCP server support
- An MCP marketplace or registry integration
- Auto-installation of MCP servers

---

## Comparison to reeboot's Current Approach

| Aspect | OpenClaw | reeboot (current) |
|--------|----------|-------------------|
| **Integration layer** | Skills (SKILL.md) + CLI wrapping | Not yet built |
| **Channel adapters** | Bundled in-source `extensions/` + npm packages | Discord, WhatsApp, WebChat (same pattern) |
| **Gmail** | `gog` CLI skill + Pub/Sub webhook | Not implemented |
| **Calendar** | `gog` CLI skill + Android native node | Not implemented |
| **GitHub** | `gh` CLI skill | Not implemented |
| **Notion** | `NOTION_API_KEY` + curl skill | Not implemented |
| **Auth management** | Per-tool CLIs (gh, gog) + env vars | Not implemented |
| **MCP support** | Yes (stdio only, as MCP client) | Not implemented |
| **Integration marketplace** | ClawHub (clawhub.ai) — 13,729+ skills | Not implemented |
| **Plugin SDK** | `openclaw/plugin-sdk/*` subpaths | Not yet (proto stage) |
| **Plugin install** | `openclaw plugins install @openclaw/pkg` | Not yet |

**Key observation:** reeboot already mirrors OpenClaw's channel adapter pattern. OpenClaw solves integrations by wrapping existing CLI tools rather than building OAuth infrastructure. This is a practical shortcut but creates user friction (users must separately install `gh`, `gog`, configure OAuth, etc.).

---

## What reeboot Could Learn or Adopt

### 1. The SKILL.md Pattern Is Simple and Powerful
OpenClaw's skill system is just structured Markdown + YAML frontmatter. A SKILL.md teaches the agent how to use an external tool. This is essentially a "persona prompt" for a specific domain. **reeboot could adopt this pattern immediately** — it's zero infra, just files that get injected into the system prompt.

**Adopt:** Create a `skills/` directory structure with SKILL.md files for each integration. The agent reads them and knows how to use tools. Start with: `gh` for GitHub, `gog`/`curl` for Google APIs, `NOTION_API_KEY` for Notion.

### 2. Wrap Existing CLIs Instead of Reinventing OAuth
OpenClaw's insight: don't build OAuth infrastructure, wrap CLIs that already handle it. The `gh` CLI handles GitHub OAuth. The `gog` CLI handles Google OAuth. This dramatically reduces reeboot's initial build scope.

**Adopt:** For v1, tell users to `gh auth login` and `gog auth add`. The agent then just invokes these CLIs.

### 3. MCP as the Universal Tool Extension Point
OpenClaw uses `@modelcontextprotocol/sdk` to consume any stdio MCP server. Since the MCP ecosystem has hundreds of servers for Gmail, Calendar, GitHub, Notion, Slack, etc., enabling MCP support instantly gives reeboot access to the entire ecosystem.

**Adopt:** Add `mcp.servers` config support. When reeboot starts an agent session, launch configured MCP servers as subprocesses and expose their tools. This is ~200 lines of integration code.

### 4. ClawHub Is a Moat — reeboot Doesn't Need to Build This
Building a skills registry at OpenClaw's scale (13,729 skills, vector search, versioning, CLI) is substantial infrastructure. reeboot should **not** build this initially. Instead:
- Start with bundled skills (shipped in the reeboot npm package)
- Allow local `skills/` directory overrides (same pattern)
- Later: either contribute to ClawHub or build a minimal registry

### 5. Plugin Architecture for Extensibility
OpenClaw's plugin API (`register(api)`) lets plugins add channels, tools, providers, hooks, HTTP routes, and CLI commands. reeboot's channel adapter interface already resembles this. Formalizing a plugin API (even minimal) would enable community extensions.

**Adopt:** Define a `IChannelAdapter` interface (already have this) + a `ITool` interface for tools. Allow third parties to add both. Don't build a full plugin marketplace yet.

### 6. What NOT to Do
- **Don't build a plugin marketplace** (see ChatGPT plugins failure — OpenClaw learned this and uses ClawHub for skills, not plugins)
- **Don't bundle per-user OAuth flows** (Composio showed the complexity; gog/gh sidestep this)
- **Don't require reeboot to know about Gmail/GitHub/Notion** — let the agent use CLIs that know about those services

---

## Sources

- **OpenClaw GitHub repo:** https://github.com/openclaw/openclaw (326K stars, MIT, TypeScript)
- **OpenClaw README:** https://raw.githubusercontent.com/openclaw/openclaw/main/README.md
- **Skills documentation:** https://docs.openclaw.ai/tools/skills
- **ClawHub documentation:** https://docs.openclaw.ai/tools/clawhub
- **Plugin documentation:** https://docs.openclaw.ai/tools/plugin (raw: `/docs/tools/plugin.md`)
- **Building Extensions:** https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/building-extensions.md
- **Plugin Architecture:** https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/architecture.md
- **Gmail Pub/Sub docs:** https://docs.openclaw.ai/automation/gmail-pubsub
- **Bundled channel plugins list:** https://raw.githubusercontent.com/openclaw/openclaw/main/src/channels/plugins/bundled.ts
- **Plugin manifest format:** https://raw.githubusercontent.com/openclaw/openclaw/main/src/plugins/manifest.ts
- **MCP types config:** https://raw.githubusercontent.com/openclaw/openclaw/main/src/config/types.mcp.ts
- **MCP tool loading:** https://raw.githubusercontent.com/openclaw/openclaw/main/src/agents/pi-bundle-mcp-tools.ts
- **Bundled skills list (skills/):** https://api.github.com/repos/openclaw/openclaw/git/trees/main (recursive)
- **GitHub skill SKILL.md:** https://raw.githubusercontent.com/openclaw/openclaw/main/skills/github/SKILL.md
- **Notion skill SKILL.md:** https://raw.githubusercontent.com/openclaw/openclaw/main/skills/notion/SKILL.md
- **gog skill SKILL.md:** https://raw.githubusercontent.com/openclaw/openclaw/main/skills/gog/SKILL.md
- **Awesome OpenClaw Skills (VoltAgent):** https://github.com/VoltAgent/awesome-openclaw-skills (40K stars)
- **GitHub API repo search:** https://api.github.com/search/repositories?q=openclaw&sort=stars
