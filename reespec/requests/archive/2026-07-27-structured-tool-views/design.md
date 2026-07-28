# Structured tool results — design

## Overview

Tools registered via `ExtensionAPI.registerTool()` can optionally return a `view` field alongside `content`. When present, the WebChat renders a rich React component matching the view type. When absent, the existing collapsible JSON card is used — fully backward compatible.

## Data flow

```
tool.run() returns { content, view }

  → ree-agent-loop.ts: TOOL_CALL_RESULT handler
    → onEvent({ type: 'tool_call_end', result, view, ... })
      → pi-runner.ts: tool_execution_end handler
        → onEvent({ type: 'tool_call_end', result, view, ... })

  → server.ts WS handler broadcasts tool_call_end with view payload

  → WebChat Chat.tsx receives view in ToolCallData
    → ToolCall.tsx checks tc.view.type
      → matches → renders rich component (<DataTable />, <DataChart />, etc.)
      → no match → renders existing collapsible JSON card (fallback)
```

## Integration points

### 1. ToolResult type (scheduler.ts)

Current:
```ts
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}
```

Change: Add optional `view` field. The view is a discriminated union. The exact type is defined once and shared between server and client.

### 2. ree-agent-loop.ts TOOL_CALL_RESULT

The `tool_call_end` event currently carries `result` and `isError`. The `view` field is passed through from the tool's return value. No transformation needed — pass-through.

### 3. pi-runner.ts tool_execution_end

Same pass-through: pi's `tool_execution_end` event carries the tool result. The `view` field, if present on the tool's return, is forwarded unchanged.

### 4. server.ts WS broadcast

The `tool_call_end` WS message currently includes `toolCallId`, `toolName`, `result`, `isError`. Add `view` field.

### 5. WebChat ToolCallData interface (Chat.tsx)

Add optional `view` field to `ToolCallData`.

### 6. WebChat ToolCall component (ToolCall.tsx)

Check `view?.type`. If recognized, render the matching widget component. If not recognized, fall back to current JSON card rendering.

### 7. New widget components

Create `webchat/src/components/`:
- `DataTable.tsx` — renders columns + rows as an HTML table with basic sorting
- `DataChart.tsx` — renders SVG bar/line charts from labels + values

## View type contract

```ts
type ViewType =
  | { type: 'data-table'; columns: string[]; rows: Record<string, unknown>[] }
  | { type: 'data-chart'; labels: string[]; values: number[]; kind?: 'bar' | 'line' }
  | { type: 'form'; fields: { name: string; label: string; type: 'text' | 'select' | 'number' }[] }
  | { type: 'confirm'; title: string; message: string; confirmLabel?: string; cancelLabel?: string };
```

Unknown types are silently ignored (fallback to JSON card). This makes the system forward-compatible — future requests can add new view types without breaking existing clients.

## First tool to equip: mcp proxy

The `mcp` proxy tool (`extensions/mcp-manager.ts`) currently returns JSON text. Two changes:

1. `mcp({ action: "list" })` returns `{ view: { type: 'data-table', columns: ['Name', 'Description'], rows: [...] } }`
2. `mcp({ action: "call" })` returns `{ view: { type: 'data-table', ... } }` when the result is structured, or falls back to text for unstructured responses

## Backward compatibility

- Tools that don't return `view` → existing JSON card rendering, no change
- Unknown `view.type` → existing JSON card rendering, no change
- WhatsApp/Signal channels → `view` field is ignored, `content` text is sent as before (text-only channel)
- The `ExtensionAPI.registerTool()` signature does not change

## Risks

- **View type proliferation**: Without discipline, view types could proliferate. Mitigation: view types are reviewed as part of the request process. Start with `data-table` and `data-chart` only.
- **SSE payload size**: Large structured views (thousands of rows) could bloat SSE messages. Mitigation: WebChat components can cap rendering (e.g., first 100 rows + "show more").
- **Inconsistent rendering across channels**: WhatsApp/Signal don't get rich views — they get text. This is acceptable and documented.
