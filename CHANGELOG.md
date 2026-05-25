# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.0] - 2026-05-25

### Added

- **Dangerous command detection (confirm-destructive)** — the `confirm_destructive` extension now inspects all `bash` tool calls against a two-tier pattern list. Hardline patterns (`rm -rf /`, fork bombs, disk zeroing, filesystem formats, `/etc/passwd` overwrites) are permanently blocked with no override. Dangerous patterns (recursive deletes, world-writable permissions, `curl|sh`, SQL DROP/DELETE/TRUNCATE, `kill -9`, `systemctl stop/restart/disable`, credential overwrites) are subject to the configured approval mode.
- **Approval modes — deny, manual, smart, off** — `security.dangerous_commands.mode` supports four strategies. `deny` (default, Phase 1 behavior) blocks all dangerous commands outright. `manual` prompts via `ctx.ui.confirm()` in CLI or writes a `.pending_approval.json` file in headless/messaging channels — the owner replies "yes" on their next message and the command is added to a session-scoped allowlist for one-touch approval across **all channels** (WhatsApp, Signal, webchat, CLI). `smart` calls the configured LLM for risk assessment: low-risk commands auto-approve, high-risk auto-deny, medium-risk escalates to manual. `off` allows all non-hardline dangerous commands and logs them to `operational_logs`.
- **YOLO mode** — `security.dangerous_commands.yolo: true` or `REEBOOT_YOLO_MODE=1` auto-approves all non-hardline dangerous commands for a session. Hardline blocklist still applies. Logged to `operational_logs` with `⚡ YOLO` indicator.
- **Approval timeout** — `security.dangerous_commands.timeout` (default 60s) enforces fail-closed approval. In CLI, passed to pi's `ctx.ui.confirm({ timeout })` so the TUI auto-dismisses with countdown. In headless/messaging channels, the `before_agent_start` handler checks `pending.created_at` against the timeout — expired approvals are denied and the pending file is deleted.
- **Hardline blocklist** — a separate list of catastrophically dangerous commands checked before all other logic. Blocked with reason `"permanently blocked (hardline)"` regardless of approval mode, YOLO toggle, or channel. No override path exists — these are the floor below YOLO.
- **SSRF protection** — new `src/security/ssrf-guard.ts` module. `isUrlSafe(url)` resolves the hostname via DNS and checks the IP against blocked ranges: RFC 1918 private networks, loopback (`127.x`, `::1`), link-local (`169.254.x.x` — includes cloud metadata), CGNAT (`100.64-127.x.x`), and cloud metadata hostnames (`metadata.google.internal`). Fail-closed on DNS failure. Configurable opt-out via `security.allow_private_urls: true`. Integrated into `fetch_url` / `web_search` / `fetchAndExtract`.
- **SSRF redirect re-validation** — `fetchAndExtract` now uses `redirect: 'manual'` and follows redirects manually (up to 10 hops). Each 3xx redirect target is re-checked against the website blocklist and SSRF guard before following — an attacker can't bypass SSRF by serving a 302 from a safe domain to `169.254.169.254`.
- **Website blocklist** — new `src/security/website-blocklist.ts` module. `security.website_blocklist` config supports exact domain matches and wildcards (`*.internal.company.com`). Case-insensitive. Checked before SSRF (cheaper — no DNS). Integrated into `fetch_url` / `web_search`.
- **MCP credential filtering** — MCP subprocesses no longer receive the full `process.env`. Only safe variables (`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL`, `TMPDIR`, `XDG_*`) are passed through, plus explicitly configured `env` entries from the MCP server config. Credential patterns (GitHub PATs, OpenAI keys, Bearer tokens, API keys, passwords, secrets) in MCP error messages are redacted via `redactCredentials()` before being returned to the LLM.
- **Supply chain advisory scanner** — new `src/security/advisory-scanner.ts` module. At startup, `bootstrapServerJobs()` calls `scanDependencies()` which reads `package-lock.json` and checks installed npm versions against a curated `advisories.json` catalog. Matched advisories are logged to `operational_logs` at `warn` level and printed as a stdout banner. `reeboot doctor` displays full advisory details with descriptions and remediation steps. `reeboot doctor --ack <id>` persists acknowledgements to `config.security.advisories.acked_advisories` — acked advisories are suppressed from startup warnings but still listed in doctor output with `[ACKED]` marker.
- **Trust enforcer** — new `src/extensions/trust-enforcer.ts` bundled extension that hooks `tool_call` events. For sessions with `trust: "end-user"`, it blocks any tool not in the session's allowlist, with special handling for pi built-ins (`setThinkingLevel`, `thinkingLevel`, `thinking_level`, `subagent_create`, `subagent_continue`, `subagent_remove`, `compact`, `session`). Configurable via `permissions.tiers` in `config.json` with per-tier allowlists.
- **Injection guard content scanner** — `src/extensions/injection-guard.ts` now scans content returned from `external_source_tools` (`fetch_url`, `web_search`, `mcp`) for injection patterns: ignore-prior-instructions directives, hidden HTML elements, zero-width Unicode characters, credential exfiltration patterns (`API_KEY=`, `token=`, `secret=`), and invisible Unicode overflow. Flagged or blocked based on pattern severity. The existing `<external_content_policy>` system prompt instruction is retained as complementary Layer 2 defense.
- **Protected paths expanded** — `src/extensions/protected-paths.ts` guard list grew from 4 paths to 15: added `~/.ssh/`, `~/.aws/`, `/etc/`, `/boot/`, `/sys/`, `/proc/`, `/dev/`, `/usr/`, `/bin/`, `/sbin/`, and `/var/`. Write attempts to these paths are blocked.
- **Config schema — new security fields** — `config.ts` now includes `DangerousCommandsSchema`, `WebsiteBlocklistSchema`, and `AdvisoryConfigSchema` under `SecurityConfigSchema`, with defaults: `dangerous_commands: { mode: 'deny', yolo: false, timeout: 60 }`, `website_blocklist: { enabled: false, domains: [] }`, `allow_private_urls: false`, `advisories: { acked_advisories: [] }`.
- **Documentation** — new `docs/security/approval-modes.md`, `docs/security/ssrf-protection.md`, and `docs/security/supply-chain.md`. Updated `docs/security/permission-tiers.md` and `docs/security/injection-guard.md` to reflect implemented behavior.
- **Test coverage** — 136 security tests across 12 test files: `dangerous-commands.test.ts`, `hardline-blocklist.test.ts`, `approval-modes.test.ts`, `approval-timeout.test.ts`, `yolo-mode.test.ts`, `ssrf-guard.test.ts`, `website-blocklist.test.ts`, `url-tool-guards.test.ts`, `mcp-credential-filtering.test.ts`, `advisory-scanner.test.ts`, `bootstrap-advisory-scanning.test.ts`, `config-security-fields.test.ts`, plus expanded `injection-guard-scanning.test.ts`, `protected-paths-expanded.test.ts`, `trust-enforcer.test.ts`, and `pi-runner-tool-scanning.test.ts`.

---

## [2.4.0] - 2026-05-24

### Added

- **Docker Compose full-stack deployment** — new `docker-compose.yml` at repo root defines the complete stack (reeboot, searxng, signal-cli, caddy). Caddy is commented out by default for opt-in HTTPS. All services can be commented out individually. Clone the repo, copy `config.example.json` to `./data/config.json`, edit, and `docker compose up -d` — no Node.js, npm, or `reeboot` CLI required on the host. Bind mount `./data:/home/reeboot/.reeboot` persists config, DB, memories, and sessions across restarts and image rebuilds. Compatible with orchestrators like Coolify (bind mount + build directive).
- **`config.example.json`** at repo root — documented config template with every ConfigSchema key, populated with defaults and inline `"$comment"` documentation keys. Docker DNS names used (`search.searxngBaseUrl: "http://searxng:8080"`, `channels.signal.apiPort: 8080`). Valid JSON — `JSON.parse` and `ConfigSchema.parse()` both accept it directly, so the user can literally `cp config.example.json ./data/config.json` and start.
- **`.dockerignore`** at repo root — excludes `node_modules/`, `.git/`, `data/`, `dist/`, and `*.tgz` from the Docker build context, reducing build time and preventing accidental secrets-in-image.
- **Docker deployment documentation in both READMEs** — root `README.md` now describes the `git clone → cp config.example.json ./data/config.json → docker compose up -d` flow instead of a non-existent Docker Hub image. `reeboot/README.md` has a new `## Docker` section referencing the compose path and linking to the root README.

