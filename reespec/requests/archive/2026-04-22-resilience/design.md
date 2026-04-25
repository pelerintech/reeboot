# Design: resilience

## Architecture overview

Resilience is implemented as four cooperating mechanisms, all backed by the existing `reeboot.db` SQLite file:

```
┌─────────────────────────────────────────────────────────────────┐
│                        reeboot.db                               │
│                                                                 │
│  turn_journal          ← open on turn start, deleted on success │
│  turn_journal_steps    ← one row per completed tool call        │
│  tasks (+ catchup col) ← existing table, new column            │
│  outage_events         ← declared outages with lost job refs    │
└─────────────────────────────────────────────────────────────────┘
         ↑                          ↑
  Orchestrator._runTurn       Scheduler._poll
  (journal write path)        (catchup + probe)
         ↑
  server.ts startup
  (recovery scan)
```

The four mechanisms:

1. **Turn journal** — captures every agent turn (tool calls + outputs) ephemerally in SQLite. An unclosed journal on startup = crash evidence.
2. **Startup recovery** — scans for unclosed journals, notifies all channels, applies the configured recovery policy.
3. **Scheduled task catchup** — on startup, fires missed tasks within the catchup window; skips those beyond it.
4. **Outage detection + self-healing probe** — counts consecutive failures per context; declares an outage, spawns an HTTP probe task, and surfaces lost jobs when the provider comes back.

---

## Turn journal

### Schema

Two tables added via a new `runResilienceMigration`:

```sql
CREATE TABLE IF NOT EXISTS turn_journal (
  turn_id      TEXT PRIMARY KEY,
  context_id   TEXT NOT NULL,
  session_path TEXT,
  prompt       TEXT,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  status       TEXT NOT NULL DEFAULT 'open'
  -- 'open' = in-flight or crashed; deleted on clean completion
);

CREATE TABLE IF NOT EXISTS turn_journal_steps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id      TEXT NOT NULL REFERENCES turn_journal(turn_id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  tool_name    TEXT NOT NULL,
  tool_input   TEXT NOT NULL,
  tool_output  TEXT,
  is_error     INTEGER NOT NULL DEFAULT 0,
  fired_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Write path — orchestrator._runTurn

The journal hooks into the existing `onEvent` callback in `_runTurn`. No new pi extension is needed — the orchestrator already receives `tool_call_start` / `tool_call_end` events from the runner:

```
_runTurn(contextId, msg):
  1. INSERT turn_journal (status='open', prompt=msg.content)
  2. runner.prompt(content, onEvent) where onEvent:
       on tool_call_end → INSERT turn_journal_steps (full input + output)
  3. On success → DELETE FROM turn_journal WHERE turn_id = ?
  4. On error / timeout → journal stays open (crash signal)
```

Steps are recorded on `tool_call_end` only (not `tool_call_start`) — we only need completed steps for recovery context.

### Detecting side effects

A step is classified as side-effectful if `tool_name` appears in `resilience.recovery.side_effect_tools` (config). This list is consulted at recovery time, not at record time.

---

## Startup recovery

Runs in `server.ts` **before** the scheduler starts and before the server begins accepting channel messages.

```
startup sequence:
  1. runResilienceMigration(db)
  2. recoverCrashedTurns(db, config, adapters)
     a. SELECT * FROM turn_journal WHERE status = 'open'
     b. For each unclosed journal:
        - load its steps
        - classify: safe (all read-only) vs unsafe (any side-effectful tool fired)
        - apply recovery.mode policy:
            safe_only → auto-resume if safe, notify+ask if unsafe
            always    → auto-resume regardless
            never     → notify+ask regardless
        - broadcast notification to all channels
  3. scheduledTaskCatchup(db, config)
  4. scheduler.start()
  5. server.listen()
```

### Recovery policy decisions

| mode | safe turn | unsafe turn |
|---|---|---|
| `safe_only` | auto-resume silently | notify user, ask whether to re-run |
| `always` | auto-resume | auto-resume (risk acknowledged) |
| `never` | notify user, ask | notify user, ask |

"Auto-resume" means re-queuing the original prompt into the orchestrator message queue once the server is ready. "Notify+ask" means sending a channel message listing what was interrupted and asking the user what to do.

---

## Scheduled task catchup

### Per-task catchup policy

A new `catchup` column is added to the `tasks` table (TEXT, nullable):

```
NULL         → use global resilience.scheduler.catchup_window (default '1h')
'always'     → always fire regardless of age
'never'      → skip if missed, wait for next window
'2h' / '30m' → custom window for this task
```

### Catchup algorithm (runs once at startup, before scheduler.start())

```
for each task WHERE status='active' AND next_run < now:
  missed_by = now - next_run
  window = resolveCatchupWindow(task.catchup, config)
  
  if window === 'always' OR missed_by <= window:
    mark task as due-now (set next_run = now)
    // scheduler poll will pick it up immediately
  else:
    advance next_run to next natural occurrence
    // task was too old, skip this fire
