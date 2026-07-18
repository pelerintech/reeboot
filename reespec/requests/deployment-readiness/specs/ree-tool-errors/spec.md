# Spec — ree-tool-errors (WS-A4)

Tool execution errors are surfaced (not reported as success) in ree.

## S1 — a failing reeboot tool propagates isError
- **GIVEN** a registered tool whose `execute` returns `{ content: 'kaboom', isError: true }`
- **WHEN** the model calls that tool during a ree `prompt()`
- **THEN** the emitted `tool_result` extension event has `isError: true`, and the `tool_call_end`
  RunnerEvent has `isError: true`.

## S2 — toTanStackTool signals the error to the engine
- **GIVEN** the same tool
- **WHEN** `toTanStackTool(tool, ctx).execute(...)` is invoked and the tool returns `isError: true`
- **THEN** the wrapped execute rejects/throws (so TanStack marks the result `state: 'output-error'`).

## S3 — a successful tool still reports isError false
- **GIVEN** a tool returning `{ content: 'ok' }` (no isError)
- **WHEN** it is called
- **THEN** the emitted result has `isError: false` (no regression).
