## Evaluation — 2026-04-23 00:00

### session-resume
verdict:  ✅ SATISFIED
reason:   All six scenarios are covered. `getResumedSessionPath` in `src/context.ts` (line 204) filters for `.endsWith('.jsonl')`, sorts lexicographically and reverses (most-recent-first), returns `null` when outside `inactivityTimeoutMs`, and ignores legacy `session-*.json` files (those are only touched in `listSessions`, not here). SR-6 is satisfied: `scanSessionForUnansweredMessage` in `src/resilience/startup.ts` reads the JSONL, detects last-role-user, and `src/server.ts` (lines 195–201) calls `broadcastToAllChannels` with the snippet on startup.

### memory-extension
verdict:  ✅ SATISFIED
reason:   ME-1 is satisfied — `dist/extensions/memory-manager.js` exists. ME-2/ME-3 satisfied — `session_search` is registered unconditionally at line 607 of `src/extensions/memory-manager.ts`; `memory` tool and `before_agent_start` are gated by `memoryConfig.enabled`. ME-4 satisfied — `before_agent_start` handler injects MEMORY.md + USER.md content with char-count/percentage annotations (lines 587–603). ME-7 satisfied — consolidation job is registered with `globalScheduler` via `require('../scheduler-registry.js')` when both flags are true. ME-8 satisfied — capacity errors reference `charLimit` from config, not hardcoded values (lines 160–161, 201). ME-5/ME-6 satisfied — `session_search` tool queries via `runSessionSearch(db, query, limit)`.

### messages-persistence
verdict:  ⚠️ PARTIAL
reason:   MP-2, MP-4, MP-5, MP-6 are satisfied. However, **MP-1** requires "WHEN the turn completes (success, **error, or timeout**) THEN a row exists in `messages` with `role: 'user'`" — the two `INSERT INTO messages` statements in `src/orchestrator.ts` (lines 362, 371) are placed *after* `closeTurn()`, which is only reached on the success path. The error path returns early at line 345 (`return;`) without executing any INSERT. **MP-3** requires that on a failed turn "only the user message row exists" — but no user row is written either. The user message is silently dropped on error and timeout.
focus:    `src/orchestrator.ts` lines ~300–380 — move the user-message INSERT to before the retry loop, or to a finally block, so it fires on all turn outcomes.

### channel-context
verdict:  ✅ SATISFIED
reason:   All four scenarios are covered. `src/orchestrator.ts` line 259 defines `SKIP_HEADER_CHANNELS = new Set(['scheduler', 'recovery'])` and line 260 conditionally prepends `[channel: ${msg.channelType} | peer: ${msg.peerId}]\n${msg.content}` — satisfying CC-1 (whatsapp), CC-2 (web), CC-3 (scheduler skipped), and CC-4 (recovery skipped).

