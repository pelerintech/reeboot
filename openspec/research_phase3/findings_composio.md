# Findings: Composio and Integration Layer Tools

**Research Date:** 2026-03-20
**Research Question:** What is Composio, what alternatives exist, and which is best for a self-hosted personal AI agent needing per-user OAuth for Gmail/Calendar/Notion/GitHub without embedding integrations in core?

---

## Key Findings

1. **Composio is a cloud-first managed integration layer** for AI agents — not self-hostable in its standard form. The source code is MIT-licensed on GitHub but the platform (OAuth token vault, action catalog) runs on Composio's servers.

2. **Nango is the strongest open-source, self-hostable alternative** — purpose-built for per-user OAuth and integration infrastructure. It is explicitly Docker-deployable, MIT-licensed, and supports 700+ APIs including all the Google suite, Notion, GitHub.

3. **Zapier/Make/Activepieces are workflow automation tools**, not integration infrastructure layers. They are suitable for building automations, but do not provide the "OAuth token vault + structured tool-call API" pattern that AI agent frameworks need.

4. **The category is now called "AI agent auth" or "agent integration infrastructure"** — distinct from iPaaS (Zapier/Make). Key players: Composio, Nango, Merge, Arcade, WorkOS.

5. **For a self-hosted open-source agent project like reeboot**, Nango is the clear best fit: open-source, self-hostable via Docker, designed exactly for per-user OAuth delegation to AI agents, and already powering hundreds of AI agent companies.

---

## Composio: What It Is, Pricing, Self-Hosting, DX

### What It Is
Composio positions itself as an "integration layer for AI agents" — a managed platform that handles:
- OAuth flows + token storage for 250–500+ apps (Gmail, Slack, GitHub, Notion, Jira, etc.)
- Pre-built action catalogs exposed as LLM-ready tool schemas
- Multi-tenant user auth management
- Integrations with LangChain, CrewAI, AutoGen, Claude SDK, OpenAI function calling

> "Composio seamlessly connects AI agents and LLMs like OpenAI and Gemini to tools like Slack, Notion, and Jira." — G2 Reviews (2026)

> "Building AI agents is 10x easier with more than 10000 tools and built-in tooling support for your LLMs." — Vellum.ai/Composio partnership blog, 2025-08-12

It has rebranded a component as **AgentAuth** — specifically the per-user OAuth delegation piece for agents.

### MCP Support
Composio is an early MCP (Model Context Protocol) adopter, exposing its tool catalog as an MCP server. This means Claude Desktop / Claude Code users can connect to Composio's MCP to get all their OAuth apps in one place.

> "Composio is an early adopter of MCP, which standardizes how AI clients connect to tools." — Medium/AIMonks, 2025-10-15

### Pricing / Self-Hosting
- **Cloud-only managed platform** — primary offering is hosted SaaS
- The GitHub repo (`ComposioHQ/composio`) is MIT-licensed, but the cloud OAuth infrastructure is not open to self-hosting in practice
- A GitHub issue from 2024-07-11 explicitly asks: **"On-prem / self-hosting option · Issue #291"** — indicating this was an open request as of mid-2024 with no clear resolution
- Reddit (r/selfhosted, 2025-02-08): Community explicitly asks for a "self-hosted alternative or similar to Composio" — confirming the platform is not practically self-hostable
- No published pricing tiers found; appears to be usage-based or freemium with enterprise contracts

### Developer Experience
- Strong DX for cloud usage — Python/TypeScript SDKs, clean API
- Integration with all major agent frameworks (LangChain, CrewAI, AutoGen, LlamaIndex)
- Reddit feedback (r/LangChain, 2025-01-16): Some criticism that tool wrappers are "just wrappers around the API" and not always well-optimized for LLM use
- Reddit (r/n8n, 2025-09): "Composio: This was the first that came up and has the most to offer. They have almost 500 apps for integration and the tools are meant to be [LLM-ready]"

### Verdict for reeboot
❌ **Not suitable** — cloud-only, no practical self-hosting, ties users to Composio's OAuth infrastructure. Fundamentally incompatible with a fully self-hosted open-source product.

---

## Nango: Open-Source OAuth / Integration Layer

### What It Is
Nango is a **fully open-source integration platform** originally built as an OAuth handler, now evolved into a full product integration platform for AI agents and SaaS products.

