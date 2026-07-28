# Delegate tool + A2A protocol — design

## Overview

Two capabilities in one request:

1. **Delegate tool** (same-process) — a tool registered via `ExtensionAPI.registerTool()` that creates a sub-agent session to execute a sub-task. SDK-agnostic: works identically on both pi and ree runtimes.
2. **A2A protocol** (HTTP) — cross-process agent communication where reeboot instances discover and delegate tasks to each other over HTTP.

## Part 1: Delegate tool (same-process)

### Data flow

```
agent calls delegate({ task: "Research topic X", context: { ... } })

  → delegate tool handler (new extension)
    → creates a new AgentRunner session (pi or ree, matching the main agent's SDK)
    → injects task as the user message
    → runs the agent loop to completion
    → collects the final response
    → returns result to the calling agent
```

### SDK agnosticism

The delegate tool does not know about pi or ree directly. It uses the `AgentRunner` interface (already defined in `src/agent-runner/interface.ts`). The same interface is implemented by both `PiAgentRunner` and the ree runner. The delegate tool creates a new runner instance matching the main agent's SDK mode.

### Sub-agent configuration

- Inherits the main agent's model, provider, and tool set
- Gets its own system prompt: "You are a sub-agent. Your task is: <task>. Complete it and return a concise result."
- Has access to the same tool set as the main agent (configurable: can be the full set or a subset)
- Runs until completion (not streaming — result is collected as a single response)
- Results are returned as structured text, compatible with the structured tool views system (request `structured-tool-views`)

### Isolation

- Sub-agent runs in the same process but with its own session state
- No cross-contamination of conversation history between main and sub-agent
- Sub-agent has a configurable timeout (default: 60s) to prevent runaway execution

## Part 2: A2A protocol (HTTP)

### Protocol design

```
Discovery:
  GET /a2a/capabilities
  → { name: "reeboot", version: "2.6.0", tools: ["delegate", "search", ...], models: ["claude-sonnet-4-5"] }

Task invocation:
  POST /a2a/invoke
  { task: "Research topic X", context: { peerId: "..." } }
  → { status: "completed", result: "..." }

Task status (for long-running):
  GET /a2a/status/:taskId
  → { status: "running" | "completed" | "failed", result?: "..." }
```

### Peer configuration

```json
{
  "a2a": {
    "peers": [
      { "name": "research-agent", "url": "http://localhost:3001", "apiKey": "..." }
    ]
  }
}
```

Same pattern as `mcp.servers` — lives in `config.json`.

### Integration

- Reuses the existing Hono HTTP server for A2A endpoints
- A2A peers are discoverable via a new tool (or surfaced through the existing `mcp` proxy tool)
- Same sandbox security model as MCP servers
- A2A results are compatible with structured tool views (request `structured-tool-views`)

### Security

- A2A endpoints are authenticated via API key (configured alongside peer URL)
- Requests are validated against a schema (Zod)
- Tasks are sandboxed with the same timeout and resource limits as the delegate tool

## Relationship between parts

Parts 1 and 2 are independent but complementary:
- Part 1 (delegate tool) is for same-process sub-agents — immediate, zero infrastructure
- Part 2 (A2A) is for cross-process orchestration — requires peer configuration

Part 1 is deliverable standalone. Part 2 depends on the A2A protocol design being stable.

## Risks

- **Runaway sub-agents**: Sub-agents could loop or take too long. Mitigation: hard timeout (default 60s, configurable).
- **Tool set explosion**: Sub-agents inherit the main agent's tools, which could be many. Mitigation: allow configuring a subset of tools for the sub-agent.
- **A2A security**: Unauthenticated A2A endpoints could be abused. Mitigation: API key authentication + sandboxed execution + rate limiting.
- **Protocol coupling**: A2A protocol design could lock us into a specific format. Mitigation: keep the protocol minimal (discovery + invoke + status), iterate later.
