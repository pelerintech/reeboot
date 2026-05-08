# Spec — Configuration Reference

## Capability: Full config reference page

GIVEN `docs/configuration/reference.md`
WHEN a user reads it to understand how to configure reeboot
THEN every top-level section of the config schema is documented:
  agent, channels, sandbox, logging, server, extensions, routing, session,
  credentialProxy, search, heartbeat, skills, mcp, permissions, security,
  contexts, memory, knowledge, resilience, budget

WHEN a field is listed in the reference
THEN the entry includes: field path, type, default value, and a description
  of what it does and what values are valid

## Capability: Config fields match source of truth

GIVEN a field documented in `docs/configuration/reference.md`
WHEN compared against `reeboot/src/config.ts` (Zod schema)
THEN the field name, type, and default value match exactly — no invented fields,
  no wrong types, no stale defaults

## Capability: Annotated example

GIVEN `docs/configuration/reference.md`
WHEN a user wants to see a complete config.json
THEN the page contains an annotated JSON example showing:
  - Correct nested structure (agent.model.{authMode, provider, id, apiKey})
  - Signal using `apiPort` (number)
  - Memory section with enabled/limits/consolidation
  - Budget section with daily/session/turn limits
  - MCP servers array example
  - All field names exactly matching the Zod schema

## Capability: authMode documented

GIVEN `docs/configuration/reference.md`
WHEN a user wants to reuse their pi provider credentials
THEN the page explains `agent.model.authMode`:
  - `"own"` — reeboot uses its own provider/apiKey/id fields
  - `"pi"` — reeboot delegates to the user's personal pi installation
    (~/.pi/agent/auth.json) and ignores provider/apiKey/id
