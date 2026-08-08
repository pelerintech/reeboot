# Spec — mcp-trust

The MCP surface is **read-only substrate** governed by a unified trust model shared with the
other remote surfaces (A2A). Full agent access stays a property of the conversation site;
remote/toolbox surfaces are capability-restricted. Memory/knowledge mutation is owner-only,
enforced at the runner boundary, not by a global tool gate.

## S1 — The MCP surface exposes read-only substrate only

- **GIVEN** the type of a registered tool is in the read-only substrate families
  (memory recall, `knowledge_search`, web read, dreem graph)
- **THEN** it is exposed; and mutating tools (`memory` add/replace/remove,
  `knowledge_ingest`, `knowledge_file`, `knowledge_lint`) are NOT exposed — nor are the
  UI/loop/control-plane families (UI views, `delegate`, scheduler, budget, skills, `mcp`
  proxy). An external agent can read reeboot's brain, never rewrite it.

## S2 — Non-loopback access requires a bearer token

- **GIVEN** an MCP connection originates from a non-loopback address
- **WHEN** authentication is configured and no valid `Authorization: Bearer <key>` matches
- **THEN** the request is rejected (401) and no tool is exposed or callable.

## S3 — Loopback access is trusted by default

- **GIVEN** an MCP connection originates from loopback (127.0.0.1) with no token configured
- **THEN** it is permitted without a token — matching how local agents (Claude Code, Cursor,
  pi) and reeboot's own MCP client run.

## S4 — Every tools/call threads the edge trust plies

- **GIVEN** a tool is invoked over MCP
- **THEN** it passes the same governance as first-party tools: argument schema validation,
  injection scanning, and external-source marking on results. Where a token maps to an
  existing `minAuthLevel` tier (ree mode), the `applyAuthLevel()` filter further restricts
  the visible toolset.

## S5 — Tokens are operator-set static API keys

- **GIVEN** remote (non-loopback) access is enabled
- **THEN** authentication uses an operator-generated static API key configured under
  `mcp.server.apiKey` (same pattern as `a2a.server.apiKey` / `server` token), sent in the
  `Authorization: Bearer` header; there is no OAuth/token-issuance/refresh machinery.

## S6 — Memory/knowledge mutation is owner-only across all remote surfaces

- **GIVEN** a turn runs in a remote runner (A2A invoke or webhook), not the local assistant
- **THEN** memory-mutation (`memory` add/replace/remove) and knowledge-corpus tools are not
  available to that turn — even when authenticated — while the local assistant conversation
  keeps full access. This closes the natural-language `memory` write bypass through A2A.

## S7 — World-actions are gated by authentication, not blocked

- **GIVEN** an authenticated remote caller
- **THEN** world-action capabilities (send-to-channel/email, scheduling, delegation — where
  they are surfaced) are permitted by virtue of authentication; no separate permission
  registry is required for now.

## S8 — Destructive approval defaults to deny for headless remote runners

- **GIVEN** a headless remote runner would trigger a `confirm-destructive`-gated action
- **THEN** with no human in the loop, the approval mode resolves to deny (no destructive
  action is granted by a remote turn).
