---
title: "Scheduling"
description: "Persistent scheduled tasks, in-session timers, and the sleep interceptor."
---

# Scheduling

Reeboot includes a built-in scheduler that persists tasks across restarts and can route responses back to the correct channel. The agent can schedule tasks itself, or you can ask it to.

---

## `schedule_task` — Persistent Cron Jobs

The `schedule_task` tool creates a scheduled task stored in the database. It survives process restarts and is replayed on startup if missed within the catchup window.

```
schedule_task(
  prompt: "Check if the build passed and let me know",
  schedule: "every 30m",
  origin_channel: "whatsapp",
  origin_peer: "+15551234567"
)
```

**Interval syntax:**

| Example | Meaning |
|---|---|
| `"every 5m"` | Every 5 minutes |
| `"every 2h"` | Every 2 hours |
| `"daily"` | Once per day |
| `"0 9 * * 1-5"` | 9 AM on weekdays (cron) |
| `"in 30m"` | Once, 30 minutes from now |

**Channel routing:** when `origin_channel` and `origin_peer` are set, the scheduler's response is routed back to that channel and peer — so a task scheduled from WhatsApp responds on WhatsApp.

---

## In-Session Timer

The `timer` tool sets a **non-blocking one-shot** wait. It returns immediately and fires a new agent turn after the delay. Unlike `sleep`, it does not block the process.

```
timer(seconds: 300, message: "Check build status", id: "build-check")
```

| Parameter | Description |
|---|---|
| `seconds` | Delay in seconds (1–3600) |
| `message` | Message included in the wake-up turn |
| `id` | Optional: replaces any existing timer with the same ID |

---

## In-Session Heartbeat

The `heartbeat` tool starts a **periodic** non-blocking wake-up within the current session:

```
heartbeat(action: "start", interval_seconds: 60, message: "Check for updates")
heartbeat(action: "stop")
heartbeat(action: "status")
```

Only one heartbeat is active per session. Starting a new one replaces the previous.

---

## Sleep Interceptor

Reeboot intercepts `sleep` commands in bash when sleep is the sole or last command in a chain. This prevents the agent from accidentally blocking the process.

| Command | Outcome |
|---|---|
| `sleep 60` | ❌ Blocked — use `timer(60, "message")` instead |
| `npm build && sleep 60` | ❌ Blocked — sleep is last in chain |
| `sleep 2 && npm start` | ✅ Allowed — sleep is not last |
| `npm build \|\| sleep 5` | ✅ Allowed — `\|\|` chain, sleep has a purpose |

Disable the interceptor:

```bash
REEBOOT_SLEEP_INTERCEPTOR=0 reeboot start
```

---

## Scheduler Catchup

When reeboot restarts, it checks for scheduled tasks that were missed during downtime. Tasks within the catchup window are replayed; older ones are skipped.

Configure the window in `~/.reeboot/config.json`:

```json
{
  "resilience": {
    "scheduler": { "catchup_window": "1h" }
  }
}
```

---

## CLI

```bash
reeboot tasks due    # list overdue scheduled tasks
```

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `heartbeat.enabled` | boolean | `false` | Enable the system-level heartbeat (separate from in-session heartbeat tool). |
| `heartbeat.interval` | string | `"every 5m"` | System heartbeat interval. |
| `heartbeat.contextId` | string | `"main"` | Context the system heartbeat runs in. |
| `resilience.scheduler.catchup_window` | string | `"1h"` | How far back to look for missed tasks on restart. |
| `extensions.core.scheduler_tool` | boolean | `true` | Toggle the scheduler/timer/heartbeat tools. |
