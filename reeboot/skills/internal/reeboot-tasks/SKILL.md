---
name: reeboot-tasks
description: Manage the reeboot agent's own scheduled tasks — create, list, pause, resume, and cancel scheduled jobs. Use when setting up recurring tasks, one-time reminders, or managing the agent's task schedule.
---

# Reeboot Tasks

Meta-skill for the agent to manage its own scheduler. Uses the built-in scheduler tools registered by the scheduler-tool extension.

## Setup

No external dependencies. The scheduler is built into reeboot.

The following tools are available when the scheduler-tool extension is enabled:
- `schedule_task` — create a new scheduled task
- `list_tasks` — list all scheduled tasks
- `cancel_task` — cancel a scheduled task by ID
- `pause_task` — pause a scheduled task (stops it from running without deleting)
- `resume_task` — resume a paused task

Verify tools are available by asking: "What tools do you have access to?" — the scheduler tools should appear in the list.

## Usage

### Schedule formats

**Cron expressions** (standard 5-field cron):
```
0 9 * * 1-5    # Every weekday at 9 AM
0 */2 * * *    # Every 2 hours
30 8 * * 1     # Every Monday at 8:30 AM
0 0 1 * *      # First day of each month at midnight
```

**Interval expressions**:
```
every 30m      # Every 30 minutes
every 2h       # Every 2 hours
every 1d       # Every day
every 15m      # Every 15 minutes
```

**One-time expressions**:
```
in 1h          # In 1 hour from now
in 30m         # In 30 minutes
in 2d          # In 2 days
```

### Tool usage

```
# Schedule a recurring task
schedule_task({
  name: "daily-standup-reminder",
  schedule: "0 9 * * 1-5",
  prompt: "Send a standup reminder to the team on WhatsApp"
})

# Schedule a one-time reminder
schedule_task({
  name: "meeting-reminder",
  schedule: "in 45m",
  prompt: "Remind me that the client call starts in 15 minutes"
})

# List all tasks
list_tasks()

# Pause a task
pause_task({ id: "task-id-here" })

# Resume a paused task
resume_task({ id: "task-id-here" })

# Cancel a task permanently
cancel_task({ id: "task-id-here" })
```

### Example flows

```
User: "Remind me to check my email every weekday morning at 8 AM"
→ schedule_task({
    name: "morning-email-check",
    schedule: "0 8 * * 1-5",
    prompt: "Remind the user to check their email"
  })
→ "Done — I'll remind you every weekday at 8 AM."

User: "What tasks do I have scheduled?"
→ list_tasks()
→ Present results in a readable format

User: "Cancel the standup reminder"
→ list_tasks() to find the ID
→ cancel_task({ id: "<id>" })
```
