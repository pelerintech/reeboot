## Evaluation — 2025-07-27 06:01

### view-propagation
verdict:  ⚠️ PARTIAL
reason:   spec says "the `tool_call_end` WS event to WebChat includes a `view` field" and the
          `ToolResult` interface should carry the optional `view` — the pi-runner extracts
          `view` via duck-typing (`'view' in toolResult`) and the RunnerEvent type *does*
          include an optional `view` field (`interface.ts` line 14), but the foundational
          `ToolResult` interface in `extension-api.ts` (line 49) does NOT define a `view`
          property. This means view propagation depends on pi's SDK preserving extra
          properties through serialization, which is not guaranteed by the type contract.
          WhatsApp/Signal channel ignoring: architecturally satisfied (text channels only
          receive `MessageContent`, not RunnerEvents), but no explicit test or code path
          asserts view is stripped.
focus:    `src/extensions/extension-api.ts` — add `view?: ToolView` to `ToolResult` interface

### data-table-widget
verdict:  ✅ SATISFIED
reason:   spec requires columns+headers, empty state ("No rows"), 100-row cap with "Show N
          more" button — all implemented in `webchat/src/components/DataTable.tsx` and
          verified by tests in `DataTable.test.tsx` (5 tests, all pass)

### data-chart-widget
verdict:  ⚠️ PARTIAL
reason:   spec says "SVG bar chart with labeled axes" and "SVG line chart with labeled axes"
          — `DataChart.tsx` renders bar rects/line paths with X-axis labels but the Y-axis
          has no numeric scale labels (only a grid line). The Y-axis is unlabeled, so
          "labeled axes" is only half-met. Empty state "No data to display" is present.
focus:    `webchat/src/components/DataChart.tsx` — add Y-axis value labels/tick marks

### mcp-structured-views
verdict:  ✅ SATISFIED
reason:   spec requires `mcp({ action: "list" })` returns data-table view, `mcp({ action:
          "call" })` with structured JSON returns data-table view, and unstructured result
          falls back to no view — all three tested in `mcp-views.test.ts` (3 tests, all
          pass). Implementation in `mcp-manager.ts` handles all branches correctly.

