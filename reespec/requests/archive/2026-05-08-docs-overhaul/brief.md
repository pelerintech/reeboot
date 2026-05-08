# Brief — docs-overhaul

## What

Rewrite both READMEs and create a full `docs/` folder at the repo root containing
~25 Markdown pages that will feed the Astro marketing/docs site for reeboot.

## Why

The existing README and `reeboot/README.md` are significantly out of date.
They contain inaccurate config examples (wrong field names, wrong structure),
missing CLI commands, and no coverage of ~15 major features shipped since the
original docs were written:

- Personal memory (MEMORY.md / USER.md / consolidation)
- Domain knowledge / RAG (sqlite-vec, nomic embeddings, wiki synthesis)
- Observability system (pino logger, events table, SSE log stream)
- Token budget management (daily/session/turn limits, set_budget, budget_status)
- MCP client (stdio servers, proxy tool pattern)
- Permission tiers (sandbox, injection guard, protected paths)
- Channel trust model (owner_only, trusted_senders, trust tiers)
- Resilience (crash recovery, outage detection, scheduler catchup)
- Routing + multi-context
- Full config schema (authMode, logging, security, contexts, budget, …)

The docs site is an Astro site being built for reeboot. The `docs/` folder at
repo root is pulled by that site. Nothing in the existing docs should be copied
without a revalidation pass — several field names and config structures are wrong.

## Goals

1. Root `README.md` — marketing/presentation page; capability showcase, ease-of-use
   focus, links to docs for details.
2. `reeboot/README.md` — install + usage essentials: quick start, setup wizard,
   minimal config example, CLI cheat-sheet, links to docs.
3. `docs/` — full reference documentation covering every capability, every config
   field (type / default / impact), both user and developer audiences.

## Non-Goals

- Building the Astro site itself (separate project).
- API reference auto-generation from TypeScript types.
- Changelog updates.
- Video or visual assets beyond ASCII diagrams.

## Audiences

- **Primary**: end-users installing and using reeboot (getting started, channels,
  capabilities, configuration).
- **Secondary**: developers building extensions, skills, and channel adapters on
  top of reeboot.

## Impact

- New users can install, configure, and use all major features without reading
  source code.
- The Astro docs site has complete, accurate content to publish.
- No existing user-facing doc remains inaccurate after this request.

## Constraints

- Every config field documented must be verified against `reeboot/src/config.ts`
  (the Zod schema is the source of truth).
- Astro-ready frontmatter (`title`, `description`) on every doc page.
- `docs/` lives at repo root (git-only; not bundled in npm package).
- Docs use plain Markdown — no MDX, no framework-specific syntax.
