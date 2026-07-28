## Context

This is the final Phase 1 change. The orchestrator, two channels, context system, agent runner, and extension loader are all working. This change adds breadth: a second messaging channel (Signal), proactive scheduling, the credential security layer, the package ecosystem entry point, and operational tooling (doctor, daemon mode).

After this change, `npx reeboot` delivers the full Phase 1 promise: one command, multi-channel, scheduled, sandboxed, extensible personal AI agent.

## Goals / Non-Goals

**Goals:**
- Signal adapter: signal-cli-rest-api Docker sidecar integration, REST polling or webhook mode, registration flow
- Scheduler: node-cron + SQLite, agent-accessible tools, fires prompts to context runners on schedule
- Credential proxy: Fastify proxy on :3001, placeholder key swap, used in sandbox/container mode
- Package system: `reeboot install/uninstall/packages list` piping through pi's package mechanism
- Doctor: comprehensive pre-flight validation with actionable error messages
- Daemon mode: launchd plist (macOS) / systemd unit (Linux) generated and registered
- Error handling polish: LLM rate limit backoff, turn timeout (5 min), disk-full pre-check, WhatsApp/Signal disconnect notifications
- All stubs from previous changes fully implemented

**Non-Goals:**
- Docker container mode (Phase 3)
- Web UI (Phase 2)
- Multi-agent coordination
- MCP server support

## Decisions

### Signal adapter uses REST polling, not webhook
`bbernhard/signal-cli-rest-api` supports both REST polling (`GET /v1/receive/<number>`) and WebSocket streaming. The polling approach is simpler and avoids exposing a webhook endpoint to the Docker container. Poll interval: 1 second (configurable). This is adequate for personal use messaging latency.

### Scheduler stores tasks in SQLite, fires via orchestrator
Tasks are stored in the `tasks` table. At startup the scheduler reads all enabled tasks, registers cron jobs, and when a job fires it sends the task's `prompt` to the task's `contextId` via the orchestrator (same code path as a user message, just with `peerId: "scheduler"` and `channelType: "scheduler"`). The orchestrator routes "scheduler" channel type to the default context unless a specific context rule exists.

### Credential proxy is opt-in for sandbox mode
The credential proxy is only started when `config.sandbox.mode === "os"` AND `config.credentialProxy.enabled === true` (default: false for Phase 1 OS mode). In Phase 1, the agent process IS the main process and already has access to config, so the proxy is only useful when sandbox extensions actually block process-level env access. We implement it now for correctness and Phase 3 readiness, but it defaults to off.

### reeboot install is a thin wrapper, not a new package registry
`reeboot install npm:<package>` runs the equivalent of pi's install command with `agentDir = ~/.reeboot/`. Specifically: `npm install --prefix ~/.reeboot/packages <package>` and then register the installed package's `pi.extensions` and `pi.skills` paths in `~/.reeboot/config.json#extensions.packages`. `reeboot reload` picks up the new extensions. `reeboot packages list` reads the installed packages array from config.

### reeboot doctor outputs structured actionable messages
Each check in `doctor` produces: `✓ <check name>` (pass), `✗ <check name>: <reason> → Fix: <command or instruction>` (fail), or `⚠ <check name>: <warning>` (warn). Exit code 0 if all checks pass or only warnings, exit code 1 if any checks fail. Checks: config parses, all extensions load, API key validates (live ping), channels connect, signal-cli Docker image version, disk space > 1GB.

### Daemon mode: write unit file and register
On macOS: generate `~/Library/LaunchAgents/com.reeboot.agent.plist` pointing at `reeboot start`. Call `launchctl load <plist>` to register. On Linux: generate `~/.config/systemd/user/reeboot.service`. Call `systemctl --user enable --now reeboot`. The plist/service file references the full path to the `reeboot` binary.

### Turn timeout: 5 minutes, configurable
If `runner.prompt()` has not resolved after `config.agent.turnTimeout` milliseconds (default: 300,000 / 5 min), the orchestrator calls `runner.abort()` and sends the user "Your request timed out. The agent took too long to respond." The turn resolves as an error.

## Risks / Trade-offs

- **signal-cli Docker dependency**: Requires Docker on the user's machine. `reeboot doctor` checks and provides installation instructions. Signal adapter's `status()` returns `'error'` if Docker is not running.
- **Signal protocol updates every ~3 months**: signal-cli must be updated periodically. `reeboot doctor` checks the running Docker image version against the latest tag and warns if outdated.
- **node-cron task isolation**: All scheduled tasks run in the main process. A misbehaving task prompt can block the agent for up to 5 minutes. Mitigated by the turn timeout.
- **Pi package system version compatibility**: pi's install mechanism may change. This is a known risk; pin the pi SDK version and test after each update.
- **Daemon mode launchctl/systemctl availability**: Not all macOS/Linux environments have these. `reeboot doctor` checks. Fallback: run in foreground with a process manager like pm2.

## Open Questions

- Should `scheduler-tool.ts` validate cron expressions before inserting? → **Decision**: Yes, use `node-cron`'s `validate()` function. Invalid expressions return a tool error to the agent.
- Should the credential proxy support HTTPS/TLS? → **Decision**: No. It runs on loopback only and is used only from the sandboxed agent process. TLS on loopback is unnecessary complexity.