### forward-compatibility
verdict:  ✅ SATISFIED
reason:   spec requires unknown `view.type` to fall back to JSON card without error —
          `ToolCall.tsx` line 25–33 passes control to the default collapsible card for
          unrecognised types, tested in `ToolCall.test.tsx` ("renders fallback JSON card
          when view type is unknown", passes)

### backward-compatibility
verdict:  ✅ SATISFIED
reason:   spec requires tools without a `view` field render the existing JSON card —
          `ToolCall.tsx` only renders <DataTable>/<DataChart> on explicit `view.type`
          matches, defaulting to the collapsible card. Tested in `ToolCall.test.tsx`
          ("renders fallback JSON card when no view provided", passes)

---

## Triage

✅ Safe to skip:   data-table-widget, mcp-structured-views, forward-compatibility, backward-compatibility
⚠️  Worth a look:  view-propagation — `ToolResult` interface lacks `view` property, propagation depends on duck-typing through pi SDK internals rather than a typed contract
⚠️  Worth a look:  data-chart-widget — Y-axis has no numeric scale labels despite spec requiring "labeled axes"
❓  Human call:    (none)

---

## Evaluation — 2026-07-27 10:49

### mcp proxy tool returns structured views
verdict:  ✅ SATISFIED
reason:   `reeboot/src/extensions/mcp-manager.ts` `execute()` returns `view: { type: 'data-table', columns: ['Name','Description'], rows }` for `action: "list"` (matching the spec's columns), parses structured JSON arrays from `action: "call"` into a table view, and omits `view` for unstructured text. All three scenarios covered by `reeboot/tests/structured-views/mcp-views.test.ts` (3/3 pass).

### tool result with view field reaches WebChat and renders as rich component
verdict:  ✅ SATISFIED
reason:   `reeboot/src/agent-runner/pi-runner.ts:170-180` extracts `view` from the tool result and emits it on the `tool_call_end` event; `reeboot/src/orchestrator.ts:427-428` forwards via `presenceAdapter.sendEvent`; `reeboot/src/server.ts:782-783` serializes the event to WS; `reeboot/webchat/src/components/ToolCall.tsx` switches on `view.type` rendering `DataTable`/`DataChart` directly (early return, no JSON card) and falls back for absent/unknown types. WhatsApp/Signal adapters (`reeboot/src/channels/whatsapp.ts`, `signal.ts`) define no `sendEvent`, so the orchestrator's `typeof sendEvent === 'function'` guard never forwards `view` to them — only text reaches text-only channels. Covered by `view-propagation.test.ts`, `ws-view-propagation.test.ts`, `pi-view-propagation.test.ts`, and `ToolCall.test.tsx`.

### DataTable renders columns + rows
verdict:  ✅ SATISFIED
reason:   `reeboot/webchat/src/components/DataTable.tsx` renders headers from `columns`, an empty-state message "No rows" when `rows.length === 0`, and caps at `MAX_VISIBLE_ROWS = 100` with a `Show {remaining} more` button (`remaining = rows.length - 100`, e.g. 500 rows → "Show 400 more"). All three scenarios in `DataTable.test.tsx` pass.

### DataChart renders SVG chart
verdict:  ✅ SATISFIED
reason:   `reeboot/webchat/src/components/DataChart.tsx` renders an `<svg>` with `<rect>` bars for `kind: 'bar'`, a `<path>` + `<circle>` points for `kind: 'line'`, labeled X/Y axes, and an empty-state message "No data to display". All three scenarios in `DataChart.test.tsx` pass.

## Triage

✅ All capabilities satisfied — no action required.

---

## Evaluation — 2026-07-27 12:13

### mcp-proxy-structured-views
verdict:  ✅ SATISFIED
reason:   `specs/mcp-equipping.md` requires `mcp({ action: "list" })` to return a `data-table` of tools, `mcp({ action: "call" })` with structured JSON to return a `data-table`, and unstructured text to omit `view`. `reeboot/src/extensions/mcp-manager.ts` (lines 298–299, 321–346) returns `{ type: 'data-table', columns: ['Name', 'Description'], rows: tools }` for `list`, parses JSON arrays into a table for `call`, and omits `view` for plain text. All three scenarios are exercised by `reeboot/tests/structured-views/mcp-views.test.ts` (3/3 pass).

### tool-result-view-propagation
verdict:  ✅ SATISFIED
reason:   `specs/view-propagation.md` defines five scenarios. `reeboot/src/agent-runner/pi-runner.ts` (lines 170–180) extracts `view` from the tool result and emits it on the `tool_call_end` event; the event type is declared with an optional `view` field in `src/agent-runner/interface.ts` (line 8); `WebAdapter.sendEvent` forwards it unchanged (`ws-view-propagation.test.ts`, 3/3 pass). `ToolCall.tsx` switches on `view.type` to render `<DataTable>`/`<DataChart>` and falls back to the JSON card for missing or unknown types (`ToolCall.test.tsx` covers data-table, data-chart, no-view, and unknown-type fallbacks, 4/4 pass). The WhatsApp/Signal scenario is structurally satisfied — `src/channels/whatsapp.ts` (line 345) and `src/channels/signal.ts` (line 304) consume only `content.text` and never reference `view` — though no explicit test asserts this.

### datatable-rendering
verdict:  ✅ SATISFIED
reason:   `specs/widget-components.md` requires headers+rows, an empty-state "No rows" message, and a 100-row cap with a "Show N more" button. `reeboot/webchat/src/components/DataTable.tsx` renders `<thead>` from `columns`, emits "No rows" when `rows.length === 0`, sets `MAX_VISIBLE_ROWS = 100`, and shows a `Show {remaining} more` button. `DataTable.test.tsx` asserts all three scenarios (empty state, 150-row cap → "Show 50 more", expand-on-click), 5/5 pass.

### datachart-rendering
verdict:  ✅ SATISFIED
reason:   `specs/widget-components.md` requires bar and line SVG charts with labeled axes plus a "No data to display" empty state. `reeboot/webchat/src/components/DataChart.tsx` renders an `<svg>` with `<rect>` bars for `kind: 'bar'` and a `<path>`+circles for `kind: 'line'`, draws Y-axis tick labels via `formatValue` and X-axis labels from `labels`, and returns "No data to display" when `labels`/`values` are empty. `DataChart.test.tsx` asserts bar, line, and empty-state scenarios, 3/3 pass.

## Triage

✅ All capabilities satisfied — no action required.

---
