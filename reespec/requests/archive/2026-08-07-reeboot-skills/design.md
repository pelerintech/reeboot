# Bundled skill catalog — design

## Overview

The `skill-manager` extension provides the loading mechanism. This change provides the catalog it loads from. Without a catalog, `load_skill("gmail")` would fail. The catalog ships in two parts: bundled (ships with npm package) and extended (future tarball download via `reeboot skills update`).

## Structure

- `skills/` directory inside reeboot package root
- Each skill is a subdirectory with a `SKILL.md` file
- SKILL.md has YAML frontmatter (`name`, `description`) plus markdown body
- pi native skill scanning and skill-manager's `findSkill()` both discover them

## Skills included

| Skill | Mechanism | Auth |
|-------|-----------|------|
| github | `gh` CLI | `gh auth login` |
| gmail | `gmcli` CLI | GCP OAuth |
| gcal | `gccli` CLI | GCP OAuth |
| gdrive | `gdcli` CLI | GCP OAuth |
| notion | curl + NOTION_API_KEY | integration token |
| slack | curl + SLACK_BOT_TOKEN | Slack App token |
| linear | curl + LINEAR_API_KEY | API key |
| hubspot | curl + HUBSPOT_ACCESS_TOKEN | private app token |
| postgres | `psql` CLI | DATABASE_URL env var |
| reeboot-tasks | meta-skill (scheduler tools) | none |
| web-research | meta-skill (web-search ext) | requires web-search ext |
| send-message | meta-skill (channel routing) | none |
| files | local filesystem ops | none (respects protected-paths) |
| docker | `docker`/`docker-compose` CLI | Docker Desktop/Engine |
| sqlite | `sqlite3` CLI | none |

## CLI

- `reeboot skills list` — scans skills/ dir, parses frontmatter, prints sorted table
- `reeboot skills update` — stub: prints "coming soon" message with skill count

## Packaging

- `skills/` in package.json `files` whitelist (already present)
- No new npm dependencies
- All skills are SKILL.md files only — no scripts/ subdirs in initial bundle