> "Two years ago, we launched Nango as an open-source OAuth handler that simplified authorization for 40 APIs. Since then, we've expanded to become a full product integration platform for developers." — Y Combinator company page

> "Nango is fully open source. Run it on Nango Cloud or self-host on your own infrastructure. SOC 2 Type II, HIPAA, and GDPR compliant." — nango.dev/docs/getting-started/intro-to-nango

### Core Capabilities
- **OAuth flows + token refresh + credential storage** for 700+ APIs
- **Multi-tenant**: handles per-user credential isolation out of the box
- **Structured tool calls** for AI agents — type-safe, with pre-built integrations
- **Data syncs**: sync external API data to your DB on a schedule or real-time (for RAG)
- **MCP server**: exposes integrations as an MCP server for Claude/agent SDKs
- **AI-generated integrations**: writes TypeScript integration functions using AI coding tools

> "Compatible with any backend language or framework, AI coding tools (Cursor, Codex, Claude Code), and agent SDKs (MCP, LangChain, CrewAI, etc.)" — nango.dev docs

### Self-Hosting
- **Docker-deployable** — fully self-hostable
- MIT licensed (open source)
- Community/free tier for self-hosting exists
- Enterprise self-hosted: has an annual license fee + fraction of cloud usage-based fees (infrastructure on your own servers)
  > "Enterprise Self-Hosted pricing contains a fixed annual license and maintenance fee, plus a fraction of the cloud usage-based fees since infrastructure is on your own." — nango.dev/docs/guides/platform/self-hosting
- Note: For a personal/internal project, the community/free self-hosted path is viable

### Pricing (Cloud)
- Cloud tier starts free (exact free tier limits not confirmed in search results)
- Enterprise cloud/self-hosted involves annual contracts
- Community self-hosting (for personal/internal use) appears free

### APIs Supported
700+ APIs confirmed, explicitly including:
- Google (Gmail, Calendar, Drive, Sheets)
- GitHub, GitLab
- Notion, Slack, Jira, Linear
- HubSpot, Salesforce
- And hundreds more

### Developer Experience
- Nango Blog is extremely developer-focused with detailed guides on agent auth patterns
- Integrations are TypeScript functions — customizable and version-controlled in your repo
- Strong AI agent use-case documentation (2025–2026 blog posts)
- Used by "hundreds of fast growing AI agent companies"

### Versus Composio
From Nango's own comparison (blog post, 2026):
> "Nango offers better scalability, observability and more control [than Composio]. Custom integrations are possible." — nango.dev/blog/composio-alternatives

### Verdict for reeboot
✅ **Best fit** — open-source, self-hostable via Docker, purpose-built for per-user OAuth delegation to AI agents, covers all required APIs (Gmail, Calendar, Notion, GitHub), active development, strong DX.

---

## Zapier / Make / Activepieces for AI Agents

### Zapier
**What it is:** No-code workflow automation connecting 8,000+ apps. Has added "Zapier Agents" and a "Developer Platform / Workflow API."

**Zapier Developer Platform (2024–2025):**
> "Use Zapier's Workflow API and 8,000 integrations to power a built-in automation experience, integration marketplace, or AI workflows. Zapier handles auth..." — zapier.com/developer-platform

- Zapier Agents: lets users create AI agents that can run automations across 8,000+ apps
- Workflow API: allows embedding Zapier automations into products
- **Not self-hostable** — fully proprietary SaaS
- Pricing is per-task, gets expensive at scale
- DX: better for no-code users than developers building agent infrastructure

**Verdict for reeboot:** ❌ Proprietary SaaS, per-task pricing, not developer infrastructure. Wrong level of abstraction for embedding in an agent framework.

---

### Make (formerly Integromat)
**What it is:** Visual workflow automation platform, similar to Zapier but with more complex branching logic.

- Cloud-only SaaS
- No self-hosting in standard form (enterprise agreements exist)
- Not designed as integration infrastructure for AI agents
- Per-operation pricing

**Verdict for reeboot:** ❌ Same issues as Zapier — wrong abstraction layer, cloud-only, per-operation costs.

---

### Activepieces
**What it is:** Open-source, self-hosted Zapier alternative. MIT licensed.

