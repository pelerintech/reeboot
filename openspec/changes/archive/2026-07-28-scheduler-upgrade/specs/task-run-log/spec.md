## ADDED Requirements

### Requirement: task_runs table records every task execution
Every time a task fires, a row SHALL be inserted into `task_runs` with: `task_id`, `run_at` (ISO timestamp), `duration_ms`, `status` (`'success'` or `'error'`), `result` (last 200 chars of agent output, or null on error), `error` (error message, or null on success).

#### Scenario: Successful run logged
- **WHEN** task runs and agent produces output "Hello, I checked your emails."
- **THEN** `task_runs` row inserted with `status='success'`, `result='Hello, I checked your emails.'`, `error=null`, valid `duration_ms`

#### Scenario: Failed run logged
- **WHEN** task run throws an error "AgentRunner timeout"
- **THEN** `task_runs` row inserted with `status='error'`, `error='AgentRunner timeout'`, `result=null`

#### Scenario: Result truncated to 200 chars
- **WHEN** agent output is 500 chars long
- **THEN** `task_runs.result` contains exactly the last 200 chars

### Requirement: last_result column on tasks updated after each run
After every run, the `tasks.last_result` column SHALL be updated to the last 200 chars of the agent output (or the error message on failure).

#### Scenario: last_result updated on success
- **WHEN** task runs successfully
- **THEN** `tasks.last_result` contains the last 200 chars of output

#### Scenario: last_result updated on failure
- **WHEN** task fails
- **THEN** `tasks.last_result` contains the error message string