```

Deduplication is automatic: each task row is processed once regardless of how many natural fires were missed.

---

## Outage detection

### Consecutive failure counter

The orchestrator tracks per-context failure counts in memory (not persisted — resets on restart):

```typescript
private _consecutiveFailures = new Map<string, number>();
```

After each turn error in `_runTurn`:
- Check if the error is provider-related (HTTP 4xx/5xx from LLM API, or network timeout)
- If yes: increment `_consecutiveFailures.get(contextId)`
- If `>= outage_threshold` (config, default 3): call `_declareOutage(contextId)`
- On any successful turn: reset the counter for that context to 0

### Outage declaration

`_declareOutage(contextId)`:
1. INSERT into `outage_events` table (provider, declared_at, resolved_at=NULL)
2. Broadcast outage notification to all channels
3. Create a probe task in the scheduler (special `context_id = '__outage_probe__'`, schedule = probe_interval config)
4. Track any subsequently failed turns as `outage_lost_jobs` (stored in the outage_events row as JSON)

### outage_events schema

```sql
CREATE TABLE IF NOT EXISTS outage_events (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  declared_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT,
  lost_jobs    TEXT NOT NULL DEFAULT '[]'  -- JSON array of {contextId, prompt}
);
```

---

## Self-healing probe

The probe is a regular `tasks` row with `context_id = '__outage_probe__'`. The orchestrator's `handleScheduledTask` detects this special context and handles it without going through the agent runner:

```typescript
if (task.contextId === '__outage_probe__') {
  return this._runOutageProbe(task);
}
```

`_runOutageProbe`:
1. HTTP GET to provider health endpoint (e.g. `https://api.anthropic.com` — a simple connectivity check, no auth, no LLM call)
2. If response < 500 → provider is back → call `_resolveOutage()`
3. If failure → log quietly, probe fires again next interval

### Outage resolution

`_resolveOutage()`:
1. UPDATE `outage_events` SET `resolved_at = now`
2. Cancel the probe task (DELETE from tasks WHERE context_id = `'__outage_probe__'`)
3. Load `lost_jobs` from the outage_events row
4. Broadcast recovery notification to all channels, listing lost jobs
5. Clear `_consecutiveFailures` counter

---

## Broadcast notification utility

```typescript
// src/utils/broadcast.ts
export function broadcastToAllChannels(
  adapters: Map<string, ChannelAdapter>,
  text: string
): void
```

Sends `text` to all active channel adapters. Each adapter sends to its "system" peer (for web: all connected WebSocket clients; for WhatsApp/Signal: the owner peer if known, else skip). Used by startup recovery, outage declaration, and outage resolution.

---

## Config schema additions

New top-level `resilience` section in `config.ts`:

```typescript
const ResilienceRecoverySchema = z.object({
  mode: z.enum(['safe_only', 'always', 'never']).default('safe_only'),
  side_effect_tools: z.array(z.string()).default([]),
});

const ResilienceSchedulerSchema = z.object({
  catchup_window: z.string().default('1h'),
});

const ResilienceSchema = z.object({
  recovery: ResilienceRecoverySchema.default({}),
  scheduler: ResilienceSchedulerSchema.default({}),
  outage_threshold: z.number().int().min(1).default(3),
  probe_interval: z.string().default('1h'),
});
```

Added to `ConfigSchema` as `resilience: ResilienceSchema.default({})`.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Journal grows unbounded if turns never complete | Startup scan cleans up journals older than 24h as stale (not attempted for recovery) |
| Probe fires during outage but provider returns 200 transiently | Require 2 consecutive probe successes before declaring recovery |
| Auto-resume re-sends a duplicate message | Turn journal stores original prompt; orchestrator de-dupes if same message is already in session history |
| Catchup fires burst of tasks simultaneously | Tasks fire concurrently via `Promise.all` (existing behaviour) — no burst mitigation needed for typical deployments |
| outage_events lost_jobs grows large | Cap at 20 lost jobs; emit a "truncated" note in the recovery notification |
