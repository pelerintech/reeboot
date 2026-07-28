# Application state table for agent context awareness

## Goals

Add a SQL `application_state` table that the agent can query to understand the current state of the reeboot system — active contexts, connected channels, scheduler status, recent events. Inspired by Agent-Native's `application_state` pattern where the agent can query current navigation, selection, and focused object.

## Non-goals

- Not adding a full observability dashboard (observability exists via structured logs + audit events + SSE stream)
- Not replacing the existing `getAllTools()` / capabilities discovery mechanism
- Not adding state synchronization across multiple reeboot instances
- Not adding persistent history (the `messages` table already handles this)

## Impact

Currently, the agent has no structured view of reeboot's own state. It can discover its tools via the capabilities extension, but it cannot answer questions like:
- "Which channels are currently connected?"
- "Are there any scheduled tasks pending?"
- "What context am I currently in?"
- "Has anything changed since my last turn?"

The agent must rely on its conversation history and tool results to piece together this information. There is no single source of truth for system state accessible to the agent.

After this change:
- A new `application_state` SQL table stores key-value state entries
- A `get_application_state` tool lets the agent query the table
- State is written by the orchestrator, channel adapters, and scheduler as things change
- The agent has a structured, always-current view of the system

## Discovery summary

Agent-Native requires two "standard actions" in every template: `view-screen` (reads current navigation + contextual data) and `navigate` (writes a one-shot navigation command). These are backed by a shared `application_state` SQL table that both the agent and UI read/write. Reeboot's equivalent is simpler — a tools-only approach where the agent queries system state, with no UI navigation component (WebChat doesn't have multiple screens to navigate).

## Key design decisions (to confirm in plan phase)

- Implemented as a new Drizzle migration + schema in the existing SQLite database
- State entries are key-value: `{ key: string; value: JSON; updated_at: timestamp; context_id?: string }`
- A `get_application_state` tool returns entries by key pattern or context
- Written by: orchestrator (active contexts), channel adapters (connection status), scheduler (pending tasks), agent-runner (session state)
- Read by: agent via the `get_application_state` tool
- No UI navigation component (WebChat is a single-chat SPA with no multi-screen navigation)
- Compatible with the structured tool views system (request `structured-tool-views`) for rich rendering
