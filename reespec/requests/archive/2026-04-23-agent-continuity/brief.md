# Brief: Agent Continuity

## Problem

Reeboot presents itself as a personal AI assistant with memory, multi-channel awareness, and
proactive scheduling — but all three capabilities are either completely broken or silently
misfiring in production. The result: the agent feels amnesiac, confused about who it is
talking to, and delivers reminders nowhere.

A diagnostic audit (2026-04-23) found 12 broken wires across four areas:

**Session resume** — the agent starts a blank session on every restart. `getResumedSessionPath`
filters for `session-*.json` files but pi's SessionManager creates files named
`<ISO-timestamp>_<uuid>.jsonl`. The filter never matches; `null` is always returned. The
unanswered-message detection on restart is also dead as a collateral casualty.

**Memory system** — the memory extension has never loaded in production, not once. It lives in
`extensions/memory-manager.ts` but `tsconfig.json` only compiles `src/`. The `dist/` output
never contains it. Even if the path were fixed, three more wires inside the extension are
broken: `pi.getConfig()`, `pi.getDb()`, and `pi.getScheduler()` do not exist on pi's
`ExtensionAPI` — the extension uses imagined APIs. The loader also fails to pass `config` as
a second argument (unlike web-search and mcp-manager which do). Additionally, `session_search`
is gated behind `memoryEnabled` in the loader despite the spec requiring it to be always-on.
Finally, the `messages` table — the foundation of both session search and consolidation — has
zero rows because nothing ever writes turns to it after completion.

**Channel context** — `channelType` and `peerId` are present on the incoming message in the
orchestrator but are dropped when dispatching to `runner.prompt(content)`. The agent has no
way to know what channel it is on or who it is talking to. This causes: wrong channel
assumptions ("you're on webchat"), repeated requests for phone numbers, and inability to
deliver scheduled messages back to the right contact.

**Scheduling** — two parallel systems exist and both are broken. The `timer` tool fires via
`pi.sendMessage({ triggerTurn: true })` which bypasses the orchestrator entirely — replies are
produced but never routed to any channel. The `schedule_task` tool is DB-persisted but
dispatches with `channelType: 'scheduler'` — the orchestrator looks up `_adapters.get('scheduler')`
which is null, so every scheduled reply is silently dropped. Neither system stores the
originating channel or peer with the task, so routing would be impossible even if delivery
were fixed. The `timer` tool should be removed; everything should go through `schedule_task`
which must store channel context at creation time, enrich the fired prompt with routing
instructions, and let the LLM call `send_message` to deliver.

## Goals

1. **Session resume** — on restart, pick up the most recent session within the inactivity
   window; file filter matches pi's actual naming format.

2. **Unanswered message detection** — if the last message in the resumed session was from the
   user with no assistant reply, broadcast a notification on restart.

3. **Memory extension loads** — move `memory-manager.ts` to `src/extensions/` so it is
   compiled. Fix all internal wiring: pass config as argument, use `require()` for DB and
   scheduler access, make `session_search` always-on.

4. **Messages written to DB** — every completed agent turn writes user + assistant messages to
   the `messages` table so session_search and consolidation have material to work with.

5. **Channel context in every prompt** — inject a small header `[channel: X | peer: Y]` into
   every dispatched prompt so the agent always knows where it is and who it is talking to.

6. **Unified scheduling** — remove the `timer` tool. All time-based actions go through
   `schedule_task`. Tasks store `origin_channel` and `origin_peer` at creation. When a task
   fires, the prompt is enriched with routing instructions. The LLM calls `send_message` to
   deliver. Tasks with no origin (REST API / config) broadcast to all connected channels.

## Non-goals

- Changing the channel policy layer or trust model
- Per-context memory (memory stays instance-level per existing decision)
- Semantic/vector search over messages (FTS5 is sufficient in v1)
- Real-time memory updates mid-session (next-session visibility only)
- UI for task management
- Changing the scheduler's poll interval (60s is acceptable for realistic reminder scenarios)

## Impact

- Agent feels coherent for the first time: it remembers, it knows where it is, it delivers
- Fixes the three most-reported user pain points from real WhatsApp usage
- Unblocks memory consolidation (was accumulating nothing to consolidate)
- Unblocks session_search (was searching an empty table)
- Reminders and scheduled tasks finally reach the user on the right channel
