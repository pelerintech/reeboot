# Brief: Personal Memory

## What

Add persistent, self-evolving memory to the reeboot agent — two bounded markdown files (`MEMORY.md` and `USER.md`) that the agent writes and maintains across sessions, a background consolidation process that mines past conversations to distil patterns, and a session search capability that lets the agent query its own conversation history.

## Why

Today the agent starts every session with zero knowledge of who the owner is, how they work, what they've asked before, or what corrections they've given. Every session is stateless. This makes the agent feel generic and forces the owner to re-explain context repeatedly.

Persistent memory closes this gap: the agent accumulates a curated understanding of its owner and its own environment over time, without bloating the context window on every turn.

## Goals

- Agent remembers owner preferences, working style, and corrections across sessions
- Agent remembers environment facts, project conventions, and lessons learned
- Memory is injected into the system prompt as a frozen snapshot at session start (no mid-session cache invalidation)
- Owner can explicitly instruct the agent to remember something and it takes effect next session
- A background consolidation process mines past conversations and distils cross-session patterns into memory
- Agent can search its own conversation history on demand via `session_search`
- Memory self-manages when full (auto-consolidation with observability logging)
- `session_search` is always available regardless of whether memory is enabled

## Non-goals

- Per-context memory (memory is instance-level, shared across all contexts)
- Separate model for consolidation (uses same model as the agent in v1)
- Multi-tenant or per-user memory isolation (single-owner deployment only)
- Vector/semantic search on session history (FTS5 full-text search is sufficient in v1)
- Real-time memory updates mid-session (changes persist to disk immediately but are only visible in the next session's system prompt)

## Memory model

Two files at `~/.reeboot/memories/`:

| File | Purpose | Limit |
|---|---|---|
| `MEMORY.md` | Agent's personal notes — environment facts, project conventions, lessons learned, task diary | ~2,200 chars (~800 tokens) |
| `USER.md` | Owner profile — name, role, preferences, communication style, pet peeves, working habits | ~1,375 chars (~500 tokens) |

Both are injected as a frozen block at session start. The agent manages them via a `memory` tool.

## Two write paths

**Path 1 — Immediate (in-session):**
Agent uses the `memory` tool (actions: `add`, `replace`, `remove`) during a conversation. Triggered by explicit owner instruction ("remember that…") or a strong correction. Writes to disk immediately; visible from the next session.

**Path 2 — Consolidation (background):**
A scheduled process reads the `messages` table, analyses patterns across multiple past sessions, and distils new insights into `MEMORY.md` / `USER.md`. Smart deduplication prevents re-adding what's already there. Auto-consolidates when files are near capacity. Every auto-consolidation event is logged for observability.

## Session search

FTS5 virtual table on the existing `messages` table (zero new npm dependency). A `session_search` tool lets the agent query past conversations ("did we discuss X last week?"). Always-on — registered independently of `memory.enabled`.

## Observability plug

Every auto-consolidation event (merges, drops, capacity management) is written to a `memory_log` table. This is a hook for the future structured audit log request — if auto-consolidation fires too frequently it signals that character limits should be revisited.

## Config

```json
{
  "memory": {
    "enabled": true,
    "memoryCharLimit": 2200,
    "userCharLimit": 1375,
    "consolidation": {
      "enabled": true,
      "schedule": "0 2 * * *"
    }
  }
}
```

## Impact

- All deployment types benefit (personal assistant, legal researcher, support agent, client engagement)
- Agent feels meaningfully more personal and capable from first use
- Foundation for Loop 2 (domain knowledge) — the memory architecture patterns established here are reused
- Observability hook connects forward to the structured audit log request