**Key facts (2024–2026):**
- **Fully open-source** and **self-hostable** (Community Edition, free, no task limits)
- Cloud version starts from ~$0 (free tier) with paid plans
- TypeScript-based, extensible pieces (connectors)
- Has added AI agent capabilities (2025–2026)
- XDA Developers (Oct 2025): "the free and open-source automation platform that offers more control, security, and flexibility compared to Zapier's paid plans"
- Activepieces Embed (for embedding in your own product): starts at $30k/year annual

> "Activepieces offers a Community Edition that's completely free, open-source, and self-hosted, with no task limits." — activepieces.com/blog/zapier-alternatives, 2026-01-14

**What it does NOT do:** Activepieces is a **workflow automation** tool (trigger → action chains), not an **OAuth token vault + structured tool-call layer** for agent frameworks. You can't ask "get me an access token for user X's Gmail" from Activepieces the way you can with Nango.

**Verdict for reeboot:** ⚠️ **Partially useful** — could power user-triggered automations / integrations as a companion tool, but is not the right abstraction for programmatic per-user OAuth management in an agent SDK context. Could be used as an optional "automation layer" users self-host alongside reeboot.

---

## Airbyte for AI Agents

**What it is:** Open-source data integration / ELT platform — primarily for moving data between sources and destinations (databases, warehouses).

- Airbyte has published guides on "AI agent integrations" (Jan 2026) but this is marketing content
- Core use case: **data pipeline** (sync Gmail → database for RAG), not **live action execution** (send an email, create a calendar event)
- Open-source, self-hostable
- Very heavy infrastructure (PostgreSQL, Temporal, etc.) — overkill for agent action integrations

**Verdict for reeboot:** ❌ Wrong tool for the job. Good for data sync / RAG data prep, not for live agent action execution with per-user OAuth.

---

## Best Fit for a Self-Hosted Personal Agent

### The Problem
reeboot needs:
1. Per-user OAuth — each user connects their own Gmail, Google Calendar, Notion, GitHub
2. Token storage and refresh — handled transparently
3. Structured tool calls — agent can call "send_email(to=..., subject=..., body=...)"
4. Plugin/extension architecture — integrations live outside core
5. Fully self-hostable — no calls to third-party auth infrastructure
6. Open-source — auditable, forkable

### Recommendation: Nango (self-hosted)

Nango checks every box:

| Requirement | Nango |
|---|---|
| Per-user OAuth | ✅ Core feature |
| Token storage + auto-refresh | ✅ Handled |
| Structured tool calls for agents | ✅ Type-safe, MCP-compatible |
| Gmail / Calendar / Notion / GitHub | ✅ 700+ APIs |
| Self-hostable | ✅ Docker, free community tier |
| Open-source | ✅ MIT licensed |
| Pluggable (outside core) | ✅ Separate service |

### Alternative: Roll Your Own (minimal)
For a simpler approach, a lightweight OAuth proxy could be built using:
- [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) for token management
- Direct Google/GitHub OAuth libraries per-service
- But this requires re-implementing what Nango already does

### Alternative: Embedded per-service OAuth
Each integration plugin in reeboot manages its own OAuth (similar to how VS Code extensions handle auth). Simpler initially but doesn't provide a unified token vault.

---

## Open-Source Options Summary

| Tool | Self-Host | License | OAuth Vault | Agent Tool Calls | 700+ APIs | Complexity |
|---|---|---|---|---|---|---|
| **Nango** | ✅ Docker | MIT | ✅ | ✅ | ✅ 700+ | Medium |
| **Activepieces** | ✅ Docker | MIT | ❌ | ❌ (workflows) | ✅ 200+ | Low |
| **n8n** | ✅ Docker | Fair-code | ❌ | ❌ (workflows) | ✅ 400+ | Low |
| **Airbyte** | ✅ Docker | ELv2 | ❌ | ❌ (data sync) | ✅ 300+ | High |
| **Composio** | ❌ (cloud) | MIT (SDK) | ✅ (cloud) | ✅ (cloud) | ✅ 500+ | Low |

---

## Additional Context: The "Agent Auth" Category (2025–2026)

A distinct market segment has formed around "authentication infrastructure for AI agents":

- **Composio AgentAuth** — managed, cloud-only
- **Nango** — open-source, self-hostable
- **Merge.dev** — unified API, enterprise, not self-hostable
- **Arcade** — newer entrant, agent-focused auth
- **WorkOS** — identity platform with agent auth features (2025)
- **Auth0 for AI Agents** — GA announced Nov 2025
- **Stytch** — OAuth guide for agent-to-agent flows (Aug 2025)

