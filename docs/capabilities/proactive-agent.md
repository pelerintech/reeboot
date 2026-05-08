---
title: "Proactive Agent"
description: "System heartbeat, in-session timers, and the sleep interceptor — how reeboot acts without being asked."
---

# Proactive Agent

Reeboot can act without being prompted. There are three mechanisms: the system heartbeat (scheduled wake-ups), in-session timers (one-shot delays), and the in-session heartbeat (periodic wake-ups during a session).

---

## System Heartbeat

The system heartbeat fires on a configurable schedule and dispatches a prompt to the agent. If the agent determines it has nothing to do, it responds with `IDLE` — which is silently suppressed. Otherwise, the response is sent to the default channel.

Enable in `~/.reeboot/config.json`:

```json
{
  "heartbeat": {
    "enabled": true,
    "interval": "every 30m",
    "contextId": "main"
  }
}
```

The heartbeat prompt includes the current time and any overdue scheduled tasks. The agent decides what (if anything) to do.

---

## In-Session Timer Tool

The `timer` tool sets a one-shot non-blocking delay. It returns immediately — the process is not blocked — and fires a new agent turn after the specified delay.

```
timer(seconds: 300, message: "Check if the deploy finished", id: "deploy-check")
```

| Parameter | Range | Description |
|---|---|---|
| `seconds` | 1–3600 | Delay in seconds |
| `message` | string | Included in the wake-up prompt |
| `id` | string (optional) | Replaces any existing timer with the same ID |

---

## In-Session Heartbeat Tool

The `heartbeat` tool starts a periodic non-blocking wake-up within the current session:

```
heartbeat(action: "start", interval_seconds: 60, message: "Poll for updates")
heartbeat(action: "stop")
heartbeat(action: "status")
```

Only one heartbeat is active per session. Starting a new one replaces the previous. Interval range: 10–3600 seconds.

---

## Sleep Interceptor

When the agent uses `bash` to run a `sleep` command as the sole or last command in a chain, reeboot intercepts it and redirects to `timer`. This prevents the agent from blocking the process for long periods.

| Command | Outcome |
|---|---|
| `sleep 60` | ❌ Blocked — use `timer(60, "message")` |
| `npm build && sleep 60` | ❌ Blocked — sleep is last in chain |
| `sleep 2 && npm start` | ✅ Allowed — sleep is not the last command |
| `npm build \|\| sleep 5` | ✅ Allowed — conditional chain |

Disable the interceptor for a session:

```bash
REEBOOT_SLEEP_INTERCEPTOR=0 reeboot start
```

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `heartbeat.enabled` | boolean | `false` | Enable the system heartbeat. |
| `heartbeat.interval` | string | `"every 5m"` | Heartbeat interval. Accepts human-friendly strings or cron expressions. |
| `heartbeat.contextId` | string | `"main"` | Which context the heartbeat runs in. |
