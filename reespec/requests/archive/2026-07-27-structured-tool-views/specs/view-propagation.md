# View propagation — tool result to WebChat rendering

## Capability: tool result with view field reaches WebChat and renders as rich component

### Scenario: tool returns data-table view
**GIVEN** a tool registered via `ExtensionAPI.registerTool()`  
**WHEN** its `run` function returns `{ content: [...], view: { type: 'data-table', columns: ['Name'], rows: [{ Name: 'Alice' }] } }`  
**THEN** the `tool_call_end` WS event to WebChat includes a `view` field matching the return value  
**AND** the `ToolCall` component renders a `<DataTable>` with the provided columns and rows  
**AND** no generic JSON card is shown for that tool call

### Scenario: tool returns data-chart view
**GIVEN** a tool registered via `ExtensionAPI.registerTool()`  
**WHEN** its `run` function returns `{ content: [...], view: { type: 'data-chart', labels: ['A', 'B'], values: [10, 20], kind: 'bar' } }`  
**THEN** the `ToolCall` component renders a `<DataChart>` with the provided labels and values

### Scenario: tool returns no view field (backward compatibility)
**GIVEN** a tool registered via `ExtensionAPI.registerTool()`  
**WHEN** its `run` function returns `{ content: [{ type: 'text', text: 'Hello' }] }` (no `view` field)  
**THEN** the `tool_call_end` WS event does not include a `view` field  
**AND** the `ToolCall` component renders the existing collapsible JSON card with the result text

### Scenario: tool returns unknown view type (forward compatibility)
**GIVEN** a tool registered via `ExtensionAPI.registerTool()`  
**WHEN** its `run` function returns `{ content: [...], view: { type: 'future-widget', ... } }` (type not yet implemented)  
**THEN** the `ToolCall` component renders the existing collapsible JSON card  
**AND** no error is thrown

### Scenario: WhatsApp/Signal channel ignores view
**GIVEN** a tool returns a result with a `view` field  
**WHEN** the result is sent through the WhatsApp or Signal channel adapter  
**THEN** only the `content` text is delivered  
**AND** the `view` field is ignored (no change to text-only channels)
