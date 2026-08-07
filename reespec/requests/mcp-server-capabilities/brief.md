# Brief — mcp-server-capabilities (reeboot as a passive hub)

## Why

Reeboot accumulates a genuinely valuable substrate over time — a pluggable memory
(recall/consolidation), a domain-knowledge corpus, web-reading abilities, gated tools,
and a skill catalog. Today that substrate is only reachable by talking *to reeboot*;
it is trapped behind reeboot's own conversation. Any other agent the operator uses
(Claude Code, Codex, Cursor, pi) starts from zero — no memory, no knowledge base, no
reusability.

We compared reeboot against Dify (an app-*building* platform) and OpenWork (a workbench
built around OpenCode). Neither competes with reeboot, and most of their platform
features (visual workflow builder, prompt IDE, marketplace) are against reeboot's
"light core, capability at the edges" DNA. The single idea worth adopting — and the only
one that is cheap, on-philosophy, and differentiates reeboot — is OpenWork's stance of
**serving capabilities over MCP** applied to reeboot's own strengths.

Reeboot already speaks MCP *as a client* (its `mcp` tool consumes servers over stdio).
This request makes reeboot *also* an MCP **server** — a **passive hub**: an endpoint other
agents dial into and use reeboot's core capabilities without re-teaching each agent.

Reeboot's position becomes "the shared brain + toolbox." Dify doesn't do this (it builds
apps); OpenWork's Den does it only for its own workbench. This is differentiated and it
reuses existing infrastructure.

## What Changes

After this request, reeboot can run in MCP **server** mode: it publishes an MCP endpoint
(a Hono route) that advertises a **selected subset** of reeboot's real capabilities as
callable MCP tools. An external MCP client (Claude Code, Codex, Cursor, pi, or reeboot
itself) can connect and invoke them.

Reeboot stays "the agent you talk to" AND becomes "importable substrate other agents use."
This is a **passive hub** — reeboot server capabilities to consumers; it does NOT broker or
route between agents (that is explicitly out of scope).

Candidate capabilities to expose (to be narrowed in design/specs):
- **memory** (the standout): `memory.search` / recall against the active provider
- **knowledge**: search over the domain-knowledge / RAG corpus
- **web**: `web.read` / `fetch_url` / `jina_read`
- **gated tools**: memory/knowledge/other core tools subject to existing auth trust tiers
- **skills** (possibly later)

## Goals

- Make reeboot's accumulated memory and knowledge available to any MCP-capable agent.
- Establish reeboot as a **passive hub**: a capability-server other agents plug into.
- Reuse existing infrastructure (Hono server, tool registry, trust/auth plies, MCP protocol).
- Stay true to reeboot's philosophy: light core, capability at the edges, graceful degradation.

## Non-Goals

- **Active hub / orchestrator** — reeboot will NOT broker, route, or coordinate
  agent-to-agent relationships. It only serves capabilities to consumers.
- Visual workflow builder, prompt IDE, marketplace (Dify-style platform surface) — rejected.
- Eval/annotation and Backend-as-a-Service — real ideas but NOT a priority now; out of scope.
- Building new reeboot core capabilities — this exposes existing ones, it does not invent new ones.

## Impact

- **`src/server.ts` / Hono app**: new MCP server route(s) mounted alongside existing routes
  (`/webhook`, `/a2a/...`).
- **Tool registry / extension layer**: selecting which capabilities to expose; the MCP server
  surface must respect reeboot's existing trust plies (schema validation, injection scanning,
  `minAuthLevel` / permission-tier gating, namespacing).
- **Trust/auth**: external consumers need an auth story (token? loopback-only by default?).
- **Memory**: expose the active provider's recall (builtin / dreem / mem0) — memory is the
  headline capability.
- **Composition with existing surfaces**: reeboot already has an A2A `delegate` / cross-process
  invocation surface mounted on the Hono server; MCP-server mode is a sibling and should be
  designed to coexist cleanly.
- **Security posture**: an externally-facing capability server is a new attack surface; the
  trust plies and auth model must be first-class, not an afterthought.
