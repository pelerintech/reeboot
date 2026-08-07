---
title: "Skills"
description: "Markdown skill files that give the agent specialised instructions and capabilities on demand."
---

# Skills

A skill is a Markdown file (`SKILL.md`) that the agent reads as a system-level instruction set. Skills define how the agent should behave, what commands it should run, and what tools it needs for a specific domain. They are the simplest way to extend reeboot.

---

## Bundled Skills

Reeboot ships a lean core of 5 user-facing skills out of the box. No installation
needed.

| Skill | What It Does | Requires |
|---|---|---|
| `github` | Issues, PRs, releases, Actions, code search | `gh` CLI + `gh auth login` |
| `gmail` | Search, read, send, draft, labels, attachments | `gmcli` npm package + GCP OAuth |
| `gcal` | List, create, update, delete calendar events | `gccli` npm package + GCP OAuth |
| `slack` | Send messages, list channels, thread replies | `SLACK_BOT_TOKEN` env var |
| `gdrive` | List, read, upload, search Drive files | `gdcli` npm package + GCP OAuth |

> **Curated catalog** — every bundled skill above is a deliberate core. The longer
> tail of skills (notion, linear, docker, postgres, sqlite, hubspot, files, …) is no
> longer bundled. They live in an operator-configured **remote curated catalog**
> (see below) and are installed on demand via `reeboot skills update` or the Skills
> page in the web UI.

> **Internal/harness skills** (`web-research`, `send-message`, `reeboot-tasks`,
> `visual-charting`, `visual-planning`) live in a **separate folder** —
> `skills/internal/` — outside the user catalog. They are always in context, never
> shown in the web UI, and cannot be toggled, uploaded over, or deleted.

---

## Curated Catalog (remote skills)

The cut skills aren't lost — they're shipped from a **remote curated catalog**: an
independent repo hosting a manifest (`index.json`) plus per-skill zips. It coexists
with bundled skills and user uploads; all three land in the same local catalog and
enabled set, distinguished by `source` (`bundled | user | remote`).

### Configure the catalog address

The catalog URL is **operator-configurable** — never hardcoded:

```json
{
  "skills": {
    "catalog_url": "https://raw.githubusercontent.com/pelerintech/reeboot-catalog/main/index.json",
    "remote_catalog_path": "~/.reeboot/skills-remote"
  }
}
```

When `catalog_url` is empty, no remote catalog is configured: the CLI and the web
UI report "no remote catalog configured" instead of failing.

### Install via CLI

```
reeboot skills update
```

Fetches the manifest and installs the available catalog skills into
`skills-remote/`, validating each zip through the same Layer-1 pipeline as uploads
(traversal, bomb ratio, entry count, allowlist, symlink) and auto-enabling them.

### Browse + install via the web UI

The **Skills** page shows an **“Available from the curated catalog”** section
listing not-yet-installed entries (name, description, category) with an **Install**
action. Installing moves the skill into your local list as a `remote` skill (with a
remove action) and toggles it on.

### Collision & delete rules

- Installing a skill whose name already exists (bundled, user, or remote)
  is rejected — nothing changes.
- `bundled` skills are never deletable.
- `user` and `remote` skills can be removed (deletes the directory + disables).

## Loading Skills

### Permanent (always in context)

```json
{
  "skills": {
    "permanent": ["github", "slack"]
  }
}
```

Permanent skills are loaded into the system prompt for every agent turn.

> **Note:** `skills.permanent` is superseded by the **enabled set** managed from the
> Web UI. The enabled set is the single source of truth for which user-facing
> skills the agent may see and load. `permanent` is still honoured as a pre-seed
> default when no enabled state file exists yet.

### On-Demand (ephemeral)

The agent can load skills during a session:

```
User: load the slack skill
Agent: → calls load_skill("slack")

User: what integrations do you have?
Agent: → calls list_available_skills()

User: unload slack
Agent: → calls unload_skill("slack")
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
| `skills.permanent` | string[] | `[]` | Pre-seed default for the enabled set (used only when no state exists yet). Superseded by the enabled set from the Web UI. |
| `skills.ephemeral_ttl_minutes` | number | `60` | Default lifetime for on-demand loaded skills. |
| `skills.catalog_path` | string | `""` | Upload/skill catalog directory beyond the bundled user catalog. |
| `skills.catalog_url` | string | `""` | Operator-configurable remote curated catalog address (manifest `index.json`). Empty = no remote catalog configured. |
| `skills.remote_catalog_path` | string | `""` | Where remote-installed catalog skills are promoted (default `~/.reeboot/skills-remote`). |
| `skills.enabled_state_path` | string | `"~/.reeboot/skills-state.json"` | File that persists the enabled-set (`{ enabled: string[] }`). Shared by the REST API and skill-manager extension. |

## Managing Skills in the Web UI

The web UI has a **Skills** tab (next to Chat, Channels, Logs, Settings) where the
driver manages user-facing skills live — no SSH and no restart:

- **Toggle enabled** — enable/disable a skill; takes effect on the agent's next
  turn (live-read enabled set, no reload).
- **Upload** — upload a skill zip (`SKILL.md` + helpers at the archive root). The
  upload is validated at the **package level** (Layer 1): path-traversal,
  decompression bombs, disallowed file types, missing/faulty `SKILL.md`, and name
  collisions with an existing skill are all rejected. Content trust (Layer 2) is
  delegated to reeboot's existing security policies.
- **Remove** — delete a user-uploaded **or remote-installed** skill. Bundled
  skills cannot be removed (they can only be disabled).
- **Catalog** — browse + install skills from the configured curated catalog.

Internal/harness skills never appear in the UI and cannot be managed here.

## Catalog layout

```
<package>/skills/                bundled user-facing skills (the 5 core: github, ...)
<package>/skills/internal/       internal/harness skills (always in context)
~/.reeboot/skills-catalog/       user-uploaded skills (or skills.catalog_path)
~/.reeboot/skills-remote/        remote-installed catalog skills (or skills.remote_catalog_path)
~/.reeboot/skills-state.json     persisted enabled set ({ enabled: string[] })
```
