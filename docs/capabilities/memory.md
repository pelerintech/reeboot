---
title: "Personal Memory"
description: "How reeboot remembers facts, preferences, and corrections across sessions."
---

# Personal Memory

Reeboot maintains persistent memory across all conversations. When you tell it something important — your name, a preference, a standing instruction — it remembers it the next time you talk, regardless of when that is.

Memory is **on by default** and requires no setup.

---

## How It Works

Memory lives in two plain Markdown files at the instance level (shared across all contexts):

| File | Purpose |
|---|---|
| `~/.reeboot/agent/MEMORY.md` | Facts about you: name, location, occupation, key relationships, important context |
| `~/.reeboot/agent/USER.md` | Your preferences: communication style, formatting preferences, standing instructions |

Both files are injected into the system prompt at the start of every agent turn, so the agent always has access to them without using tool calls.

---

## Write Paths

Memory is written via two complementary mechanisms:

### 1. Immediate — the `memory` tool

During a session, the agent uses the `memory` tool when:
- You give an explicit instruction: *"Remember that I prefer bullet points over prose"*
- The agent recognises a strong correction that should persist

The write happens immediately and is available from the next session.

### 2. Background — consolidation

A scheduled background process mines the `messages` table across past sessions, identifies patterns and repeated facts, and updates `MEMORY.md` and `USER.md`. It deduplicates against existing entries.

Consolidation runs by default at 2 AM daily. Configure in `~/.reeboot/config.json`:

```json
{
  "memory": {
    "consolidation": {
      "enabled": true,
      "schedule": "0 2 * * *"
    }
  }
}
```

---

## Session Search

The `session_search` tool is **always available** regardless of `memory.enabled`. It performs full-text search over all past conversations stored in the `messages` table, letting the agent retrieve what was discussed in previous sessions.

---

## Capacity and Auto-Consolidation

When a memory file reaches its character limit, the agent automatically consolidates existing entries (merges and replaces) to make room. This happens silently — no interruption to you. Every auto-consolidation event is logged to the audit events table.

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `memory.enabled` | boolean | `true` | Enable personal memory and the `memory` tool. `session_search` remains available regardless. |
| `memory.memoryCharLimit` | number | `2200` | Maximum characters for `MEMORY.md` before auto-consolidation. |
| `memory.userCharLimit` | number | `1375` | Maximum characters for `USER.md` before auto-consolidation. |
| `memory.consolidation.enabled` | boolean | `true` | Enable background consolidation. |
| `memory.consolidation.schedule` | string | `"0 2 * * *"` | Cron schedule for background consolidation. |

---

## Disabling Memory

```json
{
  "memory": { "enabled": false }
}
```

When disabled, the `memory` tool is not registered and memory files are not injected into prompts. `session_search` remains available.