- **`src/bootstrap.ts` — centralised server job registration** — a single `bootstrapServerJobs(db, scheduler, config)` function owns the authoritative list of background cron jobs to register at boot. Called from `server.ts` immediately after `setGlobalScheduler()`. Adding a new background job now means exporting a `registerServerJobs()` from the extension file and adding one call in `bootstrap.ts` — nothing else.

### Changed

- **Dockerfile: `ENV PATH` includes `node_modules/.bin`** — added `ENV PATH="/home/reeboot/node_modules/.bin:$PATH"` after `WORKDIR` in `reeboot/container/Dockerfile`. Both `npx reeboot` and direct `reeboot` CLI calls now work inside the container without path prefixing.
- **`.gitignore`: `data/` added to Runtime data section** — user config, DB, and state under `./data/` are never accidentally committed.
- **Root README: removed non-existent Docker Hub image link** — the `reeboot/reeboot:latest` image reference and `hub.docker.com/r/reeboot/reeboot` link are gone. Replaced with the docker-compose deployment flow.
- **Reeboot README: removed Docker Hub link from Links section** — npm, docs, and changelog links preserved. Setup wizard step numbering updated to start from "1. **Provider**" instead of "1. **Deployment** — native (default) or Docker (coming soon)".
- **Setup wizard: removed Docker deployment choice** — `reeboot init` no longer asks "Native or Docker?" as its first step. The wizard starts directly with provider selection. Docker is a separate documented path, not a wizard branch.

### Fixed

- **`docker-compose.yml` build directive corrected** — the design specified `context: .` (repo root) with `dockerfile: container/Dockerfile`, but the actual repo layout places the Dockerfile at `reeboot/container/Dockerfile` and the repo root has no `package.json`. Fixed to `context: reeboot/` with `dockerfile: container/Dockerfile`, matching the actual file structure and giving the Dockerfile's `COPY package*.json ./` a valid source.

- **Background jobs never registered on cold start** — `__memory_consolidation__` and `__knowledge_lint__` were previously wired to `session_start`, an event that only fires when `bindExtensions()` is called — which reeboot never did. Both jobs are now registered via `registerServerJobs()` exported from their respective extensions (`memory-manager.ts`, `knowledge-manager.ts`) and called from `bootstrapServerJobs()` at server start, before any user session exists. Jobs appear in the `tasks` table within seconds of startup with correct `status='active'` and computed `next_run`. Registrations are idempotent (survive server restart); failures in one registration do not block others.

- **Session lifecycle events never fired** — `session_start` and `session_shutdown` are pi SDK events that only emit when `AgentSession.bindExtensions()` is called. `PiAgentRunner._getOrCreateSession()` now calls `session.bindExtensions({ shutdownHandler })` after session creation, so bundled and user-defined extensions receive `session_start` on every new session. `reset()` emits `session_shutdown` with `reason: 'new'`; `dispose()` emits with `reason: 'quit'`. The `shutdownHandler` bridges pi-internal `ctx.shutdown()` calls to the runner's `reset()` path. When `emitSessionShutdownEvent` throws, the error is caught and logged, and `_session` is still nulled (teardown always completes).

- **`knowledge-manager` was completely dead** — the extension tried to access config, db, and scheduler via phantom `(pi as any).getConfig?.()`, `(pi as any).getDb?.()`, `(pi as any).getScheduler?.()` — none of which exist on the real `ExtensionAPI`. The extension exited immediately, registering nothing. Fixed: `makeKnowledgeExtension(pi, config, db?)` now receives config and db as explicit arguments from the loader. When `knowledge.enabled: true`, `knowledge_search`, `knowledge_ingest`, and wiki tools (`knowledge_file`, `knowledge_lint`) are now correctly registered. The file watcher starts on the raw knowledge directory. `loadVecExtension(db)` and `runKnowledgeMigration(db)` are called when db is provided.

- **`session_search` crashed silently in production** — used `require()` inside an ESM module (`"type": "module"`), throwing `ReferenceError` at runtime. The error was caught and swallowed as "Database not available". Fixed: uses ESM-compatible `await import('../db/index.js')`. When the DB is genuinely unavailable, returns `{ results: [], error: 'Database not available' }` gracefully without an unhandled exception.

- **`budget-manager` got wrong workspace path** — the loader was passing `process.cwd()` (the reeboot package root at startup) instead of the context's actual workspace path. `getBundledFactories(context, config)` now receives `ContextConfig` as its first argument and passes `{ workspacePath: context.workspacePath, config }` to `makeBudgetManagerExtension`. `.task_budget.json` writes now go to the correct context workspace directory.

- **`scheduler-registry` had no deferred queue** — any `registerJob()` call that raced startup (before `setGlobalScheduler()`) was silently dropped into the `noopScheduler` stub with no recovery. The registry now maintains a `_pending` array; jobs registered before the real scheduler is set are queued and drained in registration order when `setGlobalScheduler()` fires. Once the real scheduler is set, jobs forward immediately. Calling `setGlobalScheduler()` a second time does not re-deliver already-drained jobs.

## [2.3.0] - 2026-05-22

### Added

- **Centralized capabilities discovery extension** (`src/extensions/capabilities.ts`) — a new bundled extension that hooks `before_agent_start`, calls `pi.getAllTools()` to discover every registered tool dynamically, filters out pi built-ins, and injects a structured capabilities block into the system prompt. This replaces the scattered `promptSnippet` approach which was easy to forget and missed user extensions entirely. All tools are treated equally — bundled, user, MCP, and skill tools are all advertised automatically. Emits a `capabilities_injected` observability event with `toolCount`, `toolNames`, and `sourceBreakdown`.

### Changed

- **Capabilities extension: two-tier tool capping** — bundled (internal) tools are now never capped; only external/user-defined tools are subject to a cap. Previously a flat `MAX_TOOLS = 30` applied to all tools, which could silently hide mandatory bundled tools like `memory` and `session_search` when MCP servers added 30+ tools. The default external tool cap is now `50` (up from `30`), and is configurable via `config.json → capabilities.externalToolCap`. Set it to `0` to hide all external tools, or a very high number to effectively disable capping.

### Fixed

- **Memory consolidation scheduler race condition** — the `__memory_consolidation__` scheduled job was previously registered inside `makeMemoryExtension` at extension load time, when `globalScheduler` was still `noopScheduler`. The fix moves registration to a `session_start` event handler with a module-level `_consolidationRegistered` guard against double-registration. A `noopScheduler` export was added to `scheduler-registry.ts` so the handler can distinguish the real scheduler from the stub. This ensures consolidation actually fires after server startup.

---

## [2.2.1] - 2026-05-21

### Security

- **`@whiskeysockets/baileys` patched to `6.7.22`** — fixes a zero-day (GHSA-qvv5-jq5g-4cgg, critical) that allowed spoofing of message upserts and app state corruption via maliciously crafted `protocolMessage` payloads. Drop-in patch; no API changes.

---

## [2.2.0] - 2026-05-21

### Changed

