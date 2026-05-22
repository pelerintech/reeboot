# Brief: Agent Capabilities Discovery & Memory Fix

## Problem

The reeboot agent cannot see or use most of its own tools. On a live deployment with 167+ messages, the memory files (`MEMORY.md`, `USER.md`) are completely empty, and the agent reports it does not know the user's name despite having been told it previously. Investigation revealed two root causes:

1. **Tool invisibility**: Pi's system prompt only includes tools with `promptSnippet` in the "Available tools" section. Most reeboot extensions (memory, budget, knowledge, skill manager, MCP) register tools but omit `promptSnippet`. The LLM literally does not know these tools exist.

2. **Memory consolidation race condition**: The memory extension's `runConsolidation` job tries to register with `globalScheduler` at extension load time. But `globalScheduler` is still a `noopScheduler` at that point — its `registerJob` is a no-op. The real scheduler is set later by `server.ts`, but the registration is already lost.

Additionally, `AGENTS.md` mentions "reference global memory" but never tells the agent *how* to use the memory tool. User-customized AGENTS.md can only make this worse. We need a centralized, always-on mechanism that advertises all registered tools to the LLM regardless of what AGENTS.md says.

## Goals

1. Build a centralized capabilities-discovery extension that discovers ALL registered tools (bundled + user + MCP + skills) and injects a structured capabilities block into the system prompt once per session.
2. Fix the memory consolidation scheduler race condition so sleep consolidation actually fires.
3. Ensure all tools are treated equally — no special-casing for previously-visible tools.
4. Emit observability events so the owner can verify capabilities injection is happening.

## Non-Goals

- Adding `promptSnippet` to individual tools — this would be scattered, easy to forget, and still miss user extensions.
- Changing AGENTS.md templates — user customization is intentionally preserved.
- Redesigning the memory data model or consolidation algorithm — the logic is sound; only the registration mechanism is broken.
- Building a custom pricing table for token budgets — Pi's ModelRegistry remains the source of truth per existing decision.

## Impact

- **Agent memory works for the first time** — the agent can use `memory` and `session_search` tools.
- **All hidden tools become visible** — budget, knowledge, skill, MCP tools are actually usable.
- **Sleep consolidation fires nightly** — cross-session memory accumulation works.
- **User extensions automatically advertised** — no manual promptSnippet required.

## Constraints

- Always-on, not config-gated — core to agent function.
- Maximized/structured capabilities block — correctness over token cost.
- One injection per session (`before_agent_start` hook).
- All tools treated equally.
- Observability: emit event when capabilities injected; track advertised vs used tools.
- Per decisions.md: Pino is the single operational logger; events table uses OTEL-ready schema.
