# Skill manager — design

## Overview

A reeboot agent with 500 skills in context is unusable. The skill-manager extension provides three tiers of skill availability:

1. **Permanent** — always in context (config-driven)
2. **Ephemeral** — agent-loaded with TTL
3. **Browse** — catalog search without loading

## Components

### Config (`config.skills`)
```typescript
{
  permanent: string[],           // always-loaded skill names
  ephemeral_ttl_minutes: number, // default TTL (60)
  catalog_path: string           // optional extended catalog path
}
```

### Extension: `extensions/skill-manager.ts`

- **`resources_discover` handler** — resolves permanent skill names to paths, returns valid paths for pi to load natively
- **`before_agent_start` handler** — injects active ephemeral skills as XML blocks with name, description, expires_in
- **Three agent tools:**
  - `load_skill(name, ttl_minutes?)` — loads from catalog with TTL
  - `unload_skill(name)` — removes immediately
  - `list_available_skills(query?)` — browses catalog without loading
- **TTL expiry loop** — 60s interval, prunes expired skills, persists to disk
- **Persistence** — `~/.reeboot/active-skills.json` survives restarts

### Catalog resolution

1. Bundled: `<pkg>/skills/<name>/SKILL.md`
2. Extended: `~/.reeboot/skills-catalog/<name>/SKILL.md` (if present)
First match wins.

## Implementation details

- Built-in modules only (fs, path, os)
- Fake timers in tests for TTL verification
- Corrupted/missing persistence file handled gracefully on startup
