# Design — docs-overhaul

## Folder Structure

```
/README.md                          ← marketing / presentation (rewrite)
/reeboot/README.md                  ← install + essentials (rewrite)
/docs/
  getting-started/
    introduction.md
    installation.md
    quick-start.md
    setup-wizard.md
  channels/
    webchat.md
    whatsapp.md
    signal.md
    trust-and-access.md
  configuration/
    reference.md                    ← full config schema, every field
  capabilities/
    memory.md
    domain-knowledge.md
    scheduling.md
    web-search.md
    mcp-tools.md
    token-budget.md
    proactive-agent.md
  security/
    sandbox.md
    injection-guard.md
    permission-tiers.md
  observability/
    logging.md
    events.md
  deployment/
    daemon.md
    docker.md
    resilience.md
  extending/
    skills.md
    extensions.md
    channel-adapters.md
    packages.md
```

Total: 2 READMEs + 26 doc pages.

---

## Source of Truth

Every config field documented in `docs/configuration/reference.md` and in
capability pages is verified against `reeboot/src/config.ts` (Zod schema).
Field names, types, and defaults come from the schema — never from the old README.

Key corrections already identified:
- Signal: `apiPort: number` (not `apiUrl: string`)
- Agent model: `agent.model.{ authMode, provider, id, apiKey }` (not flat)
- CLI: `logs`, `contexts`, `sessions`, `tasks due` all exist but are undocumented

---

## Page Anatomy

Every doc page:
```markdown
---
title: "Page Title"
description: "One sentence for SEO and nav tooltips."
---

# Page Title

...body...
```

Config reference tables use this column schema:
| Field | Type | Default | Description |
|-------|------|---------|-------------|

---

## README Strategy

### Root README.md
- Hook: what reeboot is, one sentence
- Visual: architecture diagram
- Capability table (full, current)
- Quick install block
- Links to docs sections
- No config details — all deferred to docs

### reeboot/README.md
- Install + first run
- Setup wizard walkthrough
- Minimal working config.json example (verified)
- CLI cheat-sheet (all real commands)
- Links to docs for every section that needs depth

---

## Authoring Approach

**Rewrite, don't copy.** No content is copied from existing READMEs without
line-by-line verification. Inaccurate examples are wrong → corrected.

**Capability pages** follow a consistent pattern:
1. What it does (2–3 sentences)
2. How to enable / configure (minimal config block)
3. How to use it (agent interaction or CLI)
4. Config reference table for fields in that section
5. Dev notes where relevant (extension hooks, file locations)

**Config reference** is a single long page organized by top-level config section.
Each section has a table of all fields, followed by an annotated JSON example
showing real values. This is the canonical source — capability pages link here
for field details.

---

## Docs Not Written (Stubs)

`contexts list/create` and `sessions list` CLI commands are implemented as stubs.
Docs for these describe the intended behavior but note "coming soon" where the
implementation is incomplete.

---

## Risks

- Config schema may evolve between this plan and execution — executor must re-read
  `config.ts` when writing each page, not rely solely on the schema snapshot here.
- Some capabilities (domain knowledge wiki synthesis, MCP sandbox) have significant
  complexity — pages must not oversimplify to the point of being misleading.
- authMode `pi` delegates to the user's personal pi installation — this must be
  documented carefully to avoid confusion with the bundled pi dependency.
