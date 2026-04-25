# Brief: resilience

## What

Make reeboot resilient to two classes of failure:

1. **Process crash / machine restart** — reeboot dies unexpectedly (internal error, OOM, container restart, machine reboot). On restart it recovers gracefully: conversation context is preserved, interrupted work is surfaced or resumed, scheduled tasks catch up, and the user is notified.

2. **Upstream dependency outage** — the LLM provider (or another upstream service) becomes unavailable. Reeboot detects this, notifies the user immediately, probes for recovery autonomously, and surfaces any work lost during the outage.

## Why

Currently a crash or outage is silent. In-flight agent turns vanish. Scheduled tasks that fired during downtime are skipped without notice. The user gets no response and has no way to know whether their request was received, partially executed, or lost entirely. For autonomous use cases (daily summaries, reminders, multi-step research) this is a serious reliability gap.

## Goals

### Layer 1 — Session continuity
- On restart, load the most recent session JSON (pi already serializes this) so conversation context is preserved within the inactivity window
- Detect if reeboot was previously running and notify the user via all configured channels: "I was restarted. If you were waiting on something, please re-send your request."
- Inspect the last session on restart and surface any apparent incomplete work (user message with no assistant response)

### Layer 2 — Ephemeral workflow journal
- Every agent turn — simple or complex — opens a per-turn journal in SQLite at turn start
- Every tool call within the turn is appended to the journal: tool name, full input, full output (no truncation), timestamp, status
- On successful turn completion the journal entry is deleted
- On startup, any unclosed journal entry signals a crashed turn
- Recovery behavior on crashed turn is policy-driven (see config below)

### Scheduled task recovery
- On restart, fire any task whose `next_run` was missed within a configurable catchup window (default: 1 hour)
- Skip tasks missed beyond that window — wait for the next natural scheduled time
- Never fire more than once per task per restart (deduplicate missed fires)
- Per-task override available: `catchup: "always" | "never" | "<duration>"`

### Upstream dependency failure
- After 3 consecutive failed turns due to provider unavailability (configurable via `resilience.outage_threshold`), declare an outage
- Notify the user immediately via all configured channels
- Create a self-healing probe job in the scheduler: a lightweight HTTP health check against the provider endpoint (no LLM call), running every hour until the provider responds
- On provider recovery: notify all channels, cancel the probe, and surface any tasks or turns that failed during the outage — let the user decide whether to re-run them
- Track failed-during-outage jobs separately from regular task failures so they can be surfaced on recovery

## Configuration

```json
"resilience": {
  "recovery": {
    "mode": "safe_only",
    "side_effect_tools": ["send_email", "post_slack", "publish_content"]
  },
  "scheduler": {
    "catchup_window": "1h"
  },
  "outage_threshold": 3,
  "probe_interval": "1h"
}
```

**Recovery modes:**
- `safe_only` (default) — auto-resume if only read/search tools fired in the crashed turn; ask the user if any side-effectful tool already ran
- `always` — auto-resume regardless; user accepts the risk of duplicate side effects
- `never` — always notify the user, never auto-resume automatically

The `side_effect_tools` list declares which tools are considered non-idempotent. MCP server tools that have side effects should be added here since they cannot be auto-classified.

## Non-goals

- Distributed state or external coordination service — all resilience state lives in the existing `reeboot.db` SQLite file
- Full workflow orchestration engine with declared steps — the journal captures emergence, not pre-declared plans
- Multi-provider fallback (if Anthropic is down, switch to OpenAI) — deferred; different providers have different capabilities and personas
- Message inbox for web channel during downtime — deferred; WhatsApp and Signal buffer at the protocol level, web channel gap is a separate concern
- Per-context journal isolation — all journals share one table, keyed by turn ID and context ID

## Impact

- Eliminates silent loss of user requests during crash/restart
- Autonomous scheduled tasks behave as continuous operations, not fragile one-shot executions
- LLM outages surface immediately instead of appearing as slow/broken sessions
- Gives operators a configurable resilience policy suited to their deployment risk tolerance
- Foundation for future observability features (structured audit log, analytics streaming) — the journal event stream can feed both
