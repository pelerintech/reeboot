# Research Plan: reeboot Phase 3

## Main Research Question
Three connected questions for phase 3 of reeboot (a self-hosted personal AI agent server built on Node.js + TypeScript):
1. Should we migrate from Node.js to Bun? What are the real-world blockers and gains?
2. How should we architect multi-channel support (beyond current Discord/WhatsApp/WebChat)?
3. How do other AI agents/assistants handle third-party integrations (Gmail, calendars, apps), and what is the right model for reeboot — marketplace, MCP, plugin system, or trivial adapter authoring?

## Subtopics to Investigate

1. **bun-vs-node-migration**: Real-world experience migrating production Node.js/TypeScript ESM projects to Bun — compatibility issues, better-sqlite3, native addons, performance gains, ecosystem gaps, 2024-2025 state
2. **multi-channel-agent-architecture**: How open-source agent frameworks (LangChain, CrewAI, AutoGen, etc.) and commercial products architect multi-channel support — adapter patterns, community-contributed channels, hot-loading
3. **agent-integration-marketplaces**: How ChatGPT plugins, Claude MCP, LangChain tools, AutoGen, n8n, Zapier AI, and open-source agents handle third-party integrations — what has worked, what failed, current trends 2024-2025
4. **mcp-model-context-protocol**: Deep dive on MCP (Anthropic's Model Context Protocol) — what it is, adoption, server ecosystem, how agents integrate it, whether it solves the integration problem
5. **composio-and-alternatives**: Composio, Zapier AI, Make, and similar integration-layer tools specifically designed for AI agents — API, self-hosting options, open-source alternatives, developer experience
6. **bun-native-addons-sqlite**: Specifically Bun compatibility with better-sqlite3, node-gyp native addons, and common Node.js packages used in TypeScript ESM projects (2024-2025)

## Expected Information per Subtopic
- bun-vs-node-migration: Migration stories, compatibility matrix, benchmark numbers, known blockers
- multi-channel-agent-architecture: Patterns used, plugin/adapter APIs, community ecosystem health
- agent-integration-marketplaces: Business model, developer adoption, what survived ChatGPT plugin shutdown
- mcp-model-context-protocol: Protocol spec, server registry, adoption numbers, integration DX
- composio-and-alternatives: API surface, hosted vs self-hosted, per-user auth, supported apps
- bun-native-addons-sqlite: Issue trackers, workarounds, alternative SQLite drivers for Bun

## Synthesis Plan
Combine into a structured discovery doc with clear go/no-go signals and a recommended direction for each of the three phase-3 topics.