### unified-scheduling
verdict:  ⚠️ PARTIAL
reason:   US-1 satisfied — no `timer` `registerTool` call exists; only `heartbeat`, `schedule_task`, and task management tools are registered. US-2 satisfied — `origin_channel`/`origin_peer` are accepted, stored via `params.origin_channel ?? null` (lines 394–395 of `src/scheduler.ts`), and `runResilienceMigration` adds the columns on existing DBs (US-6 ✅). US-4 satisfied — no-origin tasks receive broadcast prompt. US-7/US-8 satisfied. **US-3 is partially violated**: the spec requires the prompt to "instruct the agent to use `send_message` to deliver", but `buildScheduledPrompt` (lines 307–310) says *"Your reply will be automatically delivered… on ${origin_channel}"* — no `send_message` instruction, and no `send_message` tool is registered anywhere in the codebase. **US-5** is satisfied in outcome (the orchestrator's `_reply` method in `src/server.ts` lines 270–289 auto-routes scheduler turns to the correct adapter via `raw.origin_channel`/`raw.origin_peer`), but the delivery mechanism diverges from the spec's prescribed approach of the agent calling `send_message`.
focus:    `src/scheduler.ts` `buildScheduledPrompt` and `src/extensions/scheduler-tool.ts` — spec prescribes a `send_message` tool; current implementation relies on automatic orchestrator routing instead. Delivery works, but the contract language is not met.

## Triage

✅ Safe to skip:  session-resume, memory-extension, channel-context

⚠️  Worth a look:
- **messages-persistence** — user message INSERT is only on the success path; MP-1 requires it on error and timeout too. Move the user-row INSERT before the turn loop or into a finally block in `src/orchestrator.ts`.
- **unified-scheduling (US-3)** — prompt says "automatically delivered" rather than instructing the agent to call `send_message`; no `send_message` tool exists. Delivery outcome works via orchestrator auto-routing, but the prescribed mechanism is absent. Decide whether to accept the divergence or align the implementation to the spec.

---

## Evaluation — 2026-04-23 20:40

### session-resume
verdict:  ✅ SATISFIED
reason:   All six scenarios covered. `getResumedSessionPath` (`src/context.ts` line 204) filters `.endsWith('.jsonl')`, sorts lexicographically and reverses for most-recent-first (SR-1, SR-4), returns `null` when mtime exceeds window (SR-2) or dir is empty (SR-3), and old `session-*.json` files are only touched in `listSessions`, not here (SR-5). SR-6: `server.ts` lines 195–201 call `scanSessionForUnansweredMessage` on resume and `broadcastToAllChannels` with the snippet when the last role is user.

### memory-extension
verdict:  ✅ SATISFIED
reason:   ME-1: `dist/extensions/memory-manager.js` exists and is non-empty. ME-2/ME-3: `session_search` registered unconditionally at line 607; `memory` tool and `before_agent_start` gated by `memoryConfig.enabled` at lines 588 and 634. ME-4: `buildMemoryBlock` injects MEMORY.md + USER.md content with `[X% — Y/Z chars]` annotations. ME-5/ME-6: `runSessionSearch` returns `role`, `created_at`, `excerpt` fields; empty-array catch handles no-match. ME-7: consolidation job registered via `require('../scheduler-registry.js').globalScheduler` when both flags true. ME-8: capacity errors reference `memoryConfig.memoryCharLimit` / `userCharLimit` from passed config (lines 160–161, 200–201), not hardcoded values.

### messages-persistence
verdict:  ✅ SATISFIED
reason:   MP-1: user message INSERT placed before the `while` loop (`src/orchestrator.ts` line 233), firing on success, error, and timeout alike; test `writes user message even when turn errors` confirms. MP-2/MP-3: assistant INSERT inside success block only (`responseText` guard), verified by test. MP-4: `runSessionSearch` end-to-end test in `tests/extensions/memory-manager.test.ts` line 239 inserts rows, runs FTS query, asserts matching excerpt — trigger confirmed live. MP-5: `context_id`, `channel`, `peer_id` present in both INSERTs. MP-6: `skipPersist` guard excludes `scheduler` and `recovery` channel types entirely.

### channel-context
verdict:  ✅ SATISFIED
reason:   All four scenarios covered. `SKIP_HEADER_CHANNELS = new Set(['scheduler', 'recovery'])` at line 272 of `src/orchestrator.ts`; non-skip turns prepend `[channel: ${msg.channelType} | peer: ${msg.peerId}]\n${msg.content}` (CC-1, CC-2); scheduler and recovery turns pass content unchanged (CC-3, CC-4). Four passing tests in `tests/channel-context.test.ts` confirm each scenario.

### unified-scheduling
verdict:  ⚠️ PARTIAL
reason:   US-1 ✅ — no `timer` `registerTool` call; comment at line 175 of `scheduler-tool.ts` confirms removal. US-2 ✅ — `origin_channel`/`origin_peer` persisted via `params.origin_channel ?? null`. US-4 ✅ — no-origin prompt contains "broadcast to all connected channels". US-6/US-7/US-8 ✅. **US-3 not met**: spec requires the fired prompt "instructs the agent to use `send_message` to deliver" — `buildScheduledPrompt` says "Your reply will be automatically delivered… on ${origin_channel}" (`src/scheduler.ts` lines 309–312); no instruction to use `send_message` appears, and no `send_message` tool exists anywhere in the codebase. **US-5 not met as written**: spec precondition is "the agent runs, and calls `send_message`" — no such tool is registered, so the agent cannot call it; delivery occurs through orchestrator auto-routing in `_reply()`, not through a tool call.
focus:    `src/scheduler.ts` `buildScheduledPrompt` and absence of `send_message` tool anywhere in `src/extensions/` — both US-3 and US-5 hinge on this tool existing.

## Triage

✅ Safe to skip:  session-resume, memory-extension, messages-persistence, channel-context

⚠️  Worth a look:
- **unified-scheduling** — US-3 and US-5 both contract-require a `send_message` tool; it does not exist. `buildScheduledPrompt` tells the agent its reply will be "automatically delivered" rather than instructing it to call anything. Delivery works via orchestrator auto-routing, but the prescribed mechanism is absent from the contract's perspective.

---
