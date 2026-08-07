# Design — mcp-server-capabilities

## Context

Reeboot is an MCP **client** today (proxy `mcp` tool over stdio, `@tanstack/ai-mcp`).
This request makes reeboot additionally an MCP **server** — a *passive hub* that
serves a subset of reeboot's real capabilities to external MCP clients (Claude Code,
Codex, Cursor, pi). It exposes existing tools; it does not invent new capabilities
(brief non-goal). The existing A2A surface (`GET /a2a/capabilities`, `POST /a2a/invoke`)
and webhook surface (`POST /webhook/:name`) are siblings mounted on the same Hono app.

Tool registration today: extensions call `pi.registerTool(tool)` with a full
`ToolDefinition` including `execute`. The adapter forwards to the SDK but does not
retain the executable for standalone headless invocation. Most candidate tools are
already self-contained (pull `getDb()` / `getLogger()` globals), so pass-through is
cheap.

## Approach

### Invocation model: pass-through (decided)

Each MCP `tools/call` maps to an underlying reeboot tool's `execute()` invoked with a
synthesized **headless `ExtensionContext`** (`hasUI: false`, `ui` no-op, `cwd` /
`workspacePath` = scratch, `config` / `db` / `modelRegistry` from the app). No agent
loop, no model inference — the MCP call IS the tool call.

Architecture (three small pieces):
1. **Registry seam** — capture `ToolDefinition` (name → `execute`) at registration time
   so the MCP server can invoke it headless. Today the adapter only forwards to the SDK.
   This is a new (or extended) registry that retains executables.
2. **Headless-context synthesizer** — builds the `ExtensionContext` for a call.
3. **Edge trust plies** — schema validation, injection scanning, auth-tier gating,
   namespacing applied at the MCP edge, same governance as first-party tools.

### Surface: read-only substrate (decided)

The MCP surface exposes **read-only substrate** only — inert by construction; an
external agent can read reeboot's brain, never rewrite it.

| Capability | Exposed tools | Not exposed |
|---|---|---|
| memory | recall only: `session_search`, `memory` (recall), hot-retrieval | `memory` add/replace/remove |
| knowledge | `knowledge_search` | `knowledge_ingest`, `knowledge_file`, `knowledge_lint` |
| web | `jina_read`, `web_search`, `fetch_url` | — |
| dreem (opt) | `dream`, `graph`, `tree`, `deep-search`, `health` (query graph, read-only) | — |
| excluded families | — | UI views (`render_*`), `delegate`, scheduler, budget, skills, `mcp` proxy |

Rationale: `memory` writes are too sensitive to mutate via MCP. `knowledge_ingest` is an
internal bootstrapping tool (reads a local file into the corpus — its only "remote" use
would be triggering ingestion of files already on the host, not receiving content from an
external system), so it stays internal. `knowledge_file` is the largest corruption vector
(raw unvalidated content write) and is also excluded.

### Unified trust model (decided)

Full agent access is a property of the CONVERSATION surface; capability restriction is a
property of the REMOTE/TOOLBOX surfaces. Memory/knowledge mutation is **owner-only**,
enforced at the runner boundary — not by a global tool gate (the human driving the agent
must always be able to `memory add/remove`).

```
SURFACE               AUTH                               ALLOWED
────────────────────  ────────────────────────────────   ──────────────────────────
local conversation    loopback / owner — no token        FULL: everything + memory-
  (/ws/chat, CLI)                                          write (assistant case)
MCP server            loopback: no token                 read-only substrate
                      non-loopback: REQUIRED token
A2A invoke            non-loopback: REQUIRED token       full agent turn, incl.
                                                          world-actions (send/sched)
webhook               (unchanged, HMAC per-subscription)
```

- **Gate #1 — identity**: non-loopback access to MCP and A2A requires a bearer token;
  loopback stays token-free for local agents. This single rule gates the world-action
  family (`sendMessage` to channels/email, `schedule_*`, `delegate`): any *authenticated*
  remote caller may perform them — no separate permission registry for now. Auth is the gate.
- **Gate #2 — sensitivity**: memory and knowledge-corpus mutation (
  `memory` add/replace/remove, `knowledge_ingest`, `knowledge_file`) is **owner-only**, blocked
  for ALL remote callers even authenticated. The assistant conversation keeps it. This closes
  the natural-language `memory` write bypass through A2A.
- Other owner-only today: skills management (deferred per brief); `confirm-destructive`
  approval for headless remote runners = default **deny** (no human to approve).

### Token issuance: operator-set static API keys (decided)

Not OAuth. These are **operator-generated static API keys** in `config.json` that travel in
the `Authorization: Bearer` header — the same pattern as the existing `server` token and
`a2a.server.apiKey`. No issuer, no expiry, no refresh, no issuance machinery.

- Issuance: operator generates a random secret (`openssl rand -hex 32`), sets
  `mcp.server.apiKey` (and keeps `a2a.server.apiKey`), pins it in the remote client.
- Rotation: manual (regenerate + update clients). One shared key = one privilege level per
  surface; per-client scopes would need multiple keys or OAuth.
- Short-lived/rotating OAuth tokens are **explicitly out of scope** — overkill for the
  local-first, operator-controlled, machine-to-machine threat model.

### Edge plies (unchanged from first version)

Every `tools/call` threads schema validation, injection-scanning, and external-source
marking on results, same as first-party tool output. Where tokens map to an existing
`minAuthLevel` tier (ree mode), the `applyAuthLevel()` filter can further restrict the
visible toolset.

### Transport: Streamable HTTP (decided)

MCP is mounted as a **Streamable HTTP** endpoint (new `/mcp` route) on the Hono
server, sibling to `/a2a` and `/webhook`. No child-process lifecycle to manage
(rejected stdio for the primary surface). A stdio entrypoint is NOT part of this
request; if a stdio-only client setup is later needed it is a separate packaging
concern.

## Risks

<!-- Tradeoffs to be filled as branches resolve. -->

## Open branches

- Namespacing on the MCP surface (raw tool names vs a prefix).
- Graceful degradation at the edge (backend down → degrade vs fail).
- Capability-selection mechanism (eligibility rule as automatic filter).
