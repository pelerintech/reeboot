---
title: "Skills"
description: "Markdown skill files that give the agent specialised instructions and capabilities on demand."
---

# Skills

A skill is a Markdown file (`SKILL.md`) that the agent reads as a system-level instruction set. Skills define how the agent should behave, what commands it should run, and what tools it needs for a specific domain. They are the simplest way to extend reeboot.

---

## Bundled Skills

Reeboot ships 15 skills out of the box. No installation needed.

| Skill | What It Does | Requires |
|---|---|---|
| `github` | Issues, PRs, releases, Actions, code search | `gh` CLI + `gh auth login` |
| `gmail` | Search, read, send, draft, labels, attachments | `gmcli` npm package + GCP OAuth |
| `gcal` | List, create, update, delete calendar events | `gccli` npm package + GCP OAuth |
| `gdrive` | List, read, upload, search Drive files | `gdcli` npm package + GCP OAuth |
| `notion` | Pages, databases, blocks, search | `NOTION_API_KEY` env var |
| `slack` | Send messages, list channels, thread replies | `SLACK_BOT_TOKEN` env var |
| `linear` | Issues, projects, teams, cycles | `LINEAR_API_KEY` env var |
| `hubspot` | Contacts, deals, companies, pipelines | `HUBSPOT_ACCESS_TOKEN` env var |
| `postgres` | Query, inspect schema, run statements | `psql` CLI + `DATABASE_URL` env var |
| `sqlite` | Query, inspect tables, run statements | `sqlite3` CLI + `DATABASE_PATH` env var |
| `docker` | Containers, images, compose stacks | `docker` CLI |
| `files` | Read, write, search local filesystem | bash (built-in) |
| `reeboot-tasks` | Schedule, list, pause, cancel own tasks | scheduler extension (built-in) |
| `web-research` | Structured multi-query web research | web-search extension |
| `send-message` | Send a message to the originating channel | reeboot channels (built-in) |

---

## Loading Skills

### Permanent (always in context)

```json
{
  "skills": {
    "permanent": ["github", "notion"]
  }
}
```

Permanent skills are loaded into the system prompt for every agent turn.

### On-Demand (ephemeral)

The agent can load skills during a session:

```
User: load the notion skill
Agent: → calls load_skill("notion")

User: what integrations do you have?
Agent: → calls list_available_skills()

User: unload notion
Agent: → calls unload_skill("notion")
```

Ephemeral skills expire after `skills.ephemeral_ttl_minutes` (default: 60 minutes).

```json
{
  "skills": {
    "ephemeral_ttl_minutes": 120
  }
}
```

---

## Writing a Custom Skill

Create a directory and a `SKILL.md` file:

```
~/.reeboot/skills/
  my-skill/
    SKILL.md
```

The `SKILL.md` file is plain Markdown — write it as if you're giving detailed instructions to the agent:

```markdown
# My Skill

When activated, you have access to the following tools and should follow these conventions...

## Commands

- To do X: run `some-command --flag`
- To do Y: check `~/.myapp/config.json`

## Rules

- Always confirm before deleting anything
- Output results in a table when there are more than 3 items
```

The agent reads the skill file and uses it as authoritative instruction for this domain.

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `skills.permanent` | string[] | `[]` | Skills always loaded (by name). Loaded at every turn start. |
| `skills.ephemeral_ttl_minutes` | number | `60` | Default lifetime for on-demand loaded skills. |
| `skills.catalog_path` | string | `""` | Additional skill catalog directory beyond `~/.reeboot/skills/`. |
