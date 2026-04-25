# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed

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

### Breaking changes

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