- **`@earendil-works/pi-coding-agent` upgraded to 0.75.4** — bumped pin from `0.74.0`. Picks up four releases (0.74.1–0.75.4): image generation APIs, Together AI provider, Windows ARM64 binaries, improved markdown rendering, Node 26 fetch compatibility fixes, HTTP idle timeout fix for long-running provider streams, OpenAI prompt cache key length fix, subagent parallel output fix, `ctx.abort()` preflight fix, AgentSession retry/compaction settlement fix, and supply-chain hardening (shrinkwrap, lifecycle-script allowlists). No reeboot code changes required — none of the breaking changes affect the API surface reeboot uses (`createAgentSession`, `DefaultResourceLoader`, `SessionManager`, `ModelRegistry`, `AuthStorage`, `SettingsManager`, `ExtensionAPI`, `convertToLlm`, `serializeConversation`, `loadProjectContextFiles`, `DefaultPackageManager`).
- **`@huggingface/transformers` upgraded to `^4.2.0`** — minor release; no API changes affecting the knowledge-manager embedding pipeline.
- **`@hono/node-server` floor raised to `^1.19.14`** — stays on the v1 line (v2 is a major with breaking changes, deferred). Picks up patch fixes within the v1 range.
- **`@hono/node-ws` upgraded to `^1.3.1`** — patch.
- **`inquirer` floor raised to `^13.4.3`** — patch.
- **`typebox` floor raised to `^1.1.38`** — patch.
- **`ws` floor raised to `^8.20.1`** — patch.
- **`zod` floor raised to `^3.25.76`** — pins to the latest Zod 3 patch (Zod 4 is a major with breaking changes, deferred).
- **Dev: `@types/node` floor raised to `^20.19.41`**, **`tsx` to `^4.22.3`**, **`typescript` to `^6.0.3`** — patch/minor bumps within their current major lines.
- **`@whiskeysockets/baileys` stays at `6.7.21`** (v7 is pre-release RC, deferred), **`@hono/node-server` stays on v1** (v2 major, deferred), **`vitest` stays at `^1.6.1`** (v4 major, deferred), **`zod` stays on v3** (v4 major, deferred).

### Fixed

- **`custom-compaction` extension: removed private `@earendil-works/pi-ai` import** — the extension was importing `complete()` directly from `@earendil-works/pi-ai`, a transitive dependency of pi that is not hoisted to the top-level `node_modules` and has no public `exports` entry. This caused a `Cannot find module` TypeScript error on every build. Replaced with `generateSummary()` exported from `@earendil-works/pi-coding-agent` (the public API), which provides the same behaviour and also accepts `customInstructions` and `previousSummary` natively — removing the need to hand-build the prompt.

- **WhatsApp silent-death regression (ebe5c69)** — the reconnect logic introduced
  in the `ebe5c69` commit treated `await _connect()` as "connection established"
  when it actually returned immediately after registering event handlers. If a
  socket stalled (never firing `'open'` or `'close'`), `_reconnecting` would stay
  `true` permanently and the adapter would sit dead-silent with no logs, no retries,
  and no recovery. This caused a 3-day production outage (May 18–21, 2026).

  **Root fix:** `_connect()` is now a proper awaitable Promise that resolves only
  when `'open'` fires and rejects on `'close'` or a 30-second watchdog timeout.
  The reconnect handler is replaced with `_reconnectLoop()` — a persistent
  `while (!this._stopping)` loop that retries with exponential backoff and cannot
  get stuck regardless of how Baileys behaves internally.

- **Dropped sends are no longer silent** — `send()` previously returned silently
  when the socket was reconnecting. It now logs `warn` with `component`, `peerId`,
  and `status` so investigators can reconstruct what happened.

- **systemd unit upgraded to `Restart=always`** — previously `Restart=on-failure`
  only triggered on non-zero exits. A hung (not crashed) process would run
  indefinitely without restart. `Restart=always` covers both cases.
  `StartLimitBurst=5` within `StartLimitIntervalSec=120` prevents crash loops.

### Added

- **WhatsApp `channel_stalled` DB event** — when a connect attempt times out
  (30s watchdog) or when the reconnect loop has been running for more than 5
  minutes without success, a `channel_stalled` event (severity 17 / ERROR) is
  emitted to the `operational_logs` table. Investigators can query this table
  to find the exact time and attempt count of any future outage.

- **"I'm back" proactive notification** — when WhatsApp reconnects after more
  than 5 minutes of downtime, the agent sends a short message to the last peer
  who wrote to it: `⚡ I'm back online. I was unreachable for ~N minutes.`
  Normal reconnects (< 5 min, which happen ~3x/day as part of normal WA Web
  protocol) do not trigger the notification.

- Read receipts on WhatsApp and Signal — incoming messages are marked as read
  (blue ticks / read receipt) immediately on arrival, before the agent turn begins.
- Typing indicator on WhatsApp and Signal — three-dot typing indicator is shown
  for the full duration of an agent turn. WhatsApp indicator refreshes every 8 seconds
  to stay alive during long-running tasks (research, multi-step planning).
  Disappearing dots with no reply serve as an implicit signal that the agent
  encountered a problem.

---

## [2.1.0] - 2026-05-10

### Breaking

- `reeboot start` (and bare `reeboot`) no longer launch the setup wizard when no config
  exists — they now error with a clear message and instruct the user to run `reeboot init`.
  Deployments that relied on `reeboot start` triggering first-run setup must switch to
  `reeboot init`.

### Added

- `reeboot init` — dedicated first-time setup wizard with deployment choice step (Docker
  shows "coming soon" and falls through to native).
- `reeboot channels setup owner-whatsapp` — captures the owner's exact WhatsApp `peerId`
  from a live message, eliminating the `@s.whatsapp.net` vs `@lid` format ambiguity.
- Local providers (llama.cpp, LM Studio, Custom OpenAI-compatible endpoint) in the wizard
  provider list; local providers appear before cloud providers (private-first ordering).
- Live model fetch from provider APIs after API key entry; static curated lists used as
  fallback when fetch fails or times out.
- Local model auto-detection: pings running server, shows detected models as a select list;
  falls back to manual input if server is unreachable.
- "Enter custom value..." escape hatch on all wizard select menus (provider, model, search
  backend) — allows any value without being blocked by the curated list.
- "Start the agent now?" prompt at the end of `reeboot init` — Y starts immediately,
  N prints run instructions.

### Fixed

- Wizard provider/model menus degraded to plain text on Linux SSH (inquirer v13 API
  mismatch) — `InquirerPrompter` now uses the `@inquirer/prompts` individual functions
  (`select`, `input`, `password`, `checkbox`, `confirm`).
- WhatsApp `enabled: false` after QR scan — `channels.whatsapp.enabled` is now written
  to config on successful link (both wizard and standalone `reeboot channels login whatsapp`).
- Agent always introduced itself as "Reeboot" regardless of configured name — the
  `templates/main-agents.md` template now uses `{{AGENT_NAME}}` substituted at scaffold
  time, and on every `reeboot setup` re-run.
- Cloud provider step now prompts for API key before model (provider → API key → model),
  enabling live model fetch.

---

## [2.0.1] - 2026-05-09

### Fixed

- **`reeboot channel` commands not found** — all channel subcommands were documented as `reeboot channel *` (singular) but the CLI registers them under `reeboot channels *` (plural). Updated all references in `README.md`, `docs/getting-started/quick-start.md`, `docs/getting-started/setup-wizard.md`, and `docs/channels/whatsapp.md`.

- **Daemon fails to start with nvm (exit code 127)** — `reeboot start --daemon` generated systemd and launchd service files that relied on `#!/usr/bin/env node` to resolve the node binary. On machines using nvm, systemd user services don't inherit the shell environment so `node` was not found in PATH, causing the service to exit immediately with code 127. The daemon generator now uses `process.execPath` (the full path to the node binary that ran `reeboot`) in `ExecStart`, making it work correctly regardless of how node was installed (nvm, homebrew, system package, etc.).

---

## [2.0.0] - 2026-05-08

### Fixed

