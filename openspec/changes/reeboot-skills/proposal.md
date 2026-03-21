## Why

The `skill-manager` extension provides the loading mechanism. This change provides the catalog it loads from. Without a catalog, `load_skill("gmail")` would fail — there would be nothing to find.

The catalog ships in two parts. The bundled catalog (15-20 skills) lives inside the reeboot npm package itself — it works immediately after `npm install -g reeboot` with zero extra steps. The extended catalog (`reeboot skills update`) is a future stub that downloads additional skills as a tarball when the catalog grows large enough to warrant it. No git required, no assumptions beyond npm and HTTP.

The initial bundled skills cover the highest-value integrations: GitHub (via `gh` CLI), Gmail/Calendar/Drive (via `gmcli`/`gccli`/`gdcli` from pi-skills, maintained by pi's creator), Notion (API key + curl), Slack (CLI), Linear (CLI), and a reeboot meta-skill for managing the agent's own scheduled tasks. Each skill documents its own setup — the agent reads the SKILL.md and guides the user through first-time configuration.

## What Changes

- `skills/` directory created inside the reeboot package (discovered automatically by pi and by the skill-manager extension)
- 15 bundled SKILL.md files covering high-value integrations
- `reeboot skills` CLI subcommand group: `reeboot skills list`, `reeboot skills update` (stub)
- Each skill follows the Agent Skills standard (`agentskills.io`): YAML frontmatter with `name` and `description`, plus optional `scripts/` for setup helpers
- Skills that wrap external CLIs document the one-time setup (install CLI, authenticate); the agent reads this on first use and guides the user
- Skills that use API keys document which env var to set; the agent reads and confirms the var is set before proceeding
- All features follow TDD red/green: failing tests written first, then implementation

## Capabilities

### New Capabilities

- `bundled-skill-catalog`: 15 SKILL.md files shipped inside the reeboot npm package under `skills/`; discovered by both pi native skill scanning and the skill-manager extension's `findSkill()` resolver
- `github-skill`: wraps `gh` CLI — issues, PRs, releases, code search, GitHub Actions; documents `gh auth login` setup
- `gmail-skill`: wraps `gmcli` npm CLI — search, read, send, draft, labels, attachments; documents GCP OAuth setup and `gmcli accounts add`
- `gcal-skill`: wraps `gccli` npm CLI — list, create, update, delete calendar events; documents one-time auth
- `gdrive-skill`: wraps `gdcli` npm CLI — list, read, upload, search Drive files
- `notion-skill`: `NOTION_API_KEY` + Notion REST API via curl; documents integration token setup
- `slack-skill`: Slack CLI (`slack`) or API token + curl; documents workspace token setup
- `linear-skill`: Linear CLI (`linear`) or API key; documents setup
- `hubspot-skill`: HubSpot API key + curl; contacts, deals, companies, pipelines
- `postgres-skill`: `psql` CLI; connects to configured `DATABASE_URL`; documents env var
- `reeboot-tasks-skill`: meta-skill for agent self-management — schedule, list, pause, cancel its own tasks via the reeboot scheduler tool
- `web-research-skill`: structured multi-query web research using the web-search extension; documents best practices
- `send-message-skill`: teaches agent to send a message back to the originating channel via reeboot's channel system
- `files-skill`: local filesystem operations; documents which paths are safe to read/write
- `docker-skill`: wraps `docker` and `docker-compose` CLIs; container and compose management
- `reeboot skills list` CLI: prints all bundled skills with name + description
- `reeboot skills update` CLI stub: placeholder for future tarball download from extended catalog

### Modified Capabilities

- `src/index.ts`: add `reeboot skills` command group

## Impact

- `skills/` directory: 15 new SKILL.md files (some with `scripts/` subdirs for setup helpers)
- `src/index.ts`: add `skills` command group with `list` and `update` subcommands
- `package.json`: ensure `skills/` is in the `files` whitelist (it already is from the npm-publish change)
- `tests/skills.test.ts`: new test file — catalog structure validation, CLI commands
- No new npm dependencies
