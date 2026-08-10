# Capability: changelog content

The `[2.7.0]` CHANGELOG entry accounts for everything user- and operator-facing since
`v2.6.0`, in a curated fine-grained shape.

## Scenarios

### The 2.7.0 entry exists and is complete

GIVEN the release has been planned
WHEN the user inspects `CHANGELOG.md`
THEN there is a `[2.7.0]` section dated today that:
- contains `Added` / `Changed` / `Fixed` / `Breaking` bucket headers (only non-empty ones need exist),
- references the major feature spans as bullets: ree SDK, WebChat UI, A2A, MCP server, memory pluggability + redesign, webhooks, auth-gating, skills UI, jina web-reader, hot memory, observability audit view, interactive tool views, whatsapp web reconnect,
- includes an explicit `Breaking` bullet naming the memory-config change and memory `add` hot-first semantics,
- ends with a single "Internal & tooling" line instead of bulleted dev-only items.

### No work is silently lost

GIVEN `git log v2.6.0..HEAD` is the authoritative commit list
WHEN the changelog writer cross-checks it during execution
THEN every feature commit in that range maps to at least one changelog bullet or the internal line
AND no user-facing feature appears in the log but is absent from the changelog.

### The legacy stubs are absorbed

GIVEN the CHANGELOG previously contained `[2.7.0] - 2026-07-16` and `[Unreleased]` sections
WHEN the 2.7.0 entry is finalized
THEN those legacy/Unreleased contents are present (moved) inside the single `[2.7.0]` entry
AND no non-empty `[Unreleased]` section remains above `[2.7.0]`.

### The changelog and package agree on the version

GIVEN the release is `2.7.0`
WHEN the reader compares CHANGELOG to `reeboot/package.json`
THEN the head released section is `[2.7.0]` AND `reeboot/package.json` `version` is `2.7.0`.
