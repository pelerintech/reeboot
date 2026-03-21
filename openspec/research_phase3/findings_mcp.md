# Findings: Model Context Protocol (MCP)

**Research Date:** 2026-03-20
**Research Question:** What is MCP exactly, how widely adopted is it, what does the server ecosystem look like, and is it a viable solution for a self-hosted personal AI agent wanting to offer third-party integrations?

---

## Key Findings

- **MCP is now the de facto industry standard** for connecting AI agents to external tools and data. Launched by Anthropic in November 2024, it has been adopted by OpenAI, Google, Microsoft, AWS, Cloudflare, and Bloomberg within its first year.
- **16,000+ MCP servers** exist as of late 2025; the official MCP Registry launched in September 2025 and lists ~2,000 curated entries.
- **All major AI platforms support MCP**: Claude (native), OpenAI Agents SDK (March 2025), Google ADK, Gemini CLI, VS Code Copilot, Cursor, and more.
- **MCP has been donated to the Linux Foundation** (Agentic AI Foundation, Dec 9, 2025) — no longer Anthropic-controlled, now a true open standard.
- Writing an MCP server is **genuinely easy**: official SDKs for Python, TypeScript, C#, Java, Kotlin. A minimal Python server is ~20 lines of code.
- MCP runs **fully locally via stdio transport** — no cloud dependency required. Remote HTTP/SSE transport is also supported for cloud/hosted scenarios.
- **Plug-and-play integrations** already exist for Gmail, Google Calendar, GitHub, Slack, Notion, Postgres, Filesystem, Brave Search, Sentry, Jira, Confluence, and many more.
- **MCP is strictly better than reinventing function calling** for an agent platform: it is composable, standard, already supported by clients, and the ecosystem is growing exponentially.

---

## What MCP Is (Technical Summary)

MCP (Model Context Protocol) is an **open JSON-RPC 2.0 protocol** that standardizes how AI models (clients) communicate with external tools and data sources (servers). It was introduced by Anthropic on November 25, 2024, inspired by the Language Server Protocol (LSP).

### Core Primitives

| Primitive | Description |
|-----------|-------------|
| **Tools** | Functions the model can call (e.g., `send_email`, `create_event`) |
| **Resources** | Structured data the model can read (e.g., files, database rows) |
| **Prompts** | Pre-written prompt templates for specific workflows |

### Transport Modes

| Transport | Use Case |
|-----------|----------|
| **stdio** | Local process communication — server runs as a subprocess on same machine |
| **HTTP + SSE** (Streamable HTTP) | Remote/cloud servers, supports auth |

### How it works
1. An MCP **client** (Claude Desktop, Cursor, a custom agent) starts an MCP **server** as a subprocess (stdio) or connects to it over HTTP.
2. The client discovers available tools/resources via `list_tools` / `list_resources`.
3. The LLM decides to call a tool → client sends `call_tool` to the server → server executes the action → returns result.
4. All communication is JSON-RPC 2.0 over the chosen transport.

> "MCP provides a universal interface for reading files, databases, code repositories, and other system resources; executing commands or scripts; interacting with external APIs; and performing other computing tasks." — Wikipedia

> "The Model Context Protocol (MCP) is an open protocol that enables seamless integration between LLM applications and external data sources and tools." — modelcontextprotocol.io

**Source:** https://en.wikipedia.org/wiki/Model_Context_Protocol, https://modelcontextprotocol.io/specification/2025-03-26, https://www.anthropic.com/news/model-context-protocol (2024-11-25)

---

## Adoption and Ecosystem Health