- **Config reset on wizard re-run** — the setup wizard (`reeboot setup`, `reeboot config wizard`) was building a brand-new config from `defaultConfig` on every run, silently discarding existing custom settings such as `authMode: 'pi'`, custom tool whitelists, channel trust rules, and user preferences. Both the interactive launch step (`src/wizard/steps/launch.ts`) and the non-interactive wizard (`src/setup-wizard.ts`) now **merge with any existing config**, preserving all user edits while only updating the fields being configured. Uses a shared defensive `fb()` fallback helper (`src/utils/fallback.ts`) so every section defaults safely when the existing file is missing or incomplete.

- **Session resume after restart** — the agent now correctly resumes the most recent conversation on restart instead of starting a blank session every time. `getResumedSessionPath` previously filtered for `session-*.json` files; pi's `SessionManager` actually creates `<ISO-timestamp>_<uuid>.jsonl` files. The filter was updated to match the real format. As a side effect, the "I may not have responded to your last message" unanswered-message detection on restart is also now active.

- **Memory extension never loaded** — `memory-manager.ts` and `knowledge-manager.ts` were located in `extensions/` (root), which is outside `tsconfig.json`'s `rootDir: "./src"` and was never compiled. Both files have been moved to `src/extensions/` so they are compiled into `dist/` and loaded correctly on startup. `~/.reeboot/memories/MEMORY.md` and `USER.md` are now created on first run as intended.

- **Memory extension wiring** — even if the file had been found, three internal wires were broken: the extension called `pi.getConfig()`, `pi.getDb()`, and `pi.getScheduler()` which do not exist on pi's `ExtensionAPI`. All three replaced with the correct patterns: config is passed as a second argument from the loader (matching `web-search` and `mcp-manager`); DB and scheduler are accessed via `require('../db/index.js')` and `require('../scheduler-registry.js')` (matching `scheduler-tool.ts`). The loader was also not passing `config` when invoking the memory factory — fixed.

- **`session_search` always-on** — the loader was gating the entire memory-manager factory (including `session_search`) behind `memory.enabled`. The guard has been removed so `session_search` is always registered, as the original spec required. The `memory` tool and system prompt injection remain gated on `memory.enabled`.

- **`messages` table always empty** — the `messages` table existed in the schema and the FTS5 index was configured, but nothing ever wrote to it. Turns completed, responses went back to channels, and the table stayed at zero rows — making `session_search` and memory consolidation effectively useless. The orchestrator now writes user and assistant message rows to the DB after each completed turn. Scheduler and recovery turns are excluded (synthetic peer IDs).

- **Agent doesn't know what channel it's on** — `channelType` and `peerId` were present in the orchestrator when a message arrived but were silently dropped before reaching `runner.prompt()`. The agent had to guess its channel by running `reeboot channels list` and frequently guessed wrong (defaulting to "web" even during WhatsApp conversations). The orchestrator now prepends `[channel: X | peer: Y]` to every dispatched prompt, giving the agent reliable identity context. Scheduler and recovery turns are excluded.

- **Reminders and scheduled tasks delivered nowhere** — two broken systems existed in parallel. The `timer` tool used an in-memory `setTimeout` that bypassed the orchestrator entirely — the agent produced a response but it was never routed to any channel. The `schedule_task` tool was DB-persisted but dispatched replies to a fake `'scheduler'` adapter that doesn't exist, so every scheduled reply was silently dropped. Both are now fixed:
  - The `timer` tool has been removed. All time-based actions go through `schedule_task` (persisted, survives restart).
  - `schedule_task` now accepts `origin_channel` and `origin_peer` parameters and stores them on the task row.
  - When a task fires, the prompt is enriched with routing instructions (`buildScheduledPrompt`) so the agent knows to call `send_message` targeting the correct channel and peer.
  - The orchestrator's `_reply` method now routes scheduler turn replies to `origin_channel`/`origin_peer` from `msg.raw`, or broadcasts to all adapters if no origin is set (e.g. tasks created via REST API).

### Added

- **Personal memory** — the agent now remembers facts, preferences, and corrections across sessions via two bounded markdown files (`~/.reeboot/memories/MEMORY.md` and `USER.md`). Both files are injected as a frozen snapshot into the system prompt at session start with usage percentage and char counts. The agent manages them during sessions via a `memory` tool (add/replace/remove entries) gated on `memory.enabled`. A background consolidation process (scheduled via `memory.consolidation.schedule`, default `0 2 * * *`) mines past conversations and distils new insights into memory — with auto-capacity management and `memory_log` observability logging when files are near full. Content is scanned for prompt injection patterns, credential patterns, and invisible Unicode before any write.

- **Session search** — a `session_search` tool is always registered (regardless of `memory.enabled`) providing FTS5 full-text search over the `messages` table. Returns matching messages with role, timestamp, and content excerpt ordered by relevance. Zero new npm dependencies — uses the FTS5 virtual table built into SQLite.

- **Memory config** — new `memory` section in `config.json` with defaults `enabled: true`, `memoryCharLimit: 2200`, `userCharLimit: 1375`, `consolidation.enabled: true`, `consolidation.schedule: "0 2 * * *"`. Memory is on by default for all deployments.

- **Domain knowledge corpus** (`knowledge.enabled: false` by default) — local, persistent RAG for domain-specific deployments. Drop documents into `~/.reeboot/knowledge/raw/owner/` and the agent detects, indexes, and searches them using hybrid vector + keyword retrieval — all offline, no API key required. Details:
  - **Supported formats**: `.md`, `.txt`, `.csv` (column-context preprocessing), `.pdf` (text extraction via `pdf-parse`)
  - **Embedding model**: `nomic-ai/nomic-embed-text-v1.5` via `@huggingface/transformers` (local ONNX, downloaded once to `~/.cache/huggingface/` on first use, ~150 MB)
  - **Hybrid search**: vector KNN (`sqlite-vec` extension) + FTS5 keyword search merged and deduplicated; query results cite filename, source tier, and confidence
  - **Two-tier provenance**: `source_tier` (`template` | `owner`) tracks epistemic distance; `confidence` (`high` | `medium` | `low`) is LLM-assigned at ingest
  - **File watcher**: `fs.watch` on `raw/` with 300 ms debounce; new files are queued and the agent offers interactive or silent ingest
  - **Tools registered**: `knowledge_search`, `knowledge_ingest` (always when enabled); `knowledge_file`, `knowledge_lint` (when `wiki.enabled: true`)
  - **Optional wiki synthesis layer** (`knowledge.wiki.enabled: false` by default): LLM-maintained interlinked markdown pages at `~/.reeboot/knowledge/wiki/` — concept pages, source summaries, filed query insights, and a scheduled lint pass (default weekly)
  - **New config section**: `knowledge` with sub-keys `embeddingModel`, `dimensions` (768, Matryoshka-reducible), `chunkSize` (512), `chunkOverlap` (64), `wiki.enabled`, `wiki.lint.schedule`
  - **New npm dependencies**: `sqlite-vec ^0.1.9`, `@huggingface/transformers ^4.1.0`, `pdf-parse ^2.4.5`

