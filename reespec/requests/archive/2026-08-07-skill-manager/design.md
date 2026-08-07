# Skill manager — design

## Overview

A reeboot agent with 500 skills in context is unusable. The skill-manager extension provides tiers of skill availability.

---

## Skills model (v2 — visual manager, discovered in reespec/skill-manager revisit)

Users (the human driver / operator of an agent, NOT end customers) manage skills through a visual manager in the web UI. The model has **three layers**:

```
1. CATALOG   — every skill that exists on disk
               (bundled extension skills + user-uploaded skills)
2. ENABLED   — user-curated on/off set (managed via the UI)
3. ACTIVE    — transient skills actually loaded, via the ephemeral TTL path
```

### Harness vs extension boundary

Skills are split into two distinct domains:

- **Internal / harness skills** — always in context, hidden from the human, NOT
  user-manageable. e.g. visual-charting, visual-planning, web-research,
  send-message (channel delivery), reeboot-tasks. These drive the harness's
  own capabilities (structured views, research, messaging, task orchestration)
  in relation to core tools.
- **User-facing extension skills** — bundled with the product (github, gmail,
  hubspot, slack, ...) plus user-uploaded skills. These are toggleable on/off.
  This set is what the UI manager shows and what the user can extend.

**Decision:** internal skills live in a **separate folder, physically outside the
user catalog**. The user catalog therefore contains ONLY user-facing extension
skills. This makes "everything in this folder is user-manageable" structurally
true (not enforced by metadata discipline), and keeps both domains independently
extensible in future.

### Enabled set replaces config-driven permanent

For all user-facing skills, the enabled set **replaces** `config.skills.permanent`
as the availability model. The only thing that stays "always in context" is the
internal/harness layer (which lives outside the catalog entirely). User-facing
skills — enabled or not — are never pre-injected; they are loaded on demand via
the ephemeral TTL path.

### Live enabled set (no restart)

The enabled set is a **live-read store shared between the UI and the
skill-manager extension**. `list_available_skills` / `load_skill` consult the
current enabled set on every call, so toggling a skill off in the UI means the
agent stops seeing/loading it on the very next turn — **no restart required**.

### UI operations

- **Enable / disable** — flip a skill on/off (applies to bundled + uploaded).
- **Upload** — add a user skill as a **zip archive** (see validation below).
- **Remove** — delete a user's own uploaded skill (files gone). Bundled skills
  can be disabled but never removed.

### Upload validation — two layers

- **Layer 1 (the package):** zip is inspected via its central directory BEFORE
  unpacking — reject path traversal / `..` entries, reject decompression-bomb
  ratios, cap entry count + total expanded bytes, allowlist file types,
  reject symlinks. Extract into a temp dir, re-validate the result (SKILL.md
  present, frontmatter parses), then promote into the catalog.
- **Layer 2 (the content):** what a skill intends is NOT validated at upload
  time. Content trust is delegated to the existing security / context policies
  already run by the agent. Not in scope for this feature.

### Upload layout

A user-uploaded zip contains **one skill directory's contents at the archive
root**: `SKILL.md` plus any helper files alongside it. Extraction promotes the
contents into `<catalog>/<skillName>/`, so the archive root maps directly to the
on-disk skill directory.

### Name collision

If a user-uploads a skill whose name collides with an existing skill (bundled or
already-uploaded), the upload is **rejected with an error** so the user knows
the reason. No shadowing or precedence gymnastics.

---

## Scope of this work

This request covers not just the skill-manager extension but the **full
user-facing skills feature**, including a **Skills page in the web UI** that the
human driver uses to enable/disable, upload, and remove skills — backed by REST
endpoints and the live enabled-set store.

## SDK independence

The enabled-set store and the "compute active skill paths" filter live at the
**reeboot level, SDK-agnostic** — one implementation shared by all SDKs. The
only per-SDK piece is the **delivery seam** that advertises the chosen skill
paths into that SDK's prompt:

- **pi mode (now):** filters `additionalSkillPaths` + feeds enabled paths via
  `resources_discover` (mechanism already exists).
- **ree mode (future):** emit `resources_discover` on the ReeChat emitter +
  consume skillPaths in the ReeRuntime prompt builder + register the
  skill-manager extension through the ReeExtensionAdapter. No re-architecture
  of the enabled set or filter — those are reused untouched.

**Constraint:** do NOT bake the filtering logic into the pi loader path. Keep
enabled-set store + active-path computation SDK-agnostic so a future SDK can
reuse it. Skills are NOT required to work in ree mode for this request, but the
reeboot-level design must remain SDK-independent for later.

---

## Component model (v1 — as built)

The skill-manager extension provides three tiers of skill availability:

1. **Permanent** — always in context (config-driven)
2. **Ephemeral** — agent-loaded with TTL
3. **Browse** — catalog search without loading

> Note: the v1 "permanent" tier (config.skills.permanent, resolved at startup)
> is superseded for user-facing skills by the v2 enabled-set model above.

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
