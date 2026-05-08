# Spec — Capability Pages

## Capability: memory.md

GIVEN `docs/capabilities/memory.md`
WHEN a user reads it
THEN it explains:
  - What personal memory is (MEMORY.md + USER.md at instance level, not per-context)
  - How to enable it (`memory.enabled: true`, default true)
  - The two write paths: immediate `memory` tool vs. background consolidation
  - Consolidation schedule config (`memory.consolidation.schedule`)
  - Character limits (`memoryCharLimit`, `userCharLimit`) and auto-consolidation behaviour
  - `session_search` tool (always-on, independent of memory flag)
  - File locations (`~/.reeboot/agent/MEMORY.md`, `~/.reeboot/agent/USER.md`)
  - Config reference table for all `memory.*` fields

## Capability: domain-knowledge.md

GIVEN `docs/capabilities/domain-knowledge.md`
WHEN a user reads it
THEN it explains:
  - What domain knowledge is: local document corpus + vector search
  - How to enable (`knowledge.enabled: true`, default false)
  - Two document tiers: `raw/template/` (pre-packaged) and `raw/owner/` (operator-added)
  - The embedding model (nomic-embed-text-v1.5, local ONNX, no API key)
  - Chunk size and overlap config
  - Wiki synthesis mode (`knowledge.wiki.enabled`, default false) and its tradeoffs
  - Agent tools available: ingest, search, lint
  - Config reference table for all `knowledge.*` fields
  - Dev note: sqlite-vec auxiliary columns are TEXT not INTEGER (known limitation)

## Capability: token-budget.md

GIVEN `docs/capabilities/token-budget.md`
WHEN a user reads it
THEN it explains:
  - Three budget layers: daily, session, turn (all per-context)
  - Cost tracking via pi's ModelRegistry (no custom pricing table)
  - Behaviour at limit: warn at threshold, block at limit
  - `set_budget` tool (agent sets per-task budget for itself)
  - `check_budget` tool (agent checks its own per-task spend)
  - `budget_status` tool (owner queries historical spend by period/operation type)
  - Local models show "cost unavailable" not $0.00
  - Config reference table for all `budget.*` fields

## Capability: mcp-tools.md

GIVEN `docs/capabilities/mcp-tools.md`
WHEN a user reads it
THEN it explains:
  - What MCP is and how reeboot exposes it via a single proxy `mcp` tool
  - How to configure servers in `mcp.servers[]`
  - Required fields per server: name, command, args, env, permissions
  - Permissions: `network` and `filesystem` booleans
  - Proxy tool usage pattern: `mcp({ action: "list" })` then `mcp({ action: "call" })`
  - Why proxy pattern was chosen (token cost of direct registration)
  - Stdio-only in v1; HTTP/SSE deferred
  - Config reference table for all `mcp.*` fields

## Capability: scheduling.md

GIVEN `docs/capabilities/scheduling.md`
WHEN a user reads it
THEN it explains:
  - `schedule_task` tool: persistent cron/interval scheduling, survives restart
  - Interval syntax accepted
  - `origin_channel` / `origin_peer` routing back to the right channel
  - Timer and heartbeat tools for in-session use
  - Sleep interceptor (blocks bare `sleep`, redirects to `timer`)
  - Scheduler catchup window config (`resilience.scheduler.catchup_window`)
  - `reeboot tasks due` CLI command

## Capability: proactive-agent.md

GIVEN `docs/capabilities/proactive-agent.md`
WHEN a user reads it
THEN it explains:
  - System heartbeat: fires on cron, dispatches to agent, IDLE response suppressed
  - `heartbeat.enabled`, `heartbeat.interval`, `heartbeat.contextId` config
  - In-session `heartbeat` tool (periodic wake-ups within a session)
  - In-session `timer` tool (one-shot wait)
  - Sleep interceptor rules (table of allowed vs. blocked patterns)
  - Config reference table for `heartbeat.*` fields

## Capability: web-search.md (revalidated)

GIVEN `docs/capabilities/web-search.md`
WHEN a user reads it
THEN it contains accurate provider table (duckduckgo, brave, tavily, serper, exa,
  searxng, none) with correct env var names and free tier info, matching the
  current implementation in `reeboot/src/extensions/web-search.ts`

AND `fetch_url` is documented as always-available regardless of provider setting

## Capability: Missing capability pages exist

GIVEN the docs/ folder
WHEN checked for completeness
THEN ALL of the following files exist and are non-empty:
  docs/capabilities/memory.md
  docs/capabilities/domain-knowledge.md
  docs/capabilities/token-budget.md
  docs/capabilities/mcp-tools.md
  docs/capabilities/scheduling.md
  docs/capabilities/proactive-agent.md
  docs/capabilities/web-search.md
