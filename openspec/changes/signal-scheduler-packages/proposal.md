## Why

WhatsApp and WebChat are working. This change completes Phase 1 feature parity by adding the remaining four pillars: Signal messaging channel, the task scheduler (so the agent can proactively act on a schedule), the community package system (`reeboot install`), and the credential proxy (so the agent process never holds real API keys). It also finishes the `reeboot doctor` diagnostics command, daemon mode (launchd/systemd), and error handling/reconnection logic throughout.

## What Changes

- Add `src/channels/signal.ts` — Signal channel adapter using `bbernhard/signal-cli-rest-api` Docker sidecar
- Implement `reeboot channels login signal` CLI action — Docker pull + signal-cli device linking
- Add `src/scheduler.ts` — `node-cron` based task scheduler persisting tasks in SQLite; fires scheduled prompts to context runners
- Fully implement `extensions/scheduler-tool.ts` — replaces stubs from Week 2 with real SQLite-backed `schedule_task`, `list_tasks`, `cancel_task` tools
- Add `src/credential-proxy.ts` — lightweight Fastify proxy on `localhost:3001`; intercepts LLM API calls, injects real keys, forwards response
- Implement `reeboot install / uninstall / packages list` — thin wrappers over the pi package system pointing at `~/.reeboot/` as agentDir
- Fully implement `reeboot doctor` — validates config, checks extension load, checks channel connections, checks API key validity, checks for signal-cli updates
- Implement daemon mode: `reeboot start --daemon` generates launchd plist (macOS) or systemd unit file (Linux) and registers it
- Add REST API routes: `GET /api/tasks`, `POST /api/tasks`, `DELETE /api/tasks/:id`
- Polish: error handling, reconnection logic, long-running turn timeout (5 min default), disk-full pre-check

## Capabilities

### New Capabilities

- `signal-adapter`: Signal channel adapter via signal-cli-rest-api Docker sidecar
- `scheduler`: node-cron task scheduler with SQLite persistence; agent-callable tools
- `credential-proxy`: Host-side API key proxy for sandboxed/container agent processes
- `package-system`: `reeboot install/uninstall/packages list` wrappers over pi package system
- `daemon-mode`: `reeboot start --daemon` with launchd/systemd unit file generation
- `doctor`: Full `reeboot doctor` diagnostics (config validation, extension health, channel health, API key check)

### Modified Capabilities

- `extension-loader`: `scheduler-tool.ts` extension fully wired to real SQLite-backed scheduler
- `http-server`: Task management routes (`GET /api/tasks`, `POST /api/tasks`, `DELETE /api/tasks/:id`) added
- `cli-entrypoint`: `reeboot install`, `reeboot uninstall`, `reeboot packages list`, `reeboot doctor` fully implemented (stubs removed)

## Impact

- New runtime dependencies: `node-cron`, `node-cron` types
- Signal adapter requires Docker to be installed on the user's machine (`reeboot doctor` checks this)
- Credential proxy runs as a second Fastify instance on port 3001 alongside the main server
- Pi package system integration: `reeboot install` calls pi's install mechanism with `~/.reeboot/` as agentDir
- Daemon mode writes files outside the project directory (launchd/systemd config paths)
