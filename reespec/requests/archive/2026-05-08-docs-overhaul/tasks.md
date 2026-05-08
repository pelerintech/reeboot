# Tasks — docs-overhaul

All tasks are non-code (documentation). RED is a specific binary assertion.
GREEN re-checks the same assertion and confirms it passes.

Source of truth for all config fields: `reeboot/src/config.ts` (Zod schema).
Re-read this file before writing any config reference content — do not rely on
the old README examples.

---

## Phase 1 — Structure + READMEs

### 1. Create docs/ folder structure

- [x] **RED** — Check: `docs/` does not exist at repo root. Assertion fails — directory is absent.
- [x] **ACTION** — Create the full folder tree:
  `docs/getting-started/`, `docs/channels/`, `docs/configuration/`,
  `docs/capabilities/`, `docs/security/`, `docs/observability/`,
  `docs/deployment/`, `docs/extending/`. Create a `.gitkeep` in each
  empty folder so the structure is committed.
- [x] **GREEN** — Run `find docs/ -type d | sort` and confirm all 8 subdirectories exist.

---

### 2. Rewrite root README.md

- [x] **RED** — Check: root `README.md` contains no mention of "memory", "knowledge",
  "budget", "observability", "MCP", or "resilience" in the capability table.
  Assertion passes — these are confirmed absent from current README.
- [x] **ACTION** — Rewrite `/README.md` as a marketing/presentation page:
  hook sentence, full current capability table (including all missing features),
  architecture ASCII diagram, quick-install block, links to docs. No raw config
  JSON. No incorrect field names.
- [x] **GREEN** — Verify: `README.md` contains sections for all of: memory,
  domain knowledge, token budget, MCP tools, resilience, observability.
  Verify no config JSON block exists in the file.

---

### 3. Rewrite reeboot/README.md

- [x] **RED** — Check: `reeboot/README.md` contains `"apiUrl"` in the Signal config
  example and flat `"provider"/"apiKey"/"model"` in the agent config example.
  Assertion passes — these inaccuracies are confirmed present.
- [x] **ACTION** — Rewrite `reeboot/README.md` as install + essentials page:
  accurate setup wizard walkthrough, minimal verified config.json using correct
  field structure (`agent.model.{authMode, provider, id, apiKey}`, Signal using
  `apiPort`), full CLI cheat-sheet including `logs`, `contexts`, `sessions`,
  `tasks due`. All links point to `docs/` for depth.
- [x] **GREEN** — Verify: `reeboot/README.md` contains `apiPort` (not `apiUrl`),
  contains `agent.model` nesting, contains `reeboot logs`, `reeboot contexts`,
  `reeboot sessions`, `reeboot tasks due` in CLI reference.

---

## Phase 2 — Getting Started

### 4. Write getting-started/introduction.md

- [x] **RED** — Check: `docs/getting-started/introduction.md` does not exist.
  Assertion passes — file is absent.
- [x] **ACTION** — Write the page: what reeboot is, who it's for, what makes
  it different (local, single-process, multi-channel, extensible).
  Include Astro frontmatter (title, description).
- [x] **GREEN** — Verify: file exists, is non-empty, begins with valid YAML frontmatter
  containing `title` and `description` keys.

---

### 5. Write getting-started/installation.md

- [x] **RED** — Check: `docs/getting-started/installation.md` does not exist.
- [x] **ACTION** — Write the page: npm global install, Node.js version requirement
  (read from `reeboot/package.json` engines field), Docker alternative, first-run
  behaviour. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains `npm install -g reeboot`, contains
  Node.js version requirement verified against `reeboot/package.json`.

---

### 6. Write getting-started/quick-start.md

- [x] **RED** — Check: `docs/getting-started/quick-start.md` does not exist.
- [x] **ACTION** — Write a ≤5-step guide that gets a user from zero to a running
  agent. No prior knowledge assumed. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains ≤5 numbered steps, each step
  has a concrete action (command or UI step).

---

### 7. Write getting-started/setup-wizard.md

- [x] **RED** — Check: `docs/getting-started/setup-wizard.md` does not exist.
- [x] **ACTION** — Write the page: every wizard prompt explained (authMode,
  provider, model, name, channels, search). How to re-run (`reeboot setup`).
  Read `reeboot/src/wizard/` to verify actual steps. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains authMode explanation, lists all
  8 providers, mentions `reeboot setup` for re-run.

---

## Phase 3 — Channels

### 8. Write channels/webchat.md

- [x] **RED** — Check: `docs/channels/webchat.md` does not exist.
- [x] **ACTION** — Write the page: what WebChat is, default URL, port config,
  how to open it, config fields (`channels.web.enabled`, `channels.web.port`).
  Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains config table with `enabled` and
  `port` fields with correct defaults.

