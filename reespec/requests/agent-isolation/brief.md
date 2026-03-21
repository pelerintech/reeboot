# Brief: agent-isolation

## What

Fix the reeboot agent so it runs with its own isolated identity, persona, and auth — regardless of whether pi is installed on the host machine.

Specifically:
1. **Wizard**: detect pi auth and offer "use existing pi's provider, model and auth" vs "set up separate credentials". Store the choice as `authMode: "pi" | "own"` in config.json.
2. **Runner**: use `authMode` to route auth/model/settings. Always use `~/.reeboot/agent/` as `agentDir` for persona/extensions regardless of authMode.
3. **AGENTS.md path**: move from `~/.reeboot/contexts/main/AGENTS.md` (never read by pi) to `~/.reeboot/agent/AGENTS.md` (pi reads this as global context).
4. **Docker / headless**: entrypoint translates `REEBOOT_*` env vars to config, including `REEBOOT_AGENTS_MD` for persona injection without interactive setup.

## Why

Currently reeboot falls through to `~/.pi/agent/` for everything — model selection, auth, persona. On a machine with pi installed, the agent answers as the user's personal coding assistant (wrong persona, wrong model, possibly expensive model). On a clean machine, it fails with no API key. In Docker with env vars, there is no path from `REEBOOT_API_KEY` to a working agent.

## Goals

- Agent always runs with reeboot's own persona (`~/.reeboot/agent/AGENTS.md`)
- `authMode: "pi"` delegates model+auth to pi's existing config — zero friction for pi users
- `authMode: "own"` injects provider+model+key directly — works on any machine
- Docker headless deployment works with only env vars (no interactive setup)
- No accidental bleed from user's personal pi config

## Non-goals

- Multi-provider support for `authMode: "own"` (single provider only, for now)
- `/model` command to change model at runtime (future)
- Platform/template system for multi-agent deployments (separate product)
- Config bundle URL/base64 injection (platform concern, not reeboot's)
- SearXNG auto-detection of existing containers on non-default ports (separate request)

## Impact

- Fixes: agent responding as pi coding assistant instead of Reeboot
- Fixes: "No API key found" on clean machines
- Fixes: web search tool registered but model refuses to use it (persona issue)
- Enables: Docker headless deployments with env var config
- Enables: future platform building container deployments on top of reeboot