### Timeline
- **November 2024**: Anthropic launches MCP with initial SDKs (Python, TypeScript) and pre-built servers for popular enterprise systems.
- **March 2025**: OpenAI adds native MCP support in their Agents SDK.
- **April 2025**: Google ADK supports MCP; community explosion begins.
- **May 2025**: 5,000+ active MCP servers on public directories (Glama's directory).
- **September 2025**: Official MCP Registry launches at registry.modelcontextprotocol.io.
- **November 2025**: 16,000+ total MCP servers in the wild; one-year anniversary blog post.
- **December 2025**: MCP donated to Linux Foundation / Agentic AI Foundation (AAIF), co-founded by Anthropic, Block, and OpenAI; with backing from Google, Microsoft, AWS, Cloudflare, Bloomberg.
- **December 2025**: Google announces fully-managed remote MCP servers for Google services.

### Who Has Adopted MCP
- **Anthropic**: Claude Desktop, claude.ai, Claude API
- **OpenAI**: ChatGPT, Agents SDK, Responses API
- **Google**: Gemini CLI, ADK, official Google services MCP servers (Dec 2025)
- **Microsoft**: VS Code GitHub Copilot, Azure Functions MCP hosting (public preview Nov 2025)
- **Cursor**, **Zed**, **Windsurf**, **JetBrains**, and other IDEs

> "Since launching MCP in November 2024, adoption has been rapid: the community has built thousands of MCP servers, SDKs are available for all major programming languages, and the industry has adopted MCP as the de-facto standard for connecting agents to tools and data." — Anthropic Engineering Blog, 2025-11-04

> "Over 16,000 MCP servers exist in the wild." — Zuplo blog, Nov 24, 2025

> "Twelve months later, MCP has become the de facto protocol for connecting AI systems to real-world data and tools. OpenAI, Google DeepMind..." — Pento.ai blog, Dec 23, 2025

**Sources:**
- https://www.anthropic.com/engineering/code-execution-with-mcp (2025-11-04)
- https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation (2025-12-09)
- https://zuplo.com/blog/one-year-of-mcp/ (2025-11-24)
- https://beam.ai/agentic-insights/what-is-mcp-model-context-protocol-for-ai-agents-explained (2025-08-05)

---

## Available MCP Servers (Gmail, Calendar, GitHub, etc.)

### Official/Major Provider Servers

| Server | Provider | Notes |
|--------|----------|-------|
| **GitHub MCP Server** | GitHub (official) | Issues, PRs, repos, code search — `github/github-mcp-server` |
| **Google Services** | Google (official) | Fully-managed remote MCP for all Google APIs (Dec 2025) |
| **Google Calendar** | Community (multiple) | `nspady/google-calendar-mcp`, `falgom4/calendar-mcp` (OAuth2) |
| **Gmail** | Community | Multiple implementations on GitHub |
| **Filesystem** | Anthropic official | Read/write local files |
| **Postgres** | Anthropic official | Query databases |
| **Brave Search** | Anthropic official | Web search |
| **Slack** | Community/official | Send messages, read channels |
| **Notion** | Community | Read/write pages, databases |
| **Sentry** | Postman/community | Debug production bugs |
| **Jira / Confluence** | Atlassian (MCP) | Read tickets, write docs |
| **Supabase** | Supabase (official) | Self-hosted and cloud |

### Registries and Directories

| Directory | URL | Count |
|-----------|-----|-------|
| **Official MCP Registry** | https://registry.modelcontextprotocol.io | ~2,000 curated entries (Sep 2025) |
| **mcp.so** | https://mcp.so | Community-driven, 3rd-party servers |
| **mcpservers.org** | https://mcpservers.org | Curated collection with search |
| **PulseMCP** | https://www.pulsemcp.com | Server discovery |
| **GitHub awesome-mcp-servers** | https://github.com/punkpeye/awesome-mcp-servers | Curated list |

> "The MCP registry provides MCP clients with a list of MCP servers, like an app store for MCP servers. It serves as the authoritative repository for publicly-available MCP servers. Registry is Live! The official MCP Registry launched in preview on September 8, 2025." — modelcontextprotocol.info

> "It's the central index for all available MCP servers that now has close to two thousand entries." — MCP Anniversary Blog, 2025-11-25

**Sources:**
- https://github.com/modelcontextprotocol/registry
- https://registry.modelcontextprotocol.io
- https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services (2025-12-10)
- https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/

---

## Developer Experience: Writing an MCP Server

### How Hard Is It?

Writing a basic MCP server is **very straightforward**. Using Python's `FastMCP` or the TypeScript SDK, a working tool-exposing server can be written in under 30 lines.

### Python Example (minimal)

```python
from mcp.server import Server, stdio_server
from mcp.types import Resource, Tool, TextContent

server = Server("my-server")

@server.list_tools()
async def list_tools():
    return [Tool(name="hello", description="Say hello", inputSchema={...})]

@server.call_tool()
async def call_tool(name, arguments):
    return [TextContent(type="text", text=f"Hello, {arguments['name']}!")]

asyncio.run(stdio_server(server))
```

Install: `pip install mcp`

### TypeScript Example

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "my-server", version: "1.0.0" });
server.tool("greet", { name: z.string() }, async ({ name }) => ({
  content: [{ type: "text", text: `Hello, ${name}!` }],
}));
```

Install: `npm install @modelcontextprotocol/sdk`

### Official SDK Support (Tier 1 = Anthropic-maintained)

| Language | Package | Tier |
|----------|---------|------|
| Python | `modelcontextprotocol/python-sdk` | 1 (official) |
| TypeScript | `modelcontextprotocol/typescript-sdk` | 1 (official) |
| C# | `modelcontextprotocol/csharp-sdk` | 1 (official) |
| Java | Community SDK | 2 |
| Kotlin | Community SDK | 2 |
| Rust | Community SDK | 2 |

### Common Pitfalls
- STDIO servers: **never write to stdout** for logging — it breaks the protocol. Use stderr.
- Must handle `list_tools` and `call_tool` lifecycle hooks correctly.
- For remote servers, OAuth 2.1 is the expected auth mechanism.

### Community Resources
- Microsoft's open-source MCP curriculum (`microsoft/mcp-for-beginners`) — covers .NET, Java, TypeScript, JS, Rust, Python.
- `nearform.com` deep dive on tips/tricks/pitfalls (Dec 2025).
- DataCamp tutorial with full demo project (Mar 2025).

> "Claude 3.5 Sonnet is adept at quickly building MCP server implementations, making it easy for organizations and individuals to rapidly connect their most important datasets with a range of AI-powered tools." — Anthropic, Nov 2024

**Sources:**
- https://modelcontextprotocol.io/docs/develop/build-server
- https://modelcontextprotocol.io/docs/sdk
- https://sysdebug.com/posts/model-context-protocol-tutorial/ (2025-05-07)
- https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/ (2025-12-10)
- https://github.com/microsoft/mcp-for-beginners
- https://www.datacamp.com/tutorial/mcp-model-context-protocol (2025-03-17)

---

## Self-Hosted / Local Deployment

### Fully Supported — First-Class Use Case

MCP was designed with local deployment in mind. The **stdio transport** is the primary transport mode for local use:

1. The host agent spawns the MCP server as a **local subprocess**.
2. Communication happens over **stdin/stdout** — no network ports, no auth required.
3. The server has access to local filesystem, local databases, local environment.
4. Zero dependency on any external cloud service.

### Deployment Patterns

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **stdio (local process)** | Server runs as child process | Local integrations, CLI tools, dev tools |
| **HTTP + SSE (localhost)** | Server runs on local port | Local web-based integrations |
| **HTTP (remote, self-hosted)** | Server on your VPS/server | Multi-user or remote access |
| **Managed cloud** | Azure Functions, Google Cloud, etc. | Enterprise/SaaS |

### Self-Hosting Options
- **Docker container**: Containerize any MCP server and run it on your infrastructure.
- **Direct process**: Just run `python my_server.py` and configure your agent to spawn it.
- **Azure Functions**: Microsoft supports stateless MCP servers on Azure Functions (public preview, Nov 2025).
- **Supabase**: Self-hosted Supabase has MCP support with local port forwarding.

> "MCP is an open protocol that enables AI models to securely interact with local and remote resources through standardized server implementations." — punkpeye/awesome-mcp-servers

> "Self-hosted remote MCP server on Azure Functions (public preview)" — Microsoft Learn, Nov 2025

**Sources:**
- https://modelcontextprotocol.io/docs/develop/build-server
- https://apidog.com/blog/open-source-mcp-server/ (2025-04-02)
- https://learn.microsoft.com/en-us/azure/azure-functions/self-hosted-mcp-servers (2025-11-18)
- https://supabase.com/docs/guides/self-hosting/enable-mcp
- https://northflank.com/blog/how-to-build-and-deploy-a-model-context-protocol-mcp-server (2025-08-26)

---

## MCP vs Function Calling

| Aspect | Traditional Function Calling | MCP |
|--------|------------------------------|-----|
| **Scope** | Per-model, per-request tool definitions | Protocol-level, persistent server |
| **Portability** | Provider-specific (OpenAI format ≠ Anthropic format) | Provider-agnostic — write once, use anywhere |
| **Discovery** | Tools defined inline in each prompt | Dynamic discovery via `list_tools` |
| **Reuse** | Must redeclare tools every request | Server stays running, tools declared once |
| **Multi-agent** | Hard — each agent needs its own tool definitions | Easy — multiple agents share one MCP server |
| **Complexity** | Low (just JSON schema in prompt) | Slightly higher (run a server process) |
| **Best for** | Single agent, small fixed tool set | Multi-agent, shared integrations, platforms |

> "Use function calling for single-agent apps with a few internal tools. Use MCP when multiple agents or clients need the same integrations." — blog.jztan.com, Feb 2026

> "Function calling was the first bridge between LLMs and external tools, but its provider-specific, fragmented approach creates friction as... [integrations grow]" — Descope blog, Nov 2025

**Sources:**
- https://www.descope.com/blog/post/mcp-vs-function-calling (2025-11-03)
- https://blog.jztan.com/mcp-vs-function-calling-ai-agents/ (2026-02-16)
- https://neon.com/blog/mcp-vs-llm-function-calling (2025-03-12)
- https://zilliz.com/blog/function-calling-vs-mcp-vs-a2a-developers-guide-to-ai-agent-protocols (2025-04-25)

---

## Fit for Reeboot

**Assessment: Strong fit — MCP is the right integration layer for reeboot.**

### Pros
1. **Zero lock-in**: MCP is now an open Linux Foundation standard, not Anthropic-controlled. Any LLM backend can consume it.
2. **Massive free ecosystem**: 16,000+ existing servers means Gmail, Calendar, GitHub, Slack, Notion, and hundreds more integrations are **already written** — reeboot doesn't need to build them from scratch.
3. **Self-hosted by design**: stdio transport runs entirely on the user's machine with no external dependencies.
4. **Community trust**: Users who are concerned about data privacy can self-host MCP servers and know their data never leaves their machine.
5. **Plugin marketplace ready**: The MCP registry is exactly the "app store" model — reeboot users can browse and install MCP servers like plugins.
6. **Easy to write custom servers**: If reeboot needs a custom integration, writing an MCP server is a ~20-line Python exercise.
7. **AI-first**: The LLM itself understands how to use MCP tools without custom orchestration logic.

### Cons / Considerations
1. **oauth complexity for remote servers**: If reeboot wants to host MCP servers for users (not just let users self-host), OAuth 2.1 flows add complexity.
2. **Process management**: Running N MCP servers as subprocesses requires process lifecycle management (start/stop, crash recovery).
3. **stdio trust model**: stdio servers inherit the agent process's permissions — need sandboxing for untrusted servers.
4. **Not all servers are high quality**: The 16,000 number includes many half-finished community projects; the curated registry (~2,000) is more reliable.

### Recommended Architecture for Reeboot
- **Agent core** acts as MCP client
- **Per-integration MCP servers** run as local processes (stdio) or remote (HTTP)
- **User installs servers** from the MCP registry or custom ones
- **Reeboot ships** a curated set of first-party MCP servers for high-priority integrations (Gmail, Calendar, GitHub) while the community provides the long tail

---

## Sources

| Source | URL | Date |
|--------|-----|------|
| Anthropic MCP Announcement | https://www.anthropic.com/news/model-context-protocol | 2024-11-25 |
| MCP Wikipedia | https://en.wikipedia.org/wiki/Model_Context_Protocol | 2025 |
| MCP Official Spec | https://modelcontextprotocol.io/specification/2025-03-26 | 2025-03-26 |
| Anthropic Code Execution with MCP | https://www.anthropic.com/engineering/code-execution-with-mcp | 2025-11-04 |
| Anthropic donates MCP to Linux Foundation | https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation | 2025-12-09 |
| MCP Anniversary Blog | https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/ | 2025-11-25 |
| One Year of MCP (Zuplo) | https://zuplo.com/blog/one-year-of-mcp/ | 2025-11-24 |
| Official MCP Registry | https://registry.modelcontextprotocol.io | 2025-09-08 |
| MCP Registry GitHub | https://github.com/modelcontextprotocol/registry | 2025 |
| MCP Registry Info | https://modelcontextprotocol.info/tools/registry/ | 2025 |
| mcp.so Community Directory | https://mcp.so | 2025 |
| mcpservers.org | https://mcpservers.org | 2025 |
| Awesome MCP Servers | https://github.com/punkpeye/awesome-mcp-servers | 2025 |
| Google MCP Official Announcement | https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services | 2025-12-10 |
| Google Calendar MCP | https://github.com/falgom4/calendar-mcp | 2025 |
| GitHub MCP Server (official) | https://github.com/github/github-mcp-server | 2025 |
| MCP Build Server Docs | https://modelcontextprotocol.io/docs/develop/build-server | 2025 |
| MCP SDK Docs | https://modelcontextprotocol.io/docs/sdk | 2025 |
| MCP Python SDK | https://github.com/modelcontextprotocol/python-sdk | 2025 |
| Microsoft MCP for Beginners | https://github.com/microsoft/mcp-for-beginners | 2025 |
| MCP Tutorial (SysDebug) | https://sysdebug.com/posts/model-context-protocol-tutorial/ | 2025-05-07 |
| MCP Tips & Pitfalls (NearForm) | https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/ | 2025-12-10 |
| DataCamp MCP Guide | https://www.datacamp.com/tutorial/mcp-model-context-protocol | 2025-03-17 |
| Open Source Self-Hosted MCP (APIDog) | https://apidog.com/blog/open-source-mcp-server/ | 2025-04-02 |
| Azure Functions MCP | https://learn.microsoft.com/en-us/azure/azure-functions/self-hosted-mcp-servers | 2025-11-18 |
| Northflank Deploy MCP | https://northflank.com/blog/how-to-build-and-deploy-a-model-context-protocol-mcp-server | 2025-08-26 |
| MCP vs Function Calling (Descope) | https://www.descope.com/blog/post/mcp-vs-function-calling | 2025-11-03 |
| MCP vs Function Calling (blog.jztan.com) | https://blog.jztan.com/mcp-vs-function-calling-ai-agents/ | 2026-02-16 |
| Function Calling vs MCP vs A2A (Zilliz) | https://zilliz.com/blog/function-calling-vs-mcp-vs-a2a-developers-guide-to-ai-agent-protocols | 2025-04-25 |
| MCP vs LLM Function Calling (Neon) | https://neon.com/blog/mcp-vs-llm-function-calling | 2025-03-12 |
| A Year of MCP Review (Pento) | https://www.pento.ai/blog/a-year-of-mcp-2025-review | 2025-12-23 |
| MCP Adoption Statistics | https://mcpmanager.ai/blog/mcp-adoption-statistics/ | 2025-10-22 |
| MCP arxiv paper | https://arxiv.org/html/2503.23278 | 2025-03 |
| MCP Authorization Spec | https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization | 2025-11-25 |
| MCP OAuth Pitfalls | https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover | 2026-01-29 |
