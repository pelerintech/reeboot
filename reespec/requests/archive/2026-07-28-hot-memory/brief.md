# Hot Memory — session awareness across inactivity boundaries

## Why

When a user talks to the agent, returns hours later, and asks about the previous conversation, the agent has no awareness that a prior session existed. The inactivity timer (default 4h) calls `runner.reset()`, which destroys the pi session entirely. The next message creates a blank session — the agent doesn't know what was discussed, can't reference past conclusions, and treats each interaction as a first contact.

The conversation content **is** persisted (in the `messages` table and session `.jsonl` files), but nothing bridges the gap between sessions. The agent has no trigger to look up past context.

This is the single most frustrating UX gap for conversational use cases — the main reason to use an agent harness is to have ongoing, evolving conversations that build on past interactions.

## What Changes

A **hot memory** mechanism that bridges session boundaries:

- When a session closes (inactivity reset), the LLM distills the session into a brief, structured summary (topic, key points, conclusions, open threads)
- These summaries are stored in a rolling window of the last 4–6 sessions (~2–3 days)
- On every new session start, the hot memory is injected into the agent's system prompt as awareness
- The agent is instructed: if the user references a past subject, scan hot memory for a match, then use `session_search` to retrieve full context. If no match in hot memory, ask the user for guidance and do a broader search.

Everything else stays the same: `session_search`, the existing daily consolidation into MEMORY.md, the `memory` tool, and session file persistence.

## Goals

1. After an inactivity reset, the agent knows it had recent conversations and can summarize what they were about
2. When the user says "We talked about X a while back, bring back those conclusions", the agent finds the relevant session in hot memory, calls `session_search` for full context, and responds with the actual details
3. Hot memory stays lightweight — brief summaries, rolling window, not a full archive
4. Zero-config for users — enabled by default, just works

## Non-Goals

1. Not changing the existing MEMORY.md/USER.md mechanism or daily consolidation job
2. Not changing the `session_search` tool or the `messages` table schema
3. Not adding full conversation archiving or long-term retrieval — hot memory is a recent-sessions index only
4. Not changing the inactivity timer duration or runner reset behavior
5. Not reverting the inactivity timer to keep sessions alive forever

## Impact

- **memory-manager.ts** — the hot-memory extension lives here or as a sibling
- **pi-runner.ts** — no changes expected; `session_shutdown` event already fires
- **orchestrator.ts** — no changes expected; existing hooks suffice
- **Before_agent_start injection** — hot memory block added alongside the existing MEMORY block
- **Session close path** — new hook on `session_shutdown` with reason `'new'` to trigger distillation