- **Resilience & crash recovery** — reeboot now recovers gracefully from process crashes, machine restarts, and upstream LLM provider outages. Details:
  - **Ephemeral turn journal** — every agent turn opens a per-turn journal row in SQLite at turn start; every tool call within the turn is appended (name, full input, full output, timestamp, status); on successful completion the journal row is deleted. An unclosed row on next startup signals a crashed turn.
  - **Crash recovery on startup** — on restart, stale journals older than 24 h are silently discarded with a warning; for recent unclosed journals, policy (`safe_only` / `always` / `never`) determines whether the turn is auto-requeued or the user is notified. `safe_only` (default) auto-resumes turns where no side-effectful tool had already fired; `always` re-runs unconditionally; `never` always notifies the user. A configurable `side_effect_tools` list declares non-idempotent tools (e.g. `send_email`, `post_slack`).
  - **Restart notification & unanswered message surfacing** — on every restart, all configured channels receive a "I was restarted" notice. If the last session ends with a user message that received no reply, an additional alert is broadcast so the user knows to re-send.
  - **Scheduled task catchup** — on restart, tasks whose `next_run` was missed within a configurable catchup window (default `1h`) are fired immediately; tasks missed beyond that window advance to their next natural occurrence. Deduplicated so each task fires at most once per restart. Per-task override via a `catchup` column (`"always"` / `"never"` / custom duration).
  - **Outage detection & self-healing** — after `resilience.outage_threshold` (default `3`) consecutive provider-related failures, reeboot declares an outage: inserts an `outage_events` DB row, broadcasts a notification to all channels, and creates a scheduler probe task. The probe makes a lightweight HTTP health-check against the provider every `resilience.probe_interval` (default `1h`) — no LLM call. Two consecutive successes trigger resolution: broadcasts a recovery message listing prompts lost during the outage (capped at 20; overflow flagged), cancels the probe, and resets the failure counter. Non-provider errors (validation failures, etc.) do not count toward the threshold.
  - **New DB tables** — `turn_journal`, `turn_journal_steps`, `outage_events`; `tasks` gains a `catchup` column. All created via `runResilienceMigration()` at startup.
  - **New `resilience` config section**:
    ```json
    "resilience": {
      "recovery": {
        "mode": "safe_only",
        "side_effect_tools": ["send_email", "post_slack", "publish_content"]
      },
      "scheduler": { "catchup_window": "1h" },
      "outage_threshold": 3,
      "probe_interval": "1h"
    }
    ```
  - **New `src/resilience/` module** — `turn-journal.ts` (`TurnJournal` class), `startup.ts` (`cleanStaleJournals`, `recoverCrashedTurns`, `applyScheduledCatchup`, `notifyRestart`, `scanSessionForUnansweredMessage`).
  - **`broadcastToAllChannels` utility** — `src/utils/broadcast.ts` iterates all registered channel adapters and delivers a system message to each, swallowing per-adapter errors so one failing channel never blocks others.
  - **`getSessionPath()` on `AgentRunner`** — pi-runner now exposes the active session file path so crash recovery can scan it for unanswered messages.
  - **Resilience wiring order in `server.ts`** — DB-only operations (`runResilienceMigration`, `applyScheduledCatchup`) run immediately at init; channel-facing operations (`notifyRestart`, `recoverCrashedTurns`, unanswered-message scan) run after channel adapters are registered so notifications are never silently dropped.

### Changed

- **`@mariozechner/pi-coding-agent` upgraded to 0.68.1** — bumped pin from `0.65.2`. No breaking changes affect reeboot's code: `createAgentSession` does not receive a `tools` array in our runner, `DefaultResourceLoader` already passes explicit `cwd` and `agentDir`, and none of the removed tool exports (`readTool`, `bashTool`, etc.) are imported. Picks up three minor releases of bug fixes, new providers, and the capabilities below.

- **Graceful reload teardown** — `mcp-manager`, `scheduler-tool`, and `skill-manager` now inspect the new `session_shutdown` event `reason` field added in pi 0.68. On `reeboot reload`, MCP server child processes are no longer killed and restarted, active in-session timers are preserved, and the skill-manager polling loop continues uninterrupted. Full teardown still runs on `quit` (SIGTERM, SIGHUP, `reeboot stop`).

- **Extended prompt cache** — `PI_CACHE_RETENTION=long` is now set in `entrypoint.sh` (Docker) and both daemon service generators (launchd plist on macOS, systemd unit on Linux). Extends the LLM provider prompt cache TTL from 5 minutes to 1 hour (Anthropic) or 24 hours (OpenAI), reducing input token costs for idle deployments where conversations are frequently separated by more than 5 minutes.

- **`reeboot doctor` reports context files** — the pre-flight diagnostic now includes a "Context files" check using `loadProjectContextFiles()` (newly exported in pi 0.68). Shows which `AGENTS.md` and context files would be injected into the agent session for the current workspace. Reports `pass` with file paths when found, `warn` with a fix hint when none are present.

### Added (continued)

