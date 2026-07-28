## ADDED Requirements

### Requirement: Schedule type auto-detected from value string format
`detectScheduleType(value: string)` SHALL return `'once'` for ISO 8601 datetime strings, `'interval'` for human-friendly strings (`"hourly"`, `"daily"`, `"weekly"`, `"every N unit"`), and `'cron'` for everything else. It SHALL throw an error for cron strings that fail `cron-parser` validation.

#### Scenario: ISO datetime detected as once
- **WHEN** `detectScheduleType("2026-04-01T09:00:00Z")` called
- **THEN** returns `{ type: 'once' }`

#### Scenario: Aliases detected as interval
- **WHEN** `detectScheduleType("hourly")` called
- **THEN** returns `{ type: 'interval', normalizedMs: 3600000 }`

#### Scenario: "every 30m" detected as interval
- **WHEN** `detectScheduleType("every 30m")` called
- **THEN** returns `{ type: 'interval', normalizedMs: 1800000 }`

#### Scenario: "every 2h" detected as interval
- **WHEN** `detectScheduleType("every 2h")` called
- **THEN** returns `{ type: 'interval', normalizedMs: 7200000 }`

#### Scenario: "every 1d" detected as interval
- **WHEN** `detectScheduleType("every 1d")` called
- **THEN** returns `{ type: 'interval', normalizedMs: 86400000 }`

#### Scenario: Cron expression detected as cron
- **WHEN** `detectScheduleType("0 9 * * *")` called
- **THEN** returns `{ type: 'cron' }`

#### Scenario: Invalid string throws
- **WHEN** `detectScheduleType("not-a-schedule")` called
- **THEN** throws an error with descriptive message

### Requirement: computeNextRun returns ISO timestamp for cron and interval, null for once
`computeNextRun(task)` SHALL return `null` for `schedule_type = 'once'` (task completes after single run). For `'cron'` it SHALL use `cron-parser` to compute the next fire time after now. For `'interval'` it SHALL advance `task.next_run` by `normalizedMs`, skipping any past timestamps.

#### Scenario: Once returns null
- **WHEN** task has `schedule_type = 'once'`
- **THEN** `computeNextRun` returns `null`

#### Scenario: Cron returns next future time
- **WHEN** task has `schedule_type = 'cron'` and `schedule_value = "0 9 * * *"`
- **THEN** returns ISO string representing the next 9am occurrence after now

#### Scenario: Interval advances by fixed ms
- **WHEN** task has `schedule_type = 'interval'`, `normalized_ms = 3600000`, `next_run = "2026-01-01T08:00:00Z"`, and current time is `"2026-01-01T10:30:00Z"`
- **THEN** returns `"2026-01-01T11:00:00Z"` (skips 08:00, 09:00, 10:00 — first future slot)

#### Scenario: Interval skips multiple missed ticks
- **WHEN** task is 3 hours overdue with 1-hour interval
- **THEN** next_run is 1 interval in the future, not in the past
