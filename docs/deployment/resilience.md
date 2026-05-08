---
title: "Resilience"
description: "Crash recovery, outage detection, scheduler catchup, and restart notifications."
---

# Resilience

Reeboot is designed to recover gracefully from crashes, provider outages, and unexpected restarts. All resilience behaviour is configurable.

---

## Crash Recovery

Every agent turn is recorded in the `turn_journal` table before it starts. If reeboot crashes mid-turn, the open journal entry survives. On restart, reeboot detects these open entries and can automatically replay the affected turns.

### Recovery Modes

Configure how crashed turns are handled:

```json
{
  "resilience": {
    "recovery": {
      "mode": "safe_only",
      "side_effect_tools": ["send_email", "send_sms"]
    }
  }
}
```

| Mode | Behaviour |
|---|---|
| `"safe_only"` | Automatically replay turns that used no side-effect tools. Notify the user for turns that did use them. |
| `"always"` | Replay all crashed turns automatically, regardless of what tools were called. |
| `"never"` | Never replay crashed turns. Notify the user and let them decide. |

The `side_effect_tools` list identifies tools that should not be replayed automatically (e.g. tools that send messages, charge payments, or modify external state). Add any MCP tool names that have external side effects.

---

## Outage Detection

When reeboot receives consecutive provider errors (rate limits, API failures, connectivity issues), it declares a **provider outage** after `outage_threshold` failures.

During an outage:
- New turns are queued rather than executed
- Reeboot probes the provider at `probe_interval` to detect recovery
- When the provider responds, reeboot exits outage mode and processes the queue

```json
{
  "resilience": {
    "outage_threshold": 3,
    "probe_interval": "1h"
  }
}
```

---

## Scheduler Catchup

When reeboot restarts, it checks for scheduled tasks that were missed during downtime. Tasks within the `catchup_window` are replayed immediately. Tasks older than the window are skipped (their next natural run is scheduled instead).

```json
{
  "resilience": {
    "scheduler": {
      "catchup_window": "1h"
    }
  }
}
```

Individual tasks can override the global catchup behaviour by setting a `catchup` field when created:
- `"always"` — always fire regardless of age
- `"never"` — never catch up; advance to next natural run

---

## Restart Notification

When reeboot starts and detects a previous run (via a `reeboot_state` marker in the database), it sends a notification to the default channel announcing the restart. This lets you know if the agent went down unexpectedly.

On first startup, no notification is sent (no previous run marker exists).

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `resilience.recovery.mode` | string | `"safe_only"` | Crash recovery mode: `"safe_only"`, `"always"`, or `"never"`. |
| `resilience.recovery.side_effect_tools` | string[] | `[]` | Tool names considered unsafe to replay automatically. |
| `resilience.outage_threshold` | number | `3` | Consecutive failures before an outage is declared. |
| `resilience.probe_interval` | string | `"1h"` | How often to probe the provider during an active outage. |
| `resilience.scheduler.catchup_window` | string | `"1h"` | How far back to look for missed scheduled tasks on restart. |