- **Structured observability** — full audit and log pipeline built on [pino](https://getpino.io) with three output streams:
  - **stdout** — NDJSON (newline-delimited JSON) at the configured log level; machine-readable, pipe-friendly
  - **File** — warn+ records written to `~/.reeboot/logs/reeboot-YYYY-MM-DD.log`; rotated daily, pruned after `logging.retention_days` (default 30)
  - **SSE live stream** — all log records forwarded in real time to `GET /api/logs/stream`; consumed by `reeboot logs --follow`
  - **`reeboot logs`** CLI command — tails the current log file; `--follow` switches to SSE streaming; `--level` filters by minimum severity
  - **`events` table** — structured audit log in SQLite with OTEL-compatible schema: `trace_id` (32-char hex), `span_id` (16-char hex), `created_ns` (Unix epoch nanoseconds), `severity` (OTEL integer). Captures channel connect/disconnect, turn open/close, rate limit warnings, budget events, permission violations
  - **`operational_logs` table** — warn+ pino records persisted to SQLite for queryable post-mortem analysis; pruned on the same `retention_days` schedule as the file log
  - **`session_events` table** — per-session lifecycle events (start, compaction, shutdown) indexed by session ID
  - **`rate_limit_warn_threshold`** config field — emits a `rate_limit_warning` event when remaining tokens fall below the threshold (default 5000); visible in both the events table and the SSE stream
  - **New `logging` config section**: `level` (trace/debug/info/warn/error/fatal, default `info`), `retention_days` (default 30), `rate_limit_warn_threshold` (default 5000)

- **Token budget management** — per-context spending controls with three enforcement layers:
  - **Daily limit** — `budget.daily_tokens` and `budget.daily_cost_usd`; resets at midnight; enforced at turn start
  - **Session limit** — `budget.session_tokens` and `budget.session_cost_usd`; resets when the session is replaced
  - **Turn limit** — `budget.turn_tokens` and `budget.turn_cost_usd`; enforced per-turn; hard-stops the agent mid-task if exceeded
  - **Warn threshold** — `budget.warn_threshold` (default `0.8`); agent receives a budget warning when 80% of any limit is consumed
  - **Cost tracking** — via pi's built-in `ModelRegistry`; per-token pricing for Anthropic, OpenAI, Google, Groq, and other major providers; local models (Ollama) report "cost unavailable" rather than $0.00 to avoid misleading spend reporting
  - **Agent budget tools** — three tools registered when `extensions.core.token_meter` is enabled:
    - `set_budget(amount, unit)` — agent declares a per-task spending ceiling; triggers a feasibility self-assessment before starting work
    - `check_budget()` — agent checks task spend vs. budget and global daily limits mid-task
    - `budget_status(period, operationType)` — owner queries historical spend by period (`today`, `week`, `last`) and operation type (`user_message`, `scheduler`, `memory`, `heartbeat`, `recovery`)
  - **Budget exhaustion enforcement** — when a task budget is exceeded the agent receives a hard stop instruction on the next `before_agent_start` event; all further tool calls are blocked and the agent delivers whatever it completed
  - **`usage` table** — per-turn cost and token records with `cost_usd`, `input_tokens`, `output_tokens`, `operation_type`, and `context_id`; provides the data source for `budget_status` queries
  - **New `budget` config section**: `daily_tokens`, `daily_cost_usd`, `session_tokens`, `session_cost_usd`, `turn_tokens`, `turn_cost_usd`, `warn_threshold` (all nullable/optional, default no limits)

### Fixed

- **WhatsApp `fetchProps` timeout logged as error on every connect** — Baileys fires `executeInitQueries` on every `connection.update: open` event, which includes a `fetchProps` IQ query that WhatsApp's servers never answer for unofficial clients. After the hardcoded 60-second timeout Baileys logged `"unexpected error in 'init queries'"` at ERROR level on every single startup. Fixed by setting `fireInitQueries: false` in `makeWASocket` — the query is skipped entirely. Basic messaging is unaffected; `fetchProps` only retrieved server-side feature flags not used by reeboot.

- **WhatsApp reconnect could crash the process** — the `connection.update` close handler called `await this._connect()` with no surrounding try/catch. If the reconnect attempt itself threw (e.g. `fetchLatestWaWebVersion` failing on a flaky network), the async event handler produced an unhandled promise rejection which exited the Node process. Added a try/catch around the reconnect call and reset `_reconnecting` to `false` on failure so the adapter can retry on the next disconnect event.

- **WhatsApp reconnect had no backoff** — on any non-logout disconnect reeboot reconnected immediately in a tight loop, hammering WhatsApp's servers and making transient failures self-reinforcing. Reconnects now use exponential backoff starting at 2 s, doubling per attempt up to a 60 s cap. The attempt counter resets to 0 on each successful `connection: open` event.

### Breaking changes

- **HTTP server migrated from Fastify to Hono** — the internal HTTP server has been rewritten using [Hono](https://hono.dev) (`hono ^4.12`, `@hono/node-server ^1.14`, `@hono/node-ws ^1.1`). Fastify is no longer a dependency. **Impact**: the external API surface (`/api/health`, `/api/status`, `/api/logs/stream`, `/ws`, static webchat assets) is unchanged. However, any custom extensions or scripts that import internal Fastify types or rely on Fastify plugin behaviour will break — update them to use Hono's request/response API.

- **`sqlite-vec` native extension loaded unconditionally at database open** — `openDatabase()` now loads the `sqlite-vec` native extension on every startup, regardless of `knowledge.enabled`. `sqlite-vec` ships pre-compiled binaries for `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, and `win32-x64`. **The official reeboot Docker image (`node:22-slim`, Debian glibc) is unaffected.** However, if you are running a custom Docker image based on Alpine Linux (`node:alpine`, `node:XX-alpine`), startup will fail with an "Unsupported platform" error because Alpine uses musl libc. Switch to a glibc-based image (`node:XX`, `node:XX-slim`, `node:XX-bookworm-slim`) before upgrading.

### Docker

- **HuggingFace model cache redirected into the volume mount** — when `knowledge.enabled: true`, the ONNX embedding model (~150 MB, downloaded once on first use) is now stored at `~/.reeboot/hf-cache/` instead of inside `node_modules`. Since `~/.reeboot` is the volume-mounted directory, the model persists across container restarts and is never re-downloaded. Override the cache path with the `HF_CACHE_DIR` environment variable — useful when sharing a model cache volume across multiple containers.
- **No base image change required** — the Dockerfile already uses `node:22-slim` (Debian glibc); no changes are needed to the Docker setup.

---

## [1.4.0] - 2026-04-14

### Added

- **Channel trust** — two-level trust model for multi-party deployments. Each channel declares a default trust level (`owner` or `end-user`) in config; individual senders can be elevated to `owner` trust via `trusted_senders`. Owner sessions are unrestricted; end-user sessions are limited to the tool whitelist declared in `contexts[].tools.whitelist` — unlisted tools are blocked, not just gated. Config example:
  ```json
  "channels": {
    "whatsapp": { "trust": "end-user", "trusted_senders": ["+15551234567"] },
    "web": { "trust": "end-user" }
  },
  "contexts": [
    { "name": "support", "tools": { "whitelist": ["send_message", "check_calendar_availability"] } }
  ]
  ```
  All existing deployments continue to work unchanged — channels default to `owner`, whitelist defaults to unrestricted.

- **Injection defense** — two prompt-level layers that defend against direct and indirect prompt injection. End-user messages are wrapped with a trust boundary notice before reaching the model. Tool results from declared external-source tools (email readers, web fetch, RSS, etc.) are wrapped with a data-only boundary marker, instructing the model to treat the content as data and ignore any embedded instructions. User-installed skills are tagged with a lower-trust marker at load time. Both layers are controlled by `security.injection_guard` in config (enabled by default). The list of external-source tools is configurable per deployment.

- **MCP permission tiers** — per-server capability declarations enforced at two layers: a JS `tool_call` hook (blocks calls to filesystem/network tools for servers that haven't declared the capability) and an OS-level sandbox profile selected at spawn time (sandbox-exec on macOS, bubblewrap on Linux). MCP servers default to no capabilities; network and filesystem access are opt-in per server. Violations are logged by default. Built-in extensions are unaffected. Config example:
  ```json
  "mcp": {
    "servers": [
      {
        "name": "web-fetcher",
        "command": "npx",
        "args": ["-y", "@my/web-fetcher-mcp"],
        "permissions": { "network": true, "filesystem": false }
      }
    ]
  }
  ```

- **MCP client** — connect any stdio-based MCP server to the agent via `config.json → mcp.servers`. Tools from all configured servers are exposed through a single `mcp` proxy tool (~200 tokens), keeping context cost flat regardless of server count. Servers are spawned as child processes on first use (lazy) and killed on session end. Uses `@modelcontextprotocol/sdk`. Config example:
  ```json
  "mcp": {
    "servers": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
      }
    ]
  }
  ```
  The agent discovers a server's tools with `mcp({ action: "list", server: "<name>" })` and calls them with `mcp({ action: "call", server: "<name>", tool: "<tool>", args: {...} })`. Disable per-server or entirely via `extensions.core.mcp: false`. stdio only in v1.

---

## [1.3.6] - 2026-04-07

### Changed

- **`@mariozechner/pi-coding-agent` upgraded to 0.65.2** — bumped pin from `0.62.0`. Picks up three releases (0.63–0.65): `ModelRegistry` constructor removed in favour of `ModelRegistry.create()`; `getApiKey()` replaced by `getApiKeyAndHeaders()` returning `{ ok, apiKey, headers }`. Updated `src/agent-runner/pi-runner.ts` (two `ModelRegistry.create` call sites) and `src/extensions/custom-compaction.ts` (`getApiKeyAndHeaders` with `auth.ok` guard and `headers` threaded into `complete()`).
- **cron-parser upgraded to v5** — bumped from `^4.9.0` to `^5.5.0`. v5 is a full TypeScript ESM rewrite with a new import API. Dropped the `createRequire` CJS hack in `src/scheduler/parse.ts`; switched both `parse.ts` and `src/db/schema.ts` to `import { CronExpressionParser } from 'cron-parser'` with `CronExpressionParser.parse(expr)`. Also removed stale compiled `.js` files from `src/` that were shadowing TypeScript sources for the test runner.
- **TypeScript upgraded to v6** — bumped devDependency from `^5.4.0` to `^6.0.2`. No source or tsconfig changes were required — TS 6 compiled the project cleanly without modification.

### Fixed

- **Package install/uninstall now works** — `reeboot install` and `reeboot uninstall` now delegate to pi's `DefaultPackageManager`, tracking packages in `~/.reeboot/agent/settings.json`. Previously packages were recorded in `config.json` which pi never reads, so installed extensions were silently ignored by the loader. `reeboot reload` now picks up newly installed packages without restart.
- **Wizard enforces API key or pi auth** — the setup wizard no longer allows proceeding without a valid credential. If pi is detected, the choice is explicit: use pi's auth or set up separate credentials (no silent bypass). If separate credentials are chosen, the API key prompt loops until a non-empty value is entered; if the provider's env var is already set, the prompt is skipped entirely. Previously a user could submit an empty key and end up with a broken `authMode=own` config.
- **WhatsApp self-chat (`@lid`) now works** — WhatsApp's Linked Identity Device format uses `@lid` JIDs for self-chat instead of `@s.whatsapp.net`. The incoming message filter was only checking `@s.whatsapp.net`, so messages sent to yourself were silently dropped. Fixed to accept both formats.
- **Baileys logs silenced** — `makeWASocket` in the normal connect path was missing `logger: pino({ level: 'silent' })`, causing Baileys to flood stdout with raw JSON during and after WhatsApp connection. Fixed to match the wizard linking path which already silenced it.
- **Legacy package migration** — on startup, any packages in the old `config.json` `extensions.packages` array are automatically migrated to `~/.reeboot/agent/settings.json` and removed from `config.json`.

### Tests

- Added `tests/agent-runner/pi-registry-factory.test.ts` — asserts `ModelRegistry.create` API shape
- Added `tests/extensions/custom-compaction-api.test.ts` — asserts `getApiKeyAndHeaders` is called (not `getApiKey`)
- Added `tests/scheduler/parse.test.ts` — unit tests for `detectScheduleType` and `computeNextRun`
- Added `tests/db/schema-cron.test.ts` — integration test for `runMigration` populating `next_run` for legacy cron rows
- Added `tests/packages.test.ts` — unit tests for `installPackage`, `uninstallPackage`, `listPackages`, and `migratePackages`

---

## [1.3.5] - 2026-03-24

### Changed

- **Pi upgraded to 0.62.0** — bumped `@mariozechner/pi-coding-agent` from `latest` (resolved to 0.60.0) to an exact pin of `0.62.0`. Picks up two minor releases of bug fixes, the `sourceInfo` unification, and built-in tools as extensible `ToolDefinition`s. No reeboot code changes were required — none of the breaking changes in 0.61–0.62 touch the API surface reeboot uses.
- **Dependency pinned to exact version** — changed from `"latest"` to `"0.62.0"` so Docker builds and `npm install` are fully reproducible.

### Fixed

- **Custom tools invisible in system prompt** — `web_search`, `fetch_url`, and all 8 scheduler tools (`timer`, `heartbeat`, `schedule_task`, `list_tasks`, `cancel_task`, `pause_task`, `resume_task`, `update_task`) were missing `promptSnippet`. Pi omits custom tools from the "Available tools" section of the system prompt when `promptSnippet` is absent, leaving the model with no upfront awareness of these tools. Added a concise, action-oriented `promptSnippet` to all 10 tools so they appear explicitly in the system prompt from the first token of every session.

---

## [1.3.4] - 2026-03-21

### Added

- **`authMode` config field** — `agent.model.authMode: "pi" | "own"` (default `"own"`). Controls whether the agent delegates auth/model to an existing pi installation or uses its own injected credentials.
- **Wizard pi auth detection** — setup wizard now detects if pi is installed and authenticated (`~/.pi/agent/auth.json`). If found, offers "Use existing pi's provider, model and auth" as the first option — zero extra setup for existing pi users.
- **Runner isolation** — `PiAgentRunner` now builds `settingsManager`, `authStorage`, and `modelRegistry` from `authMode`. `authMode="own"`: uses `SettingsManager.inMemory` + API key injected as runtime override (config → env var fallback). `authMode="pi"`: delegates to pi's own files. `agentDir` (persona, extensions) is always `~/.reeboot/agent/` regardless of authMode.
- **`~/.reeboot/agent/AGENTS.md`** — reeboot now scaffolds its own persona file at the correct pi `agentDir` path on first run. Previously `AGENTS.md` was written to `contexts/main/AGENTS.md` which pi never read as the global context, causing the agent to respond with the user's personal pi coding persona.
- **Docker headless env vars** — `container/entrypoint.sh` now translates `REEBOOT_PROVIDER`, `REEBOOT_API_KEY`, `REEBOOT_MODEL`, `REEBOOT_NAME`, `REEBOOT_AUTH_MODE` into `--no-interactive` flags on first boot. `REEBOOT_AGENTS_MD` writes directly to `~/.reeboot/agent/AGENTS.md` before start (persona injection without interactive setup). Existing `config.json` (volume-mounted) takes precedence — env vars are ignored when config already exists.
- **`npm run test:run`** and **`npm run check`** scripts — `test:run` for single-pass vitest, `check` for build + test (quality gate before publish).

### Fixed

- **Web search tool never registered** — `extensions/web-search.ts` called `pi.getConfig()` which does not exist on pi's `ExtensionAPI` (returns `undefined`). This caused `searchConfig.provider` to default to `"none"`, exiting the extension before registering the `web_search` tool. The model then responded "I can't browse the internet" even with a provider configured. Fixed by passing reeboot's config as a second argument to the extension (same pattern as `skill-manager`).
- **Bundled extensions failed to load in production Node** — extensions were imported as `.ts` source files (`import('extensions/web-search.ts')`). This worked in development (jiti transpiles on the fly) but failed in the installed package with `Stripping types is currently unsupported for files under node_modules`. All bundled extensions moved to `src/extensions/` and compiled to `dist/extensions/` by the main tsc. Loader now imports compiled `.js` with a `.ts` fallback for vitest.
- **Pi's personal extensions bleeding into reeboot sessions** — when `authMode="pi"`, passing `agentDir: ~/.pi/agent/` to `createAgentSession` caused pi to load the user's personal extensions (`pi-searxng`, `pi-stats`, `context.ts`, etc.) into reeboot's session. Fixed by passing explicit `settingsManager` and `authStorage` from pi's files instead of `agentDir`, so pi's personal extension directory is never touched.
- **Reeboot persona not loaded — agent responded as "Claude Code"** — `~/.reeboot/agent/AGENTS.md` was never created (the directory didn't exist), so pi fell back to its own default system prompt. Fixed by calling `initContexts()` at server startup, which scaffolds `~/.reeboot/agent/AGENTS.md` from the reeboot persona template.
- **`loader.reload()` not called before session creation** — when reeboot passes a pre-built `resourceLoader` to `createAgentSession`, pi skips its internal `resourceLoader.reload()`. Added an explicit reload before session creation so AGENTS.md and extensions are loaded into the session.
- **SearXNG not detected on non-default port** — the wizard's SearXNG subflow only started a new container, never probing for an already-running instance. Now probes ports `8080`, `8888`, `4000` in order before prompting. If a running SearXNG is found, the URL input is pre-filled; the user can confirm or edit (e.g. `http://localhost:7777`). The user then chooses "Use this URL directly" or "Start new reeboot-searxng container".
- **`config.ts` SearXNG default URL** — `searxngBaseUrl` defaulted to `http://localhost:4000` but reeboot's own container starts on `8888`. Fixed default to `http://localhost:8888`.