---

### 9. Write channels/whatsapp.md (verified)

- [x] **RED** — Check: `docs/channels/whatsapp.md` does not exist.
- [x] **ACTION** — Write the page: Mode 1 (self-chat, owner_id empty) vs Mode 2
  (dedicated account, owner_id set), QR code setup steps, `owner_only` default
  true, credentials location. Read `reeboot/src/channels/whatsapp.ts` to verify
  steps. Config table for all WhatsApp channel fields. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, documents both Mode 1 and Mode 2,
  contains config table including `owner_id`, `owner_only`, `trust`, `trusted_senders`.

---

### 10. Write channels/signal.md (corrected)

- [x] **RED** — Check: `docs/channels/signal.md` does not exist.
- [x] **ACTION** — Write the page: Docker container setup (json-rpc mode),
  QR link step, config using `apiPort: 8080` (NOT apiUrl). Read
  `reeboot/src/config.ts` SignalChannelSchema to verify all fields.
  Config table for all Signal channel fields. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains `apiPort` (not `apiUrl`),
  config table includes `phoneNumber`, `apiPort`, `pollInterval`, `owner_id`,
  `owner_only`, `trust`, `trusted_senders`.

---

### 11. Write channels/trust-and-access.md

- [x] **RED** — Check: `docs/channels/trust-and-access.md` does not exist.
- [x] **ACTION** — Write the page: trust tiers (`owner` vs `end-user`), `owner_only`,
  `owner_id`, `trusted_senders`. Mode 1 vs Mode 2 identity. Practical examples
  for self-chat and dedicated account deployments. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains explanation of both trust values,
  documents `owner_only`, `owner_id`, and `trusted_senders` fields.

---

## Phase 4 — Configuration Reference

### 12. Write configuration/reference.md — agent + channels + sandbox + server

- [x] **RED** — Check: `docs/configuration/reference.md` does not exist.
- [x] **ACTION** — Create the file. Write sections for: `agent`, `agent.model`
  (authMode, provider, id, apiKey), `channels` (web, whatsapp, signal fields),
  `sandbox` (mode: os/docker), `server` (token). Read `reeboot/src/config.ts`
  for every field name, type, and default. Include annotated JSON example.
  Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains `agent.model.authMode` documented
  with both `"pi"` and `"own"` values explained, Signal uses `apiPort`.

---

### 13. Write configuration/reference.md — logging + search + heartbeat + session + routing

- [x] **RED** — Check: `docs/configuration/reference.md` does not contain a
  `logging` section (from task 12 it will have agent/channels/sandbox/server only).
- [x] **ACTION** — Append sections to `docs/configuration/reference.md`:
  `logging` (level, rate_limit_warn_threshold, retention_days),
  `search` (provider enum, apiKey, searxngBaseUrl),
  `heartbeat` (enabled, interval, contextId),
  `session` (inactivityTimeout),
  `routing` (default context, rules).
  All field names/defaults verified against config.ts.
- [x] **GREEN** — Verify: reference.md contains sections for logging, search,
  heartbeat, session, routing — each with a field table.

---

### 14. Write configuration/reference.md — memory + knowledge + budget + resilience

- [x] **RED** — Check: `docs/configuration/reference.md` does not contain a
  `memory` section.
- [x] **ACTION** — Append sections: `memory` (enabled, memoryCharLimit,
  userCharLimit, consolidation.enabled, consolidation.schedule),
  `knowledge` (enabled, embeddingModel, dimensions, chunkSize, chunkOverlap,
  wiki.enabled, wiki.lint.schedule),
  `budget` (daily_tokens, daily_cost_usd, session_tokens, session_cost_usd,
  turn_tokens, turn_cost_usd, warn_threshold — note: per-context),
  `resilience` (recovery.mode, recovery.side_effect_tools, outage_threshold,
  probe_interval, scheduler.catchup_window).
  All verified against config.ts.
- [x] **GREEN** — Verify: reference.md contains memory, knowledge, budget,
  resilience sections each with field tables and correct defaults.

---

### 15. Write configuration/reference.md — extensions + mcp + security + permissions + skills + contexts

- [x] **RED** — Check: `docs/configuration/reference.md` does not contain an
  `extensions` section.
- [x] **ACTION** — Append final sections: `extensions.core` (all boolean toggles),
  `mcp.servers[]` (name, command, args, env, permissions.network, permissions.filesystem),
  `security.injection_guard` (enabled, external_source_tools),
  `permissions.violations` (log),
  `skills` (permanent, ephemeral_ttl_minutes, catalog_path),
  `contexts[]` (name, tools.whitelist).
  Include complete annotated config.json example at end of page.
  All verified against config.ts.
