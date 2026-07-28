# Interactive Tool Views

## Goals

Bridge the gap between the webchat's view-rendering components (PlanView, DataChart, DataTable, form, confirm) and the tools/LLM that should produce them. Currently, `data-table` views work via MCP and delegate tools, but `data-chart`, `plan`, `form`, and `confirm` views have no producer, and interactive views (form, confirm) have no response channel back to the agent.

## What needs to exist

1. **Thin wrapper tools** that the LLM calls to produce structured views:
   - `render_plan` — produces plan views with diagram, decision, annotated-code, wireframe, file-tree blocks
   - `render_chart` — produces data-chart views (bar/line charts)
   - `render_form` — produces form views for batched data collection
   - `render_confirm` — produces confirm views for yes/no safety gates

2. **Response channel for interactive views** — a structured WebSocket message type (`action`) that carries form submissions and confirm responses back to the agent, injected as a new turn.

3. **Channel-aware rendering** — each channel adapter renders views appropriately (widget in webchat, text fallback in WhatsApp/Signal/Telegram, Inquirer in CLI).

4. **Proactive LLM usage** — tool descriptions and prompt guidelines teach the LLM when to call these tools naturally (not just via slash commands).

## Non-goals

- Not changing the existing streaming architecture (no tool pause/resume)
- Not rebuilding the agent loop — each turn remains independent
- Not implementing the full A2UI protocol — just the structured action message pattern
- Not implementing form/confirm rendering in non-webchat channels in this request (channel adapters will be extended separately)

## Design principles

- The LLM does the thinking and structuring; the tool just validates and returns the view data
- Every view includes a `content` text fallback for non-visual channels
- Interactive views send responses as structured WS messages, not as free-text parsing
- Multi-step dynamic branching is handled by the LLM talking naturally — forms are for batched efficiency, not multi-turn state machines