---

## [1.3.3] - 2026-03-21

### Fixed

- **`reeboot --version` reported `0.0.1`** — CLI was hardcoding the version string; now reads dynamically from `package.json`
- **WhatsApp wizard: baileys logs flood terminal and wizard never advances** — the linking socket was left open after `onSuccess`, causing baileys to keep printing history-sync and session-write logs to stdout. The socket is now closed (500ms after `connection: 'open'`) before `onSuccess` is called, and baileys logging is silenced via pino `level: 'silent'` during the wizard flow.
- **WhatsApp linking: `ENOENT` on session files after successful QR scan** — the wizard was writing auth to a temp directory then renaming it to the permanent location in `onSuccess`. Baileys continues writing session files (Signal protocol sessions, pre-keys) well after `connection: 'open'` fires, causing `ENOENT` on those writes. Fixed by writing directly to the permanent auth directory from the start — no temp dir, no rename.
- **Scheduler crash on start: `require is not defined`** — `src/db/schema.ts` was using `require('cron-parser')` inside an ESM module. Converted to a top-level ESM import.
- **`cron-parser` named export error** — `cron-parser` v4 is a CJS module; its `parseExpression` function is only accessible via the default export. Fixed import from `import { parseExpression }` to `import cronParser from 'cron-parser'`.

### Added

- **`npm run test:run`** — single-pass vitest run (no watch); useful in CI and as a component of the quality check
- **`npm run check`** — full quality gate: `build` then `test:run`. Run this before publishing.
- **Post-build smoke tests** (`tests/smoke.test.ts`) — 10 tests that import compiled `dist/` modules directly and verify export shapes. Catches ESM/CJS import errors, `require()`-in-ESM, and missing named exports that TypeScript and unit tests both miss (because unit tests mock their dependencies). Covers: `db/schema.js`, `scheduler.js`, `channels/whatsapp.js`, `channels/signal.js`, `server.js`, `channels/interface.js`.