- [x] **GREEN** — Verify: reference.md contains all 20+ top-level config sections.
  Run `grep -c "^##" docs/configuration/reference.md` — result ≥ 20.

---

## Phase 5 — Capabilities

### 16. Write capabilities/memory.md

- [x] **RED** — Check: `docs/capabilities/memory.md` does not exist.
- [x] **ACTION** — Write the page per spec: instance-level memory, two write paths,
  consolidation schedule, character limits, auto-consolidation, session_search
  (always-on), file locations. Config reference table. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, documents both MEMORY.md and USER.md,
  mentions session_search as always-on, contains config table.

---

### 17. Write capabilities/domain-knowledge.md

- [x] **RED** — Check: `docs/capabilities/domain-knowledge.md` does not exist.
- [x] **ACTION** — Write the page per spec: corpus tiers, nomic embedding model,
  local ONNX (no API key), chunk config, wiki synthesis mode and its tradeoffs,
  agent tools. Config reference table. Dev note on sqlite-vec TEXT auxiliary
  columns. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, documents `knowledge.enabled` (default false),
  wiki.enabled (default false), nomic-embed-text-v1.5, contains config table.

---

### 18. Write capabilities/scheduling.md

- [x] **RED** — Check: `docs/capabilities/scheduling.md` does not exist.
- [x] **ACTION** — Write the page per spec: schedule_task tool, interval syntax,
  origin routing, timer/heartbeat in-session tools, sleep interceptor table,
  scheduler catchup config, `reeboot tasks due` CLI. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains sleep interceptor table,
  mentions `reeboot tasks due`, documents origin_channel/origin_peer routing.

---

### 19. Write capabilities/web-search.md (revalidated)

- [x] **RED** — Check: `docs/capabilities/web-search.md` does not exist.
- [x] **ACTION** — Write the page: all 7 providers with correct env var names,
  fetch_url always-available, SearXNG Docker setup, disabling search.
  Read `reeboot/src/extensions/web-search.ts` to verify provider list and
  env var names before writing. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, lists all 7 providers, documents fetch_url
  as always-on, env var names match implementation.

---

### 20. Write capabilities/mcp-tools.md

- [x] **RED** — Check: `docs/capabilities/mcp-tools.md` does not exist.
- [x] **ACTION** — Write the page per spec: proxy tool pattern, mcp.servers[]
  config, server fields, permissions, usage pattern (list → call), why proxy
  was chosen, stdio-only v1. Config reference table. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, explains proxy pattern, documents
  `permissions.network` and `permissions.filesystem` fields.

---

### 21. Write capabilities/token-budget.md

- [x] **RED** — Check: `docs/capabilities/token-budget.md` does not exist.
- [x] **ACTION** — Write the page per spec: three budget layers (daily/session/turn,
  all per-context), cost via pi ModelRegistry, warn threshold, set_budget/
  check_budget/budget_status tools, local model caveat. Config reference table.
  Astro frontmatter.
- [x] **GREEN** — Verify: file exists, notes that limits are per-context (not
  instance-wide), documents all three budget tool names, contains config table.

---

### 22. Write capabilities/proactive-agent.md

- [x] **RED** — Check: `docs/capabilities/proactive-agent.md` does not exist.
- [x] **ACTION** — Write the page per spec: system heartbeat config, IDLE
  suppression, in-session heartbeat tool, timer tool, sleep interceptor rules
  table. Config reference for heartbeat.* fields. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, documents `heartbeat.enabled`, `heartbeat.interval`,
  `heartbeat.contextId`, contains sleep interceptor allow/block table.

---

## Phase 6 — Security + Observability + Deployment

### 23. Write security pages (sandbox, injection-guard, permission-tiers)

- [x] **RED** — Check: none of `docs/security/sandbox.md`,
  `docs/security/injection-guard.md`, `docs/security/permission-tiers.md` exist.
- [x] **ACTION** — Write all three pages per spec. Sandbox: mode os/docker,
  disable toggle. Injection guard: enabled flag, external_source_tools,
  trust interaction. Permission tiers: owner vs end-user trust, violations.log.
  Config reference tables in each. Astro frontmatter on all three.
- [x] **GREEN** — Verify: all three files exist and are non-empty. Each contains
  a config reference table with at least 2 entries.

---

### 24. Write observability pages (logging, events)

- [x] **RED** — Check: neither `docs/observability/logging.md` nor
  `docs/observability/events.md` exist.
