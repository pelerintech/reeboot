# Design: Agent Continuity

## Overview

Six independent fixes, each closing a broken wire. No new dependencies. No new tables except
`origin_channel` / `origin_peer` columns on `tasks`. All changes are surgical.

---

## Fix 1 — Session resume file filter

**File**: `src/context.ts` — `getResumedSessionPath()`

Pi's `SessionManager` creates files with this naming pattern:
```
2026-04-23T15-39-50-953Z_019dbaff-5d29-728e-9d98-303bf9951e47.jsonl
```

Current filter: `f.startsWith('session-') && f.endsWith('.json')` — matches nothing.

New filter: `f.endsWith('.jsonl')` — matches all pi session files. Sort lexicographically
(ISO timestamps sort correctly as strings). Take the last entry. Check `mtimeMs` against
inactivity window. Return path or null.

`scanSessionForUnansweredMessage` already parses JSONL correctly — no change needed there.

---

## Fix 2 — Memory extension: move and rewire

**Move**: `extensions/memory-manager.ts` → `src/extensions/memory-manager.ts`

The `tsconfig.json` `rootDir`/`include` only covers `src/`. Moving the file is sufficient to
get it compiled into `dist/extensions/memory-manager.js` where `importExt()` expects it.

**Wire 1 — config**: Loader currently calls `(mod.default as any)(pi)`. Change to
`(mod.default as any)(pi, config)`. Update `makeMemoryExtension` signature to accept
`config: Config` as second argument (drop the `pi.getConfig?.()` call).

**Wire 2 — DB access**: Replace `(pi as any).getDb?.()` with
`require('../db/index.js').getDb()` — same pattern as `scheduler-tool.ts`.

**Wire 3 — Scheduler access**: Replace `(pi as any).getScheduler?.()` with
`require('../scheduler-registry.js').globalScheduler` — same pattern as `scheduler-tool.ts`.

**Wire 4 — session_search always-on**: The loader currently gates the entire memory factory
on `memoryEnabled`. Split: always push the factory (for session_search), pass `memoryEnabled`
flag into `makeMemoryExtension` so it gates only the `memory` tool and system prompt
injection — not session_search registration.

---

## Fix 3 — Messages written to DB after turns

**File**: `src/orchestrator.ts` — `_runTurn()`

After a successful turn (just before `closeTurn`), write two rows to the `messages` table:
- `role: 'user'`, `content: msg.content`
- `role: 'assistant'`, `content: responseText`

Both rows carry `contextId`, `channelType` (as `channel`), and `peerId`.

The `messages` schema already has `channel` and `peer_id` columns. The FTS5 trigger on
`messages` auto-populates `messages_fts` — no extra work needed.

Also write on error/timeout turns if the user message should still be searchable — write the
user message row regardless of turn outcome; only write assistant row on success.

---

## Fix 4 — Channel context in every prompt

**File**: `src/orchestrator.ts` — `_runTurn()`

Prepend a small routing header to every prompt before passing to `runner.prompt()`:

```
[channel: whatsapp | peer: +40712345678]
User message here...
```

For scheduler-fired turns (`channelType: 'scheduler'`), do not prepend — the task prompt
is already enriched (see Fix 6).

The agent can read this header to know where it is and who it is talking to. This also
provides the `send_message` skill with the information it needs without requiring the agent
to call a separate lookup tool.

---

## Fix 5 — Unified scheduling: remove timer, enrich task prompts

### Remove `timer` tool

Delete `timer` tool registration from `src/extensions/scheduler-tool.ts`. Keep `TimerManager`
class but stop registering the `timer` tool. The `heartbeat` tool is separate and stays.

The sleep interceptor (bash pre-hook) stays — it prevents the agent from accidentally
blocking with `sleep`.

### Store origin on tasks

Add two nullable columns to the `tasks` table via migration:
```sql
ALTER TABLE tasks ADD COLUMN origin_channel TEXT;
ALTER TABLE tasks ADD COLUMN origin_peer     TEXT;
```

`schedule_task` tool reads origin from the current message context. Since the tool is called
from within a turn, the channel context header is already in the prompt — the agent can pass
`origin_channel` and `origin_peer` as parameters. Update the tool schema to accept these two
optional fields and persist them.

### Enrich fired prompt

When the scheduler fires a task, build an enriched prompt:

```
[scheduled task | origin_channel: whatsapp | origin_peer: +40712345678]
Task: <original task prompt>

Deliver this response to the user via the send_message tool using the channel and peer above.
If no origin is set, broadcast to all available channels.
```

If `origin_channel` and `origin_peer` are null (REST-created task), the enriched prompt
instructs the agent to broadcast.

### Scheduler dispatch — reply routing

Currently `handleScheduledTask` publishes to the bus with `channelType: 'scheduler'` and
`peerId: 'scheduler'`. The orchestrator's `_reply` then looks up `_adapters.get('scheduler')`
which is null.

Fix: when the orchestrator's `_reply` receives a message with `channelType: 'scheduler'`,
instead of looking up a non-existent adapter, check `msg.raw.origin_channel`:
- If present → reply to `_adapters.get(origin_channel)` targeting `origin_peer`
- If absent → broadcast to all adapters

Pass `origin_channel` and `origin_peer` through `createIncomingMessage`'s `raw` field so
`_reply` can access them.

---

## Fix 6 — Unanswered message detection (collateral of Fix 1)

This is fixed automatically when Fix 1 lands — `getResumedSessionPath` will return a real
path, `scanSessionForUnansweredMessage` will be called with it, and the notification will fire.
No separate work needed.

---

## Migration strategy

All DB changes are additive:
- `messages` table already exists — orchestrator just starts writing to it
- `tasks` table gets two nullable columns via `ALTER TABLE IF NOT EXISTS`-style guard
- No data migration needed

The `runResilienceMigration` function in `src/db/schema.ts` already handles the tasks column
guard pattern — add the two new columns there.

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Session resume picks up a session from a different agent identity | Low | Same sessionsDir is keyed to contextId |
| Channel header in prompt confuses agent | Low | Header uses unmistakable bracket syntax; AGENTS.md can be updated to acknowledge it |
| Removing `timer` tool breaks existing agent instructions | Low | No real usage since extension never loaded; timer tool was in-memory only |
| tasks origin columns migration fails on existing DB | Very low | Guard with `table_info` pragma check as used elsewhere |
| Messages written to DB on every turn increases DB size | Low | Messages are text, SQLite handles millions of rows; consolidation prunes oldest |
