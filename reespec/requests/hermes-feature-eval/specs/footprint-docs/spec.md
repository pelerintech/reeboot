# Spec — footprint-docs

Document reeboot's design goal + architecture so contributors place new capability on
the right rung. Docs-only; authored from reeboot's own design choices, not Hermes's.

## S1 — AGENTS.md documents the design goal

- **GIVEN** `reeboot/AGENTS.md`
- **WHEN** it is read by a contributor
- **THEN** it contains a section titled "Design Goal & Architecture" that states the
  design goal: a light core, capability at the edges, and graceful degradation

## S2 — AGENTS.md documents reeboot's own capability-placement rungs

- **GIVEN** the "Design Goal & Architecture" section exists
- **WHEN** searching for how capability is placed
- **THEN** it lists reeboot's rungs in order: (1) extend existing code, (2) gated tool
  (config-toggle / service gating — citing real examples such as jina, knowledge, memory),
  (3) extension, (4) MCP server, (5) new core tool dead-last

## S3 — Content is reeboot-native, not borrowed from Hermes

- **GIVEN** the section
- **WHEN** audited for provenance
- **THEN** it references reeboot's own idioms (ExtensionAPI, pi/ree adapters,
  single-tenant per-deployment config, graceful-degradation fallback pattern) and does
  NOT contain Hermes-specific identifiers or rules (e.g. no `HERMES_*` names, no
  verbatim Hermes rubric)

## S4 — Persona AGENTS.md is untouched

- **GIVEN** the reeboot persona document (the pi persona AGENTS.md)
- **WHEN** the footprint-docs change is applied
- **THEN** the persona AGENTS.md is not modified — only `reeboot/AGENTS.md` (the
  contributor-facing developer doc) gains the section