From Merge.dev blog (2026):
> "A wide range of companies provide authentication support for agents, including Merge, Arcade, Composio, Nango, and WorkOS."

Reddit (r/selfhosted, 2026-01-30) — someone built **AgentAuth**, a self-hosted authentication system for AI agents as a $0 alternative to Auth0's $240/mo pricing. Still nascent.

---

## Sources

- **Composio homepage**: https://composio.dev/
- **Composio G2 Reviews (2026)**: https://www.g2.com/products/composio/reviews
- **Composio on-prem issue #291 (2024-07-11)**: https://github.com/ComposioHQ/composio/issues/291
- **Composio license (MIT)**: https://github.com/ComposioHQ/composio/blob/next/LICENSE
- **Composio Medium/AIMonks review (2025-10-15)**: https://medium.com/aimonks/building-the-future-of-ai-automation-how-composio-is-revolutionizing-agent-integration-d7c4ed0669df
- **Composio review - Automateed (2024-11-15)**: https://www.automateed.com/composio-review
- **Composio vs Zapier/Make/n8n blog (2025-12-20)**: https://composio.dev/blog/outgrowing-make-zapier-n8n-ai-agents
- **Self-hosted alternative to Composio? (r/selfhosted, 2025-02-08)**: https://www.reddit.com/r/selfhosted/comments/1ikod9m/selfhosted_alternative_or_similar_to_composio/
- **Composio alternatives? (r/mcp, 2025-05-02)**: https://www.reddit.com/r/mcp/comments/1kdcg74/composio_alternatives/
- **Nango GitHub repo**: https://github.com/NangoHQ/nango
- **Nango homepage**: https://nango.dev/
- **Nango self-hosting docs**: https://nango.dev/docs/guides/platform/self-hosting
- **Nango intro docs (700+ APIs, MCP, self-host)**: https://nango.dev/docs/getting-started/intro-to-nango
- **Nango composio-alternatives blog (2026)**: https://nango.dev/blog/composio-alternatives
- **Nango best AI agent integration platforms (2026-03-06)**: https://nango.dev/blog/best-ai-integration-platforms
- **Nango agent auth guide (2026-03-14)**: https://nango.dev/blog/guide-to-secure-ai-agent-api-authentication
- **Nango on Y Combinator**: https://www.ycombinator.com/companies/nango
- **Nango on openalternative.co**: https://openalternative.co/nango
- **Zapier Developer Platform**: https://zapier.com/developer-platform
- **Zapier Agents guide (2025-11-13)**: https://zapier.com/blog/zapier-agents-guide/
- **Activepieces zapier-alternatives (2026-01-14)**: https://www.activepieces.com/blog/zapier-alternatives
- **Activepieces open-source alternatives to Zapier (2026-01-14)**: https://www.activepieces.com/blog/open-source-alternatives-to-zapier
- **Airbyte AI agent integrations guide (2026-01-07)**: https://airbyte.com/agentic-data/ai-agent-integrations
- **Merge.dev best AI agent auth tools (2026)**: https://www.merge.dev/blog/best-ai-agent-auth-tool
- **WorkOS best OAuth/OIDC providers for AI agents (2025-11-24)**: https://workos.com/blog/best-oauth-oidc-providers-for-authenticating-ai-agents-2025
- **Auth0 for AI Agents GA (2025-11-24)**: https://dev.to/auth0/auth0-for-ai-agents-is-now-generally-available-29el
- **Best AI integration platforms comparison - getmembrane.com (2026-02-17)**: https://getmembrane.com/articles/comparisons/best-integration-platforms-for-saas-ai-2026
- **4 Best AI agent auth platforms (dev.to, 2026-02-03)**: https://dev.to/composiodev/4-best-ai-agent-authentication-platforms-to-consider-in-2026-32o8
- **Reddit r/AI_Agents agent auth permissioning (2025-06-03)**: https://www.reddit.com/r/AI_Agents/comments/1l1xe5p/how_do_you_manage_agent_auth_and_permissioning/
- **OpenClaw ecosystem Reddit (2026-03-05)**: https://www.reddit.com/r/openclaw/comments/1rlptnf/the_openclaw_ecosystem_is_bigger_than_you_think/