- [x] **ACTION** — Write both pages per spec. Logging: pino, level config,
  `reeboot logs` CLI with flags, SSE stream, retention. Events: events table,
  OTEL schema fields, turn journal, operational_logs, retention/pruning.
  Config reference tables. Astro frontmatter on both.
- [x] **GREEN** — Verify: both files exist. logging.md contains `--follow` and
  `--level` flag documentation. events.md mentions trace_id and span_id fields.

---

### 25. Write deployment/daemon.md and deployment/docker.md (revalidated)

- [x] **RED** — Check: neither `docs/deployment/daemon.md` nor
  `docs/deployment/docker.md` exist.
- [x] **ACTION** — Write both pages. Daemon: `--daemon` flag, launchd (macOS),
  systemd (Linux), start/stop commands. Docker: `docker run` with volume mount,
  health check endpoint, Docker Compose example. Read `reeboot/src/daemon.ts`
  to verify daemon implementation details. Astro frontmatter on both.
- [x] **GREEN** — Verify: both files exist. docker.md contains the health check
  endpoint (`/api/health`). daemon.md mentions both launchd and systemd.

---

### 26. Write deployment/resilience.md

- [x] **RED** — Check: `docs/deployment/resilience.md` does not exist.
- [x] **ACTION** — Write the page per spec: crash recovery modes, outage detection
  threshold and probe interval, scheduler catchup window, restart notification.
  Read `reeboot/src/resilience/` to verify implementation details.
  Config reference table for all `resilience.*` fields. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, documents all three recovery modes
  (`safe_only`, `always`, `never`), mentions catchup_window field.

---

## Phase 7 — Extending

### 27. Write extending/skills.md

- [x] **RED** — Check: `docs/extending/skills.md` does not exist.
- [x] **ACTION** — Write the page per spec: skill definition, directory,
  all 15 bundled skills table (verify list against `reeboot/skills/`),
  permanent vs ephemeral, TTL config, agent skill management tools,
  how to write a custom SKILL.md. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, skill count in table matches actual
  count from `ls reeboot/skills/ | wc -l`. Contains custom SKILL.md example.

---

### 28. Write extending/extensions.md

- [x] **RED** — Check: `docs/extending/extensions.md` does not exist.
- [x] **ACTION** — Write the page per spec: pi extension definition, directory,
  available hooks, minimal tool example, hot-reload, core extension toggles.
  Read `reeboot/src/extensions/loader.ts` to verify hook names and core
  extension config keys. Config reference for `extensions.core.*`. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, documents `before_agent_start` hook,
  lists all `extensions.core` boolean keys, contains a tool example.

---

### 29. Write extending/channel-adapters.md (mirrors CHANNEL_CONTRACT.md)

- [x] **RED** — Check: `docs/extending/channel-adapters.md` does not exist.
- [x] **ACTION** — Write the page mirroring `reeboot/src/channels/CHANNEL_CONTRACT.md`:
  Tier 1/Tier 2 table, all Tier 1 clauses (inbound, outbound, lifecycle,
  policy must-nots), all Tier 2 clauses, Mode 1 vs Mode 2 identity, contract
  test suite table. Add note that `src/channels/CHANNEL_CONTRACT.md` is the
  canonical source. Astro frontmatter.
- [x] **GREEN** — Verify: file exists. Check that Tier 1 inbound, outbound,
  lifecycle, and policy sections all present. Confirm canonical source note exists.

---

### 30. Write extending/packages.md

- [x] **RED** — Check: `docs/extending/packages.md` does not exist.
- [x] **ACTION** — Write the page per spec: install/uninstall/list commands,
  pi manifest in package.json, how to publish. Astro frontmatter.
- [x] **GREEN** — Verify: file exists, contains `reeboot install npm:` example,
  contains pi manifest JSON example with `extensions` and `skills` keys.

---

## Phase 8 — Validation

### 31. Verify all pages have valid frontmatter

- [x] **RED** — Check: no systematic frontmatter validation has been run across
  all docs pages. Assertion passes — validation has not been done.
- [x] **ACTION** — Run:
  `find docs/ -name "*.md" | xargs grep -L "^title:"` to find pages missing
  title frontmatter. Fix any that are missing or malformed.
- [x] **GREEN** — Verify: `find docs/ -name "*.md" | xargs grep -L "^title:"`
  returns no output (all pages have title frontmatter).

---

### 32. Verify all 26 doc pages exist and are non-empty

- [x] **RED** — Check: doc page count is 0 at start of request.
- [x] **ACTION** — Review any missing pages from the structure defined in
  `design.md`. Write any that were missed or are empty stubs.
- [x] **GREEN** — Verify:
  `find docs/ -name "*.md" | wc -l` returns 26.
  `find docs/ -name "*.md" -empty` returns no output.
