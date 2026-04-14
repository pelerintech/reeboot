# Spec: System Prompt Injection

## Capability
When MCP servers are configured, `mcp-manager` injects a usage snippet into the system prompt via `before_agent_start`. When no servers are configured, nothing is injected.

---

## Scenarios

### GIVEN mcp.servers contains two servers ["postgres", "github"]
WHEN `before_agent_start` fires
THEN the returned systemPrompt contains the string "postgres" and "github"
AND contains the string "mcp"
AND contains example usage of action: "list" and action: "call"

### GIVEN mcp.servers is empty
WHEN `before_agent_start` fires
THEN the handler returns undefined (no system prompt modification)
