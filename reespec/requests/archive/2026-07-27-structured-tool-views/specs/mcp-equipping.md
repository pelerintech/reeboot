# MCP tool equipping — first concrete usage

## Capability: mcp proxy tool returns structured views

### Scenario: mcp list returns data-table
**GIVEN** the `mcp` proxy tool is registered  
**WHEN** the agent calls `mcp({ action: "list", server: "my-server" })`  
**THEN** the result includes `view: { type: 'data-table', columns: ['Name', 'Description'], rows: [...] }`  
**AND** each row corresponds to one tool from the MCP server

### Scenario: mcp call with structured result
**GIVEN** the `mcp` proxy tool is registered  
**WHEN** the agent calls `mcp({ action: "call", server: "my-server", tool: "get-data" })`  
**AND** the MCP server returns structured JSON  
**THEN** the result includes `view: { type: 'data-table', columns: [...], rows: [...] }`  
**AND** the table is rendered in WebChat

### Scenario: mcp call with unstructured result falls back
**GIVEN** the `mcp` proxy tool is registered  
**WHEN** the agent calls `mcp({ action: "call", server: "my-server", tool: "generate-text" })`  
**AND** the MCP server returns plain text  
**THEN** the result does not include a `view` field  
**AND** the text is rendered in the existing collapsible JSON card