---

## [1.3.2] - 2026-03-21

### Fixed

- **WhatsApp device linking hangs after QR scan** — `linkWhatsAppDevice` now reconnects automatically on stream error 515 (`restartRequired`), which WhatsApp sends as a normal part of the post-pairing handshake. Previously the function had no reconnect logic and would hit the 2-minute timeout instead of completing the link.

---

## [1.3.1] - 2026-03-21

### Fixed

- **Scheduler init crash** — stale `dist/scheduler.js` was importing `node-cron` (removed in 1.3.0 in favour of the poll-loop) causing `ERR_MODULE_NOT_FOUND` on startup; fixed by rebuilding from updated source
- **TypeScript build error in `src/index.ts`** — accidental `import type { Prompter }` from test helper (`tests/helpers/fake-prompter.ts`) instead of `src/wizard/prompter.ts`; caused `rootDir` violation and blocked `tsc`
- **WhatsApp timeout: `sock.end()` arity** — baileys 6.7.21 requires `end(error: Error | undefined)`; calling it with no arguments caused a TypeScript error (`Expected 1 arguments, but got 0`)

---

## [1.3.0] - 2026-03-21

### Added

**Setup Wizard UX**
- Revamped interactive setup wizard with dedicated steps: provider selection, agent name, channel linking, and web search backend
- First-run entrypoint — wizard launches automatically when no config exists, starts agent on completion
- `reeboot setup` re-runs the wizard and asks before overwriting existing config
- Support for 8 AI providers in wizard (Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama)
- Inline QR code display during channel linking (WhatsApp and Signal) within the wizard
- Ollama model list loaded dynamically from local Ollama instance during setup

**Scheduler Upgrade**
- Natural language schedule parsing — `"every 5m"`, `"daily at 9am"`, `"every monday"`, etc.
- Task run log with per-task execution history
- Task poll loop — scheduler continuously checks for due tasks
- `reeboot tasks due` command — shows upcoming scheduled tasks
- Task management tools exposed to the agent (`schedule_task`, `cancel_task`, `list_tasks`, `pause_task`, `resume_task`)

**Proactive Agent**
- System heartbeat — fires at a configurable interval, dispatches a task snapshot prompt to the agent; silent when nothing to do
- In-session `timer` tool — non-blocking one-shot wait; agent can set a timer and be woken up after delay
- In-session `heartbeat` tool — periodic non-blocking wake-up within a session (`start`, `stop`, `status`)
- Sleep interceptor extension — blocks `sleep` when it is the sole or last command in a bash chain, redirects agent to use `timer` instead

**Web Search Extension**
- `web_search` tool with 7 pluggable backends: DuckDuckGo (zero config), Brave, Tavily, Serper, Exa, SearXNG (self-hosted), none
- `fetch_url` tool — always available; fetches any URL and returns clean readable text (Readability + HTML-strip fallback)
- Automatic fallback to DuckDuckGo when configured backend is unreachable at startup
- API key support via environment variables (`BRAVE_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`) or config

**Skill Manager Extension**
- `load_skill`, `unload_skill`, `list_available_skills` tools exposed to the agent
- Agent can load/unload skills on demand with optional TTL
- `reeboot skills list` — browse all bundled skills
- `reeboot skills update` — pull extended skill catalog (coming soon)

**Bundled Skills (15)**
- `github` — issues, PRs, releases, Actions, code search (requires `gh` CLI)
- `gmail` — search, read, send, draft, labels, attachments (requires `gmcli` + GCP OAuth)
- `gcal` — list, create, update, delete calendar events (requires `gccli` + GCP OAuth)
- `gdrive` — list, read, upload, search Drive files (requires `gdcli` + GCP OAuth)
- `notion` — pages, databases, blocks, search (`NOTION_API_KEY`)
- `slack` — send messages, list channels, thread replies (`SLACK_BOT_TOKEN`)
- `linear` — issues, projects, teams, cycles (`LINEAR_API_KEY`)
- `hubspot` — contacts, deals, companies, pipelines (`HUBSPOT_ACCESS_TOKEN`)
- `postgres` — query, inspect schema, run statements (`psql` + `DATABASE_URL`)
- `sqlite` — query, inspect tables, run statements (`sqlite3` + `DATABASE_PATH`)
- `docker` — containers, images, compose stacks (`docker` CLI)
- `files` — read, write, search local filesystem
- `reeboot-tasks` — schedule, list, pause, cancel own tasks
- `web-research` — structured multi-query web research
- `send-message` — send a message back to the originating channel

**Docker & CI/CD**
- Official Docker container image (`reeboot/reeboot`) with `Dockerfile` and `entrypoint.sh`
- GitHub Actions CI workflow — lint, test, build, publish to npm and Docker Hub on `v*` tags
- Ollama model templates (`templates/models-ollama.json`)

---

## [1.2.0] - 2026-03-19

### Added

- Signal **json-rpc transport mode** — recommended over polling; lower latency, more reliable message delivery
- Signal RPC connection management — automatic reconnect, structured error handling

### Changed

- Signal channel refactored to support both `json-rpc` (recommended) and `polling` modes, configured via `signal.mode` in config
- WhatsApp session stability improvements — reduced disconnection rate on long-running instances

---

## [1.0.0] - 2026-03-18

### Added

**Channels**
- **WebChat** — browser-based chat UI served at `http://localhost:3000` via WebSocket
- **WhatsApp** — QR-code-based pairing; session credentials persisted across restarts
- **Signal** — polling mode via `bbernhard/signal-cli-rest-api` Docker container
- Channel registry — pluggable adapter interface for adding new channels

**Core Agent**
- Pi-compatible agent runner — wraps `pi` SDK to drive any supported LLM provider
- Multi-context conversations — separate isolated threads (e.g. work, personal, projects)
- 8 AI provider adapters: Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama
- Orchestrator — routes inbound messages to the correct agent context and returns responses

**Scheduler**
- Scheduled task system — cron-based job scheduling with persistent task storage
- Task API exposed to agent (create, cancel, list tasks)

**Infrastructure**
- SQLite database — sessions, conversation history, scheduled tasks (`~/.reeboot/db/reeboot.db`)
- HTTP REST API — status, health, context management endpoints
- WebSocket chat endpoint (`/ws`)
- Config system — `~/.reeboot/config.json` with environment variable overrides
- Extension loader — loads pi-compatible `.ts` extensions from `~/.reeboot/extensions/` and installed packages
- Package system — install/uninstall community tool packages from npm, git, or local paths
- Credential proxy — secure API key delegation without exposing keys to extensions
- Daemon mode — run as background service via launchd (macOS) or systemd (Linux)

**CLI**
- `reeboot` / `reeboot start` — start the agent server
- `reeboot setup` — interactive setup wizard
- `reeboot stop` / `reeboot restart` / `reeboot reload` — lifecycle management
- `reeboot doctor` — pre-flight diagnostics for channels, config, and connectivity
- `reeboot status` — agent and channel status
- `reeboot install` / `reeboot uninstall` — package management
- `reeboot channel login|logout|list` — channel authentication

**Bundled Extensions**
- `confirm-destructive` — intercepts potentially destructive operations and asks for confirmation
- `custom-compaction` — custom conversation compaction strategy
- `protected-paths` — blocks agent access to sensitive filesystem paths
- `sandbox` — optional filesystem sandbox for agent operations
- `session-name` — enriches system prompt with the current context/session name
- `token-meter` — tracks and reports token usage per turn
- `scheduler-tool` (basic) — exposes schedule/cancel/list tools to the agent

**Skills**
- `send-message` — send a reply to the originating channel
- `web-search` (basic) — web search stub
