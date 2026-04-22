# Brief: Pi 0.68 Upgrade

## Problem

Reeboot pins `@mariozechner/pi-coding-agent` at `0.65.2`. The current release is `0.68.1` — three minor versions behind. The delta introduces no breaking changes affecting reeboot's code (the tool-selection API change and resource loader explicit-cwd requirement are already satisfied by our implementation), but it does add three new capabilities that are worth adopting at upgrade time:

1. **`session_shutdown` now carries a `reason` field** (`"quit" | "reload" | ...`). Three reeboot extensions — `mcp-manager`, `scheduler-tool`, and `skill-manager` — currently do full teardown unconditionally. On a `reeboot reload`, MCP server child processes are killed and restarted, active in-session timers are silently discarded, and the skill-manager polling loop is torn down and recreated. With the reason field these can be skipped on `"reload"`, making reloads faster and preserving timer state.

2. **`PI_CACHE_RETENTION=long` environment variable** extends the prompt cache TTL from 5 minutes to 1 hour (Anthropic) or 24 hours (OpenAI). Reeboot runs as a background service where conversations are frequently idle for longer than 5 minutes. Every message arriving after the cache expires pays full input token cost on the long stable system prompt (persona, memory snapshot, tool snippets). Setting this variable in `entrypoint.sh` and the daemon service generators is a zero-code cost reduction.

3. **`loadProjectContextFiles()` is now exported** as a standalone utility. The `reeboot doctor` command currently does not show which AGENTS.md / context files would be injected into a session. Adding this check gives operators pre-flight visibility into what the agent will see before starting.

## Goals

- Bump `@mariozechner/pi-coding-agent` to `0.68.1` with a clean test suite.
- Guard all three `session_shutdown` handlers to skip teardown on `"reload"`.
- Set `PI_CACHE_RETENTION=long` in `entrypoint.sh` and both daemon service generators (`generatePlist`, `generateSystemdUnit` in `daemon.ts`).
- Add a "Context files" check to `runDoctor()` using `loadProjectContextFiles()`.

## Non-goals

- No observability DB logging of shutdown events (tracked as a future idea in agent-roadmap.md).
- No changes to session management, auth, or the pi runner itself.
- No new features beyond what is listed above.

## Impact

Small and contained. Four source files touched (`mcp-manager.ts`, `scheduler-tool.ts`, `skill-manager.ts`, `daemon.ts`), two config files (`entrypoint.sh`, `package.json`), one new check in `doctor.ts`. No new dependencies.
