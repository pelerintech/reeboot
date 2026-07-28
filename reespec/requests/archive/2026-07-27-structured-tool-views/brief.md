# Structured tool results for rich WebChat rendering

## Goals

Let tools return results with an optional structured `view` field that the WebChat renders as rich interactive components (data tables, charts, forms, confirmations) instead of generic collapsible JSON cards. The pattern is inspired by Agent-Native's "Native Chat UI" (`data-table`, `data-chart`, `data-insights` built-in discriminants), but adapted to reeboot's existing architecture where `registerTool()` is the primary capability definition mechanism — no new abstraction layer.

## Non-goals

- Not changing `ExtensionAPI.registerTool()` signature
- Not adding auto-generated React hooks (no `useActionQuery`/`useActionMutation`)
- Not replacing pi or ree SDK adapters
- Not rewriting the WebChat SPA — components slot into the existing `ToolCall` rendering pipeline
- Not adding a new `defineAction` abstraction layer

## Impact

Currently, tool results arrive in WebChat as raw text inside a collapsible JSON card via the `ToolCall` component. The user sees unformatted JSON. The agent has no way to present structured data (tables, charts, forms) natively in the chat.

After this change, a tool's `run` function can optionally return a `view` object:

```ts
return {
  content: [{ type: 'text', text: '3 leads found' }],
  view: {
    type: 'data-table',
    columns: ['Name', 'Email', 'Company'],
    rows: [
      { Name: 'Alice', Email: 'alice@c.com', Company: 'Corp' },
      { Name: 'Bob', Email: 'bob@c.com', Company: 'Inc' },
    ],
  },
};
```

The `tool_call_end` event carries the `view` field through the WS/SSE pipeline. The WebChat `ToolCall` component switches on `view.type` and renders the matching rich component. Tools that don't return a `view` render the existing JSON card — fully backward compatible.

The first concrete tool to equip is the `mcp` proxy tool: `mcp({ action: "list" })` returns a data-table of available tools, and `mcp({ action: "call", ... })` can return structured results.

## Discovery summary

Analysis of BuilderIO/agent-native's `defineAction` → `useActionQuery`/`useActionMutation` pattern showed their approach is architecturally inverted relative to reeboot: they auto-generate React hooks from action definitions, making UI and agent equal consumers of a shared action surface. Reeboot's architecture treats `registerTool()` as the primary capability mechanism, with WebChat as a downstream renderer.

Option A (full Agent-Native pattern, `defineAction` abstraction) was rejected — too much architectural change, reeboot's pi/ree runtimes are sufficient. Option B (structured result types with `view` hint) was chosen — minimal change, backward compatible, tools remain the single source of truth.

## Key design decisions (to confirm in plan phase)

- Tool `run()` functions return an optional `view` field alongside `content` — no change to the `ToolResult` type shape, just an extension
- The `view` discriminant type is a string union: `'data-table' | 'data-chart' | 'form' | 'confirm'` (extensible, like Agent-Native's discriminants)
- Each discriminant has its own data contract (columns+rows for table, labels+values for chart, fields for form)
- Unknown `view.type` falls back to current JSON card — forward compatible
- The `tool_call_end` SSE event carries the `view` payload through unchanged
- First widget: `DataTable` — renders the MCP tool listing as a sortable table
- Second widget: `DataChart` — renders simple bar/line charts from tool results
