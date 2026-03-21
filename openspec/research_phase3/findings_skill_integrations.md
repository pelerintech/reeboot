# Findings: Skill-Based Integration Patterns

**Research Date:** 2026-03-20
**Research Question:** How do different AI agent frameworks define and load "skills"? How do skills integrate with external services? Is a skill (possibly with a CLI backend) the right integration model for Gmail/Calendar/GitHub in a self-hosted agent like reeboot?

---

## Key Findings

1. **Skills are a standardized, cross-framework abstraction** — The [Agent Skills standard](https://agentskills.io/specification) has been adopted by pi, Claude Code, Codex CLI, Amp, Droid, and others. It defines a simple SKILL.md format with YAML frontmatter that any harness can load.

2. **The real-world model for API integrations in pi is: skill + CLI tool (not MCP)** — The [pi-skills](https://github.com/badlogic/pi-skills) repository demonstrates this conclusively: Gmail, Google Calendar, and Google Drive are each a pi skill that wraps a dedicated CLI (`gmcli`, `gccli`, `gdcli`). No MCP involved.

3. **OAuth lives at the CLI layer, not the skill layer** — The CLI tool handles OAuth credentials, token storage, and refresh. The skill's SKILL.md simply documents how to set up the CLI and which bash commands to invoke. The agent calls those bash commands via the built-in `bash` tool.

4. **Skills follow progressive disclosure** — Only the skill description enters the context at startup. The full SKILL.md is loaded on-demand when the task matches. This is context-efficient and avoids the "too many tools" problem that plagues large MCP servers.

5. **ElizaOS uses a code-based plugin architecture** — Fundamentally different from pi's skill approach. ElizaOS plugins are TypeScript packages registering Actions, Providers, Evaluators, and Services into an agent runtime. Much heavier, but more powerful for always-on integrations.

6. **pi's creator explicitly argues against MCP** — In a widely-read blog post ("What if you don't need MCP at all?"), Mario Zechner (pi's author) argues that CLI tools + bash are composable, context-efficient, and easier to extend than MCP servers — which consume significant tokens and aren't composable.

7. **For reeboot: skills + CLIs is the native fit** — Given reeboot runs on pi, skills + CLI backends (each handling their own OAuth) is the idiomatic approach. MCP is an option for third-party integrations that already exist as MCP servers, but should not be the primary model.

---

## How pi Skills Work (From Official Docs)

### The Agent Skills Standard

Pi implements the [Agent Skills standard](https://agentskills.io/specification) — a simple, open format:

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Helper scripts
│   └── process.sh
└── references/           # Detailed docs loaded on-demand
    └── api-reference.md
```

**SKILL.md format:**
```markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---

# My Skill

## Setup
Run once: `npm install`

## Usage
`./scripts/process.sh <input>`
```

### Load Mechanism

1. At startup, pi scans skill directories and reads **only** name + description from each SKILL.md
2. All skill descriptions appear in the system prompt in XML format
3. When a task matches a skill, the agent uses the `read` tool to load the full SKILL.md
4. The agent follows the instructions, calling bash commands or scripts from the skill directory
5. Skills can be forced with `/skill:name` command

### Discovery Locations (priority order)
- Global: `~/.pi/agent/skills/`, `~/.agents/skills/`
- Project: `.pi/skills/`, `.agents/skills/` (walks up to git root)
- Packages: `skills/` dir or `pi.skills` in package.json
- Settings: `skills` array in settings.json
- CLI: `--skill <path>`

### Cross-Harness Compatibility
The Agent Skills standard is implemented by pi, Claude Code, Codex CLI, Amp, and Droid. A skill written once works across all these harnesses (with minor differences in discovery depth).

### Key Design Principles
- **Progressive disclosure**: only descriptions are always in context, full instructions load on-demand
- **No new tool types**: skills use the harness's existing tools (read, bash, write, etc.)
- **Portable**: skills are markdown files, not code — easily version-controlled and shared
- **Composable**: skills can reference other files, scripts, and binaries

---

## Real-World Example: Gmail/Calendar/Drive as Pi Skills

The [pi-skills repo](https://github.com/badlogic/pi-skills) by pi's creator shows exactly how Google API integrations work in practice.

### Pattern: Skill → CLI Tool → OAuth → API

Each integration = a dedicated npm CLI + a thin skill wrapper:

| Service | Skill | CLI | NPM Package |
|---------|-------|-----|-------------|
| Gmail | `gmcli` | `gmcli` | `@mariozechner/gmcli` |
| Google Calendar | `gccli` | `gccli` | `@mariozechner/gccli` |
| Google Drive | `gdcli` | `gdcli` | `@mariozechner/gdcli` |

### Gmail Skill (gmcli) Structure

```markdown
---
name: gmcli
description: Gmail CLI for searching emails, reading threads, sending messages, managing drafts, and handling labels/attachments.
---

# Gmail CLI

## Installation
npm install -g @mariozechner/gmcli

## Setup
### Google Cloud Console (one-time)
1. Create a project, enable Gmail API
2. Set OAuth branding, add test users
3. Create OAuth client (Desktop app), download JSON
4. gmcli accounts credentials ~/path/to/credentials.json
5. gmcli accounts add <email>

## Usage
- gmcli <email> search "<query>"
- gmcli <email> thread <threadId>
- gmcli <email> send --to <emails> --subject <s> --body <b>
- gmcli <email> labels list
- gmcli <email> drafts list

## Data Storage
- ~/.gmcli/credentials.json  — OAuth client credentials
- ~/.gmcli/accounts.json     — Account tokens
- ~/.gmcli/attachments/      — Downloaded attachments
```

### How OAuth Works in This Pattern

1. **Credentials setup** (one-time): User downloads OAuth client JSON from Google Cloud Console, provides path to CLI (`gmcli accounts credentials ~/creds.json`)
2. **Account addition** (one-time per email): `gmcli accounts add user@gmail.com` — CLI launches browser OAuth flow, stores refresh token in `~/.gmcli/accounts.json`
3. **Subsequent calls** (automatic): CLI reads stored refresh token, requests new access token when needed — user never sees OAuth again
4. **Headless mode**: `--manual` flag for `accounts add` gives a URL to visit manually — works in SSH/headless environments

The **skill itself contains no auth code** — it just documents how to configure the CLI. The CLI owns the auth lifecycle.

### Why CLI Over MCP for These Integrations

From pi's creator ("What if you don't need MCP at all?"):
- MCP servers need to cover all bases → many tools → large token footprint (Playwright MCP: 13.7k tokens = 6.8% of context)
- CLI tools + bash are composable: output can be piped, processed, saved to disk without going through agent context
- CLIs are easy to extend: write a new flag, add it to the SKILL.md
- CLIs work in all contexts (tmux, background tasks, piping)
- Skills keep token usage minimal: only the description is always present

---

## ElizaOS Skills/Plugins

ElizaOS uses a fundamentally different, heavier **plugin architecture** — not compatible with the Agent Skills standard.

### Plugin Interface (TypeScript)

An ElizaOS plugin is a TypeScript object conforming to the `Plugin` interface:

```typescript
const myPlugin: Plugin = {
  name: 'my-plugin',
  description: 'What it does',
  
  // Actions: things the agent can DO
  actions: [helloWorldAction],
  
  // Providers: context/state injected into every response
  providers: [myProvider],
  
  // Evaluators: process responses after generation
  // evaluators: [myEvaluator],
  
  // Services: long-running background processes
  services: [MyService],
  
  // Event handlers
  events: {
    MESSAGE_RECEIVED: [async (params) => { ... }],
    WORLD_CONNECTED: [async (params) => { ... }],
  },
  
  // HTTP routes for the agent server
  routes: [{
    name: 'my-route',
    path: '/api/hello',
    type: 'GET',
    handler: async (req, res) => { res.json({ ok: true }); },
  }],
  
  // Plugin dependencies
  // dependencies: ['@elizaos/plugin-knowledge'],
};
```

### An Action in Detail

Actions are the primary integration mechanism — equivalent to "tools" in other frameworks:

```typescript
const myAction: Action = {
  name: 'SEND_EMAIL',
  similes: ['EMAIL', 'MAIL'],           // alternative trigger words
  description: 'Send an email',
  
  validate: async (runtime, message, state) => true,
  
  handler: async (runtime, message, state, options, callback) => {
    // Direct API calls here — no bash, no CLI
    const gmail = new GmailClient(runtime.getSetting('GMAIL_TOKEN'));
    await gmail.send({ to: ..., body: ... });
    callback({ text: 'Email sent.' });
    return { success: true };
  },
  
  examples: [...]
};
```

### Key Differences from Pi Skills

| Dimension | Pi Skills | ElizaOS Plugins |
|-----------|-----------|-----------------|
| **Format** | Markdown (SKILL.md) | TypeScript module |
| **Load** | On-demand, lazy | All loaded at startup |
| **Tools** | Uses harness bash tool | Registers new action types |
| **Context cost** | Very low (only description) | Higher (all actions always registered) |
| **API calls** | Via CLI subprocess | Direct in handler code |
| **OAuth** | CLI manages it | Plugin manages it (env vars or settings) |
| **Portability** | Cross-harness standard | ElizaOS-specific |
| **Complexity** | Very low | Medium-high |
| **Always-on** | No (loaded on-demand) | Yes (services run permanently) |

### ElizaOS's MCP Integration

Interestingly, ElizaOS has a dedicated `@elizaos/plugin-mcp` that bridges MCP servers into the ElizaOS plugin system. This shows that even in code-heavy plugin frameworks, MCP is treated as an optional integration layer — not the primary model.

### When ElizaOS Plugins Make Sense
- Always-on background services (e.g., listen for new emails, watch calendar)
- Deep runtime integration (memory, state, multi-turn context)
- Complex event-driven workflows
- Multi-agent systems with shared state

---

## Other Frameworks

### Claude Code Skills (Anthropic)

The [Anthropic skills repo](https://github.com/anthropics/skills) implements the same Agent Skills standard that pi uses. Key points:
- Same SKILL.md format with YAML frontmatter
- Skills can be installed via `/plugin marketplace add anthropics/skills` or directly
- Anthropic's official document processing skills (PDF, DOCX, PPTX, XLSX) use this format
- Available via Claude.ai UI, Claude Code, and the Claude API
- Skills in the API are passed as file uploads — the model loads them when relevant

### LangChain / LangGraph

LangChain doesn't use "skills" — it uses:
- **Tools**: Python functions decorated with `@tool` or wrapped via `Tool()`
- **Toolkits**: grouped sets of tools for a service (e.g., `GmailToolkit`, `GitHubToolkit`)
- **Agents**: ReAct/structured agents that select and call tools

For Gmail, LangChain has `langchain_community.tools.gmail` — a Python toolkit that wraps the Google Gmail API with direct Python calls. OAuth is handled via `google-auth` credentials stored in local JSON files. This is the code-heavy equivalent of ElizaOS plugins.

### Amp and Droid

Both implement the Agent Skills standard (SKILL.md format) with minor variations in discovery locations. The pi-skills README explicitly lists installation instructions for all four harnesses.

---

## Skills vs MCP: When to Use Which

### Use Skills + CLI When:
- **Capability is narrow and well-defined** (send email, list calendar events)
- **User is self-hosting** and OAuth setup is a one-time thing they can do
- **Token efficiency matters** — CLI results don't bloat context
- **Composability matters** — pipe output, process with bash, write to files
- **Working within pi/Claude Code/Agent Skills standard ecosystem**
- **Integration doesn't exist as an MCP server yet**

### Use MCP When:
- **A quality MCP server already exists** for the integration (GitHub, Postgres, Filesystem, etc.)
- **The integration needs to be shared across multiple agent frameworks** (MCP is universal)
- **You want zero-code integration** — install and configure, not write
- **The service's data needs to flow as Resources**, not just tool calls
- **The user is already using Claude Desktop** which has native MCP support

### The Hybrid Model (What reeboot should probably use):

```
User Request
    ↓
Pi Agent (reeboot AGENTS.md provides context)
    ↓
Skill loaded on-demand (SKILL.md describes what to do)
    ├── For Google APIs: bash → gmcli/gccli/gdcli → OAuth'd API calls
    ├── For GitHub: bash → gh CLI (already OAuth'd) 
    └── For future integrations: bash → any CLI tool
```

MCP can be added **on top** via a pi extension that enables MCP client functionality — but this is additive, not the primary integration model.

---

## Recommended Pattern for reeboot

### Architecture Decision

**Primary integration model: Pi Skills + purpose-built CLI tools**

This is exactly what pi's creator built for their own Google API integrations (`gmcli`, `gccli`, `gdcli`). It's the native, idiomatic pattern for pi-based agents.

### Implementation for Each Integration

#### Gmail + Google Calendar + Google Drive
→ **Install existing pi-skills**: `gmcli`, `gccli`, `gdcli` from `github.com/badlogic/pi-skills`
→ These are already battle-tested, with built-in OAuth flows, token storage, and comprehensive CLI interfaces
→ Skills load on-demand with minimal context overhead

#### GitHub
→ **Use the `gh` CLI** (already installed on most dev machines, handles OAuth)
→ Write a reeboot-specific skill (`github` skill) that wraps `gh` commands for common workflows
→ Alternatively: the `@modelcontextprotocol/server-github` MCP server is high-quality and could be added via a pi extension

#### Future Integrations
→ **Check if a CLI tool exists first** (Slack CLI, Notion CLI, Linear CLI, etc.)
→ **Check if a good MCP server exists** as a fallback (mcp.run/registry.smithery.ai)
→ **Write a new CLI + skill** as last resort — the pattern is well-documented

### Skill Structure for reeboot-specific skills

```
.pi/skills/
├── github/
│   ├── SKILL.md     # Documents gh CLI usage + reeboot-specific workflows
│   └── scripts/
│       └── setup-check.sh
└── reeboot-tasks/
    └── SKILL.md     # Meta-skill for reeboot's task management workflows
```

### What NOT to Do for reeboot

1. **Don't build custom MCP servers** for Gmail/Calendar/GitHub — good CLIs and MCP servers already exist; reinventing them wastes effort
2. **Don't embed OAuth in reeboot's server** — the CLI tool owns OAuth; reeboot agent just calls the CLI
3. **Don't load all skills at startup** — pi's progressive disclosure already handles this; trust the system
4. **Don't build ElizaOS-style TypeScript plugins** — too heavy for what reeboot needs; skills are sufficient

### OAuth Considerations for Self-Hosted Context

The pi-skills approach aligns perfectly with reeboot's self-hosted model:
- OAuth setup is a **one-time operation** the user runs manually (e.g., `gmcli accounts add user@gmail.com`)
- Credentials stored **locally** (`~/.gmcli/`, `~/.gccli/`) — nothing goes to a server
- No web server required for OAuth callback — "Desktop app" OAuth type uses local loopback or manual code entry
- Works headlessly with `--manual` flag for SSH/server deployments
- This is fundamentally simpler and more privacy-preserving than building an OAuth callback server into reeboot

---

## Sources

- **Pi skills documentation**: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- **Pi README (skills section)**: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/README.md`
- **Pi-skills repository (README + skill files)**: https://github.com/badlogic/pi-skills
  - `gmcli/SKILL.md` — Gmail CLI skill
  - `gccli/SKILL.md` — Google Calendar CLI skill
  - `gdcli/SKILL.md` — Google Drive CLI skill
- **Agent Skills standard**: https://agentskills.io/specification
- **Mario Zechner's "What if you don't need MCP at all?"**: https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/
- **Anthropic skills repository**: https://github.com/anthropics/skills
- **ElizaOS plugin-starter (TypeScript)**: https://raw.githubusercontent.com/elizaOS/eliza/refs/heads/main/packages/plugin-starter/src/plugin.ts
- **ElizaOS plugin-bootstrap**: `@elizaos/plugin-bootstrap` on npm
- **ElizaOS plugin-mcp**: `@elizaos/plugin-mcp` on npm — shows MCP as an optional ElizaOS plugin
