# Tasks — structured tool views

---

### 1. Define ToolView type and add to ToolResult

- [x] **RED** — Write `reeboot/tests/structured-views/view-type.test.ts`: assert that `ToolResult` type does not have a `view` field. Assert that a `ToolView` discriminated union type exists with at least `data-table` discriminant. Run test → fails (no type defined yet).
- [x] **ACTION** — Define `ToolView` discriminated union type in `reeboot/src/types.ts` (or in a new `reeboot/src/structured-views.ts`). Add optional `view?: ToolView` to `ToolResult` interface in `reeboot/src/scheduler.ts`. Export both types.
- [x] **GREEN** — Run the test → passes. Run `npm run build` → TypeScript compiles without errors.

### 2. Pass view through ree-agent-loop TOOL_CALL_RESULT

- [x] **RED** — Write `reeboot/tests/structured-views/view-propagation.test.ts`: mock a tool returning a result with a `view` field, run it through the agent loop, assert the `tool_call_end` event carries the `view` payload. Test fails — view is not propagated.
- [x] **ACTION** — In `reeboot/src/runtime/ree-agent-loop.ts`, the `TOOL_CALL_RESULT` handler: read `view` from the tool's return value (passed through from TanStack's chunk), include it in the `onEvent({ type: 'tool_call_end', ... })` call alongside `result` and `isError`.
- [x] **GREEN** — Run the test → passes. Run `npm run build` → compiles.

### 3. Pass view through pi-runner tool_execution_end

- [x] **RED** — Write `reeboot/tests/structured-views/pi-view-propagation.test.ts`: spy on pi-runner's `onEvent` callback, mock pi's `tool_execution_end` event with a result containing a `view` field, assert the emitted `tool_call_end` RunnerEvent includes `view`. Test fails.
- [x] **ACTION** — In `reeboot/src/agent-runner/pi-runner.ts`, the `tool_execution_end` handler: read `view` from `event.result` if present, include it in the emitted `tool_call_end` RunnerEvent.
- [x] **GREEN** — Run the test → passes. Run `npm run build` → compiles.

### 4. Pass view through server.ts WS broadcast

- [x] **RED** — Write `reeboot/tests/structured-views/ws-view-propagation.test.ts`: mock a `tool_call_end` RunnerEvent with a `view` field passing through the WS handler, assert the WS message to the client includes `view`. Test fails.
- [x] **ACTION** — In `reeboot/src/server.ts`, the `tool_call_end` WS message serialization: add `view` field from the event payload to the outgoing WS message object.
- [x] **GREEN** — Run the test → passes.

### 5. Update WebChat ToolCallData interface

- [x] **RED** — Check: `reeboot/webchat/src/pages/Chat.tsx` — `ToolCallData` interface does not have a `view` field. Assertion fails — field is absent.
- [x] **ACTION** — Add optional `view?: { type: string; [key: string]: unknown }` to `ToolCallData` interface in `Chat.tsx`. Update all message event handlers that create `ToolCallData` objects (tool_call_start, tool_call_end) to pass through the `view` field from the WS event.
- [x] **GREEN** — Verify: `ToolCallData` interface now has `view` field. Run `npm run build:webchat` — TypeScript compiles.

### 6. Update ToolCall component to render view-aware

- [x] **RED** — Write `reeboot/webchat/src/components/__tests__/ToolCall.test.tsx`: render `ToolCall` with a `view` prop of type `data-table`, assert that a `<table>` element appears in the output. Render without `view`, assert that the JSON card (pre element) appears. Test fails — ToolCall ignores view.
- [x] **ACTION** — Update `ToolCall.tsx` to accept optional `view` prop. Add a switch on `view?.type` that renders `<DataTable>` for `data-table`, `<DataChart>` for `data-chart`, and falls back to current JSON card for all other cases (including undefined/unknown).
- [x] **GREEN** — Run the test → passes. Run `npm run build:webchat` → compiles.

### 7. Create DataTable widget component

- [x] **RED** — Write `reeboot/webchat/src/components/__tests__/DataTable.test.tsx`: render `DataTable` with columns + rows, assert table headers and row cells render. Render with 500 rows, assert only 100 rows + "Show 400 more" button render. Test fails — component doesn't exist.
- [x] **ACTION** — Create `reeboot/webchat/src/components/DataTable.tsx` that accepts `columns: string[]` and `rows: Record<string, unknown>[]`. Renders an HTML table with sortable column headers, capped at 100 visible rows with a "Show N more" toggle.
- [x] **GREEN** — Run the test → passes.

### 8. Create DataChart widget component

- [x] **RED** — Write `reeboot/webchat/src/components/__tests__/DataChart.test.tsx`: render `DataChart` with labels + values + kind='bar', assert SVG elements render. Render with empty arrays, assert "No data" message. Render with kind='line', assert line SVG elements. Test fails — component doesn't exist.
- [x] **ACTION** — Create `reeboot/webchat/src/components/DataChart.tsx` that accepts `labels: string[]`, `values: number[]`, `kind: 'bar' | 'line'`. Renders inline SVG chart with labeled axes.
- [x] **GREEN** — Run the test → passes.

### 9. Equip mcp proxy tool with structured views

- [x] **RED** — Write `reeboot/tests/structured-views/mcp-views.test.ts`: call `mcpManagerExtension`'s registered tool with `{ action: "list" }`, assert the returned result includes a `view` field of type `data-table`. Call with `{ action: "call" }` on a mock server returning structured JSON, assert result includes `view`. Call with unstructured result, assert no `view` field. Test fails.
- [x] **ACTION** — In `reeboot/src/extensions/mcp-manager.ts`, the mcp proxy tool's `execute` function: for `action: "list"`, format tool list as a `data-table` view. For `action: "call"`, attempt to parse the tool result as structured data; if it's an array of objects, return as `data-table`; otherwise, return without `view` (text fallback).
- [x] **GREEN** — Run the test → passes. Run `npm run build` → compiles.
