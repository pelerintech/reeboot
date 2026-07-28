# Delegate tool + A2A protocol

## Goals

Two capabilities for agent-to-agent delegation:

**1. Delegate tool (same-process).** A new tool registered via `ExtensionAPI.registerTool()` that lets the main agent delegate sub-tasks to sub-agents running in the same process. Inspired by the pi-subagents extension but SDK-agnostic — works identically on both pi and ree runtimes. Sub-agents inherit the main agent's model (model routing is out of scope).

**2. A2A protocol (HTTP-based).** Cross-process agent-to-agent communication, inspired by Agent-Native's A2A support. Lets reeboot instances (or other A2A-compatible agents) discover and delegate tasks to each other over HTTP.

## Non-goals

- Not selecting different models per sub-agent (model routing is a future concern)
- Not replacing the existing MCP tool integration (MCP remains the primary mechanism for tool-like capabilities)
- Not adding a full agent orchestration platform
- Not changing pi or ree SDK adapters
- Not implementing Agent-Native's specific A2A protocol implementation — our own design

## Impact

Currently, reeboot has no built-in sub-agent delegation. The pi-subagents extension exists but is pi-specific and not available in ree mode. Cross-process agent orchestration does not exist.

After this change:
- The main agent can delegate sub-tasks via a `delegate` tool, creating a sub-agent session that runs the task and returns results
- The delegate tool works identically on both pi and ree runtimes
- Reeboot can act as an A2A peer, both delegating to and receiving tasks from other agent processes over HTTP
- A2A peers are configured in `config.json` (same pattern as `mcp.servers`)

## Discovery summary

The user's vision includes future model-aware routing (a router LLM selecting sub-agents + models), but that is explicitly out of scope for this request. This request delivers the substrate: a delegate tool for same-process delegation and an A2A protocol for cross-process orchestration.

The delegate tool pattern is inspired by pi-subagents but implemented on reeboot's own `ExtensionAPI` so it works on both pi and ree. The A2A protocol is inspired by Agent-Native's composable mini-apps pattern.

## Key design decisions (to confirm in plan phase)

- Delegate tool: SDK-agnostic, uses the existing AgentRunner (pi or ree) to create sub-sessions
- Delegate tool: sub-agent inherits the main agent's model, provider, and tool set
- Delegate tool: results are returned as structured text, compatible with the structured tool views system (request `structured-tool-views`)
- A2A: uses HTTP/JSON, reuses the existing Hono server for endpoints
- A2A: peers configured in `config.json` alongside `mcp.servers`
- A2A: discovery via a well-known endpoint (`GET /a2a/capabilities`), task invocation via `POST /a2a/invoke`
- A2A: same sandbox security model as MCP servers
