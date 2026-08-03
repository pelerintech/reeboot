# Reeboot — Developer Instructions

## Design Goal & Architecture

**Design goal:** reeboot is a light, personal-to-multi-user AI agent. It keeps a small,
narrow core and grows capability *at the edges* — through configurable extensions, gated
tools, the `ExtensionAPI`, and MCP — so the agent stays responsive, cheap, and predictable
no matter how many capabilities a deployment enables.

Two properties shape nearly every design decision:

- **Light core, capability at the edges.** New behavior should arrive as an extension,
  a gated tool, or an MCP connection — not as new core surface that ships on every turn.
- **Graceful degradation.** A capability that is not configured, or whose backend is
  unavailable, must fall back rather than error or silently disappear (e.g. web fetching
  degrade to the baseline when the Jina sidekick is down; search falls back to DuckDuckGo;
  memory falls back to the built-in provider when a configured one fails to load).

**How to place new capability — the rungs, in order (lowest to highest permanent surface):**

1. **Extend existing code** — a variation of something already present. Zero new surface.
2. **A gated tool** — a tool registered only when its prerequisite is configured (a
   config toggle or a service-gate). Real examples: `memory` gated on `memory.enabled`,
   `knowledge` on `knowledge.enabled`, and the Jina reader gated on `web.jina_base_url`.
3. **An extension** — a new factory registered via the `ExtensionAPI` (see
   `src/extensions/`); it can register tools, subscribe to lifecycle hooks, and is
   toggled through config.
4. **An MCP server** — if a capability needs structured tool I/O but isn't core, prefer
   connecting an MCP server (used through the single `mcp` proxy) rather than growing
   the core toolset.
5. **A new core tool** — only when it is fundamental, broadly useful, and unreachable
   through terminal/file or an extension. The default is to use a higher rung first.

**Reeboot-native idioms to respect:** the `ExtensionAPI` is the single contract all
capabilities use (with pi/ree SDK adapters bridging it); configuration is per-deployment
(single tenant per process, per-deployment config files); extensions are typically toggleable
via `config.extensions.core` / service gates; and every enhancement should degrade
gracefully to the baseline when its backend is absent. When in doubt, prefer the highest
rung that still solves the problem.

## Integration tests

After any major implementation (new SDK adapter, agent loop change, extension refactoring, Docker build change), validate the full system:

```bash
cd reeboot/tests/docker-integration
./run-pi.sh    # tests pi SDK in Docker (14 tests)
./run-ree.sh   # tests ree SDK in Docker (16 tests)
```

Both scripts build the Docker image, start a container with the target SDK config, run integration tests against the live container, and tear down. They require Docker and a reachable local LLM model.

Each script exits 0 on success, 1 on any test failure. Container logs are always printed for debugging.

## What the tests verify

- **Docker build** — the image builds cleanly from source
- **Container startup** — the server starts, config is loaded, health endpoint responds
- **REST API** — health, status, channels, contexts, tasks, budget, reload, logs stream
- **WebSocket chat** — connection, text turns, tool calls (bash, read), multi-turn conversation, abort
- **SDK-specific features** — pi: sessions, extensions; ree: concurrent chats, chat isolation

## Requirements

- Docker installed and running
- Local LLM model reachable at `http://100.107.230.26:3000/v1` (configured in `config-*.json`)
- No API keys needed — tests use the local model
