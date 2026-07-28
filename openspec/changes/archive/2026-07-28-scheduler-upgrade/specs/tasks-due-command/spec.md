## ADDED Requirements

### Requirement: /tasks slash command with due subcommand available in-chat
The scheduler extension SHALL register a `/tasks` slash command. When called as `/tasks due`, it SHALL list all tasks where `status='active'` and `next_run <= now`, formatted for readability. When called with no subcommand, it SHALL list all active tasks.

#### Scenario: /tasks due shows overdue tasks
- **WHEN** agent calls `/tasks due` and 2 tasks are overdue
- **THEN** both tasks are shown with their schedule and how long overdue

#### Scenario: /tasks due — nothing overdue
- **WHEN** `/tasks due` called and no tasks are overdue
- **THEN** returns "No overdue tasks."

#### Scenario: /tasks lists all active tasks
- **WHEN** `/tasks` called with 3 active tasks
- **THEN** all 3 shown with id, schedule, next_run

### Requirement: reeboot tasks due CLI command lists overdue tasks
The `reeboot tasks due` CLI subcommand SHALL query the DB and print all tasks with `status='active'` and `next_run <= now`, formatted with task id, prompt (truncated to 60 chars), schedule, and how long overdue.

#### Scenario: CLI shows overdue tasks
- **WHEN** `reeboot tasks due` run with 1 overdue task
- **THEN** output includes task id, truncated prompt, schedule string, overdue duration

#### Scenario: CLI — no overdue tasks
- **WHEN** `reeboot tasks due` run with no overdue tasks
- **THEN** prints "No overdue tasks." and exits 0
