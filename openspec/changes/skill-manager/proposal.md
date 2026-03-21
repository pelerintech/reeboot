## Why

A reeboot agent with access to 500 skills in its context at all times would be unusable — the token cost alone would be enormous, and the agent would be confused by irrelevant capabilities. Skills need to be selectively available: a small set the user permanently wants, and the rest accessible on demand when the agent decides it needs them for a task.

The pi skill discovery system loads skills from disk at startup and puts all their descriptions in the system prompt. This works well for 5-10 skills but breaks down at catalog scale. We need a smarter loader that: (1) gives the agent a small permanent set from config, (2) lets the agent load additional skills autonomously for a bounded time window (TTL), and (3) lets the agent browse the full catalog without loading it.

The `pi-load-skill` extension by the reeboot author provides the core mechanism (dynamic `resources_discover` + `before_agent_start` injection) but is session-scoped and lacks TTL. This change builds on that pattern with autonomous-agent-appropriate lifecycle management.

## What Changes

- New `skill-manager` pi extension in `extensions/skill-manager.ts`
- Permanent skills: listed in `config.skills.permanent`, registered via `resources_discover` at startup — pi discovers and renders them natively
- Ephemeral skills: loaded by the agent via `load_skill(name, ttl_minutes?)` tool call, injected into system prompt via `before_agent_start` for every turn while active, automatically expired by a background TTL loop
- Persistence: active ephemeral skills + expiry timestamps written to `~/.reeboot/active-skills.json` — survive server restarts with remaining TTL intact
- Catalog resolution: skill manager resolves names from (1) bundled catalog inside reeboot package, (2) extended catalog at `~/.reeboot/skills-catalog/` if present
- Agent tools: `load_skill`, `unload_skill`, `list_available_skills`
- Config: `skills.permanent`, `skills.ephemeral_ttl_minutes`, `skills.catalog_path`
- All features follow TDD red/green: failing tests written first, then implementation

## Capabilities

### New Capabilities

- `permanent-skills`: skills listed in `config.skills.permanent` are always present in the agent's context; registered natively via `resources_discover` so pi handles description rendering
- `ephemeral-skills`: agent-controlled transient skill loading; TTL-based expiry; no reload or session restart required; injected via `before_agent_start`; persisted across server restarts
- `skill-ttl-loop`: background loop (every 60s) that drops expired ephemeral skills and updates `~/.reeboot/active-skills.json`
- `skill-catalog-browse`: `list_available_skills(query?)` tool — agent can search the catalog by keyword without loading anything into context
- `load-skill-tool`: `load_skill(name, ttl_minutes?)` — agent loads a skill from the catalog; default TTL from config; existing skill with same name is replaced
- `unload-skill-tool`: `unload_skill(name)` — agent removes a skill immediately before TTL expires
- `active-skills-persistence`: `~/.reeboot/active-skills.json` stores active ephemeral skills with ISO expiry timestamps; restored on startup with remaining TTL

### Modified Capabilities

- `config.skills` block added to `src/config.ts` schema

## Impact

- `extensions/skill-manager.ts`: new extension — permanent skills via `resources_discover`, ephemeral skills via `before_agent_start`, TTL loop, three agent tools, persistence
- `src/config.ts`: add `skills` config block (`permanent`, `ephemeral_ttl_minutes`, `catalog_path`)
- `tests/skill-manager.test.ts`: new test file
- `src/extensions/loader.ts`: register `skill-manager` extension factory
- No new npm dependencies (fs, path, os are all built-in; `@sinclair/typebox` already present)
