## Evaluation — 2026-05-08 12:00

### root-readme-rewrite
verdict:  ✅ SATISFIED
reason:   Spec requires hook sentence, capability table covering memory/knowledge/observability/budget/MCP/resilience, architecture ASCII diagram, quick-install block, links to docs, no config JSON blocks. All present in `README.md`. Zero ` ```json ` blocks confirmed.

### reeboot-readme-rewrite
verdict:  ✅ SATISFIED
reason:   Spec requires correct nested `agent.model.{authMode, provider, id, apiKey}`, Signal using `apiPort`, CLI cheat-sheet covering `logs`/`contexts`/`sessions`/`tasks due`, links to docs. All confirmed present. Zero occurrences of `"apiUrl"`.

### docs-directory-layout
verdict:  ✅ SATISFIED
reason:   Spec requires 26 named files across 8 subdirectories at repo root (not inside `reeboot/`). 28 files found at `docs/` — all 26 specified files present, `docs/` confirmed at repo root only.

### every-page-valid-astro-frontmatter
verdict:  ⚠️ PARTIAL
reason:   Spec requires `title` (non-empty) and `description` (non-empty string, ≤160 chars for SEO) on every page. Title and description presence confirmed for all 28 pages via grep. However the spec also states "WHEN the frontmatter is parsed with a YAML parser / THEN it contains no syntax errors" — no YAML parser validation was run; only grep-based checks were used. Cannot confirm syntax-error-free parse without a formal validator.
focus:    Run a YAML parser over all frontmatter blocks to confirm no syntax errors.

### full-config-reference-page
verdict:  ⚠️ PARTIAL
reason:   Spec requires every top-level section documented including `credentialProxy`. The `credentialProxy` section is entirely absent from `docs/configuration/reference.md` — confirmed by grep returning zero results. All other 19 sections are present.
focus:    `docs/configuration/reference.md` — `credentialProxy` section is missing.

### config-fields-match-source-of-truth
verdict:  ✅ SATISFIED
reason:   Spot-checks against `reeboot/src/config.ts` confirm key corrections: `agent.model.id` (not `model`), `channels.signal.apiPort` (number), `memory.memoryCharLimit` (2200), `budget.warn_threshold` (0.8), `resilience.outage_threshold` (3). No invented fields detected in sampled sections.

### annotated-example
verdict:  ⚠️ PARTIAL
reason:   Spec requires "Budget section with daily/session/turn limits." The annotated example in `docs/configuration/reference.md` shows only `daily_cost_usd` and `warn_threshold` — `session_tokens`, `session_cost_usd`, `turn_tokens`, `turn_cost_usd`, and `daily_tokens` are absent from the example JSON. MCP servers array shows `[]` not an example server entry.
focus:    `docs/configuration/reference.md` — annotated example budget block incomplete; MCP example entry absent.

### authMode-documented
verdict:  ✅ SATISFIED
reason:   Spec requires `authMode` with both `"own"` and `"pi"` values explained. Full table row and two annotated examples confirmed in `docs/configuration/reference.md`.

### memory-md
verdict:  ✅ SATISFIED
reason:   Spec requires instance-level, two write paths, consolidation schedule, char limits, auto-consolidation, session_search always-on, file locations, config table. All present in `docs/capabilities/memory.md`.

### domain-knowledge-md
verdict:  ✅ SATISFIED
reason:   Spec requires corpus tiers, nomic model, local ONNX, chunk config, wiki tradeoffs, agent tools (ingest/search/lint), config table, sqlite-vec TEXT dev note. All confirmed in `docs/capabilities/domain-knowledge.md`.

### token-budget-md
verdict:  ✅ SATISFIED
reason:   Spec requires three per-context layers, pi ModelRegistry cost, warn+block behaviour, set_budget/check_budget/budget_status tools, local model caveat, config table. All present in `docs/capabilities/token-budget.md`.

### mcp-tools-md
verdict:  ✅ SATISFIED
reason:   Spec requires proxy pattern, mcp.servers[] config, server fields, permissions, list→call usage, why proxy chosen, stdio-only v1, config table. All present in `docs/capabilities/mcp-tools.md`.

### scheduling-md
verdict:  ✅ SATISFIED
reason:   Spec requires schedule_task, interval syntax, origin_channel/origin_peer routing, timer/heartbeat tools, sleep interceptor, catchup window, `reeboot tasks due`. All confirmed in `docs/capabilities/scheduling.md`.

### proactive-agent-md
verdict:  ✅ SATISFIED
reason:   Spec requires system heartbeat (IDLE suppressed), three heartbeat config fields, in-session heartbeat and timer tools, sleep interceptor table. All present in `docs/capabilities/proactive-agent.md`.

### web-search-md-revalidated
verdict:  ✅ SATISFIED
reason:   Spec requires accurate provider table with correct env var names, `fetch_url` always-on. All confirmed against `reeboot/src/extensions/web-search.ts`.

### missing-capability-pages-exist
verdict:  ✅ SATISFIED
reason:   All 7 specified capability pages confirmed present and non-empty.

### signal-md-accurate
verdict:  ✅ SATISFIED
reason:   Spec requires `apiPort: 8080` (not `apiUrl`), all SignalChannelSchema fields. `docs/channels/signal.md` uses `apiPort` throughout; config table includes all 8 required fields. Zero occurrences of `apiUrl` confirmed.

### trust-and-access-md-exists
verdict:  ⚠️ PARTIAL
reason:   Spec requires explanation of "what each value means for tool permissions and prompt injection guard behaviour." The page explains trust in access-control terms but does not mention injection guard behaviour in the trust level descriptions — that detail is deferred to `injection-guard.md` without explicit cross-reference from the trust value descriptions.
focus:    `docs/channels/trust-and-access.md` — trust level descriptions should note injection guard interaction.

### whatsapp-md-accurate
verdict:  ⚠️ PARTIAL
reason:   Spec states "Credentials persisted in `~/.reeboot/credentials/`." The doc says `~/.reeboot/channels/whatsapp/auth/` — which matches `reeboot/src/channels/whatsapp.ts` (confirmed). The doc is correct against the implementation; the spec path is wrong. This is a spec inaccuracy, not a doc gap.
focus:    Spec inaccuracy: stated path `~/.reeboot/credentials/` does not match implementation. Doc is correct. Human should confirm and update spec.

### security-sandbox-md
verdict:  ⚠️ PARTIAL
reason:   Spec requires "What is and isn't sandboxed." The page covers what IS restricted (filesystem, network, process capabilities) but contains no information about what falls outside the sandbox — what commands are permitted, what is excluded, or any exceptions. The "isn't sandboxed" half of the clause is absent.
focus:    `docs/security/sandbox.md` — no coverage of what is not sandboxed / what is permitted.

### security-injection-guard-md
verdict:  ✅ SATISFIED
reason:   Spec requires enabled flag, external_source_tools, trust interaction, config table. All present in `docs/security/injection-guard.md`.

### security-permission-tiers-md
verdict:  ✅ SATISFIED
reason:   Spec requires owner vs end-user tiers, what each permits, violations.log, per-channel trust config, config reference. All present in `docs/security/permission-tiers.md`.

### observability-logging-md
verdict:  ✅ SATISFIED
reason:   Spec requires pino, level config, `reeboot logs` with --follow/--level, SSE endpoint, retention_days, rate_limit_warn_threshold, config table. All confirmed in `docs/observability/logging.md`.

### observability-events-md
verdict:  ✅ SATISFIED
reason:   Spec requires events table, OTEL schema (trace_id, span_id, created_ns, severity), turn journal as permanent record, operational_logs, retention/pruning. All confirmed in `docs/observability/events.md`.

### deployment-resilience-md
verdict:  ✅ SATISFIED
reason:   Spec requires crash recovery modes, side_effect_tools, outage threshold+probe interval, catchup window, restart notification via DB marker. All confirmed including "reeboot_state marker in the database" language.

### extending-channel-adapters-mirrors-contract
verdict:  ✅ SATISFIED
reason:   Spec requires all Tier 1/2 clauses mirrored, Mode 1 vs Mode 2 identity, contract test suite table, canonical source note. All sections present in `docs/extending/channel-adapters.md`.

### getting-started-introduction-md
verdict:  ✅ SATISFIED
reason:   Spec requires what reeboot is, who it's for, local/single-process/multi-channel/extensible differentiators. All covered including comparison table.

### getting-started-installation-md
verdict:  ✅ SATISFIED
reason:   Spec requires npm install, Node.js version from package.json engines (≥22 confirmed), Docker alternative, first-run behaviour. All present.

### getting-started-quick-start-md
verdict:  ✅ SATISFIED
reason:   Spec requires ≤5 steps, no prior knowledge assumed. Page contains exactly 5 numbered steps.

### getting-started-setup-wizard-md
verdict:  ✅ SATISFIED
reason:   Spec requires authMode, all 8 providers, model selection, agent name, channels, search, `reeboot setup` re-run. All confirmed in `docs/getting-started/setup-wizard.md`.

### extending-skills-md
verdict:  ✅ SATISFIED
reason:   Spec requires skill definition, directory, all 15 bundled skills with requirements, permanent vs ephemeral, TTL config, load_skill/unload_skill/list_available_skills, custom SKILL.md example. Skill count (15) matches `reeboot/skills/`. All confirmed.

### extending-extensions-md
verdict:  ⚠️ PARTIAL
reason:   Spec requires "Available hooks: tools, before_agent_start, agent_end, turn_start, turn_end, session_shutdown." The hooks table lists before_agent_start, agent_end, turn_start, turn_end, session_shutdown, and after_provider_response — but `tools` is absent. Spec contract lists it explicitly.
focus:    `docs/extending/extensions.md` — `tools` (registerTool) missing from hooks/API table.

### extending-packages-md
verdict:  ✅ SATISFIED
reason:   Spec requires install/uninstall/list commands, pi manifest in package.json, publishing guide. All present in `docs/extending/packages.md`.

---

## Triage

✅ Safe to skip: root-readme-rewrite, reeboot-readme-rewrite, docs-directory-layout, config-fields-match-source-of-truth, authMode-documented, memory-md, domain-knowledge-md, token-budget-md, mcp-tools-md, scheduling-md, proactive-agent-md, web-search-md-revalidated, missing-capability-pages-exist, signal-md-accurate, observability-logging-md, observability-events-md, deployment-resilience-md, extending-channel-adapters-mirrors-contract, getting-started-introduction-md, getting-started-installation-md, getting-started-quick-start-md, getting-started-setup-wizard-md, extending-skills-md, extending-packages-md, security-injection-guard-md, security-permission-tiers-md

⚠️  Worth a look:
- **full-config-reference-page** — `credentialProxy` section entirely absent from `docs/configuration/reference.md`
- **annotated-example** — budget block shows only `daily_cost_usd`; session/turn limits absent; MCP servers shows `[]` not an example entry
- **security-sandbox-md** — "what isn't sandboxed" clause absent; page covers restrictions only, not what is permitted
- **trust-and-access-md-exists** — injection guard interaction not mentioned in trust value descriptions; spec requires it
- **extending-extensions-md** — `tools` / `registerTool` missing from hooks table; spec lists it explicitly
- **every-page-valid-astro-frontmatter** — YAML syntax validated only by grep, not a YAML parser

❓  Human call:
- **whatsapp-md-accurate** — spec says `~/.reeboot/credentials/`; source code and doc both say `~/.reeboot/channels/whatsapp/auth/`. Doc is correct against implementation. Spec contains an inaccuracy — confirm and update spec path.

---

## Evaluation — 2026-05-08 11:00

### docs-structure — directory-layout
verdict:  ✅ SATISFIED
reason:   Spec requires a precise layout of 28 pages across 8 subdirectories. Every required file exists at `docs/` — all directories (`getting-started/`, `channels/`, `configuration/`, `capabilities/`, `security/`, `observability/`, `deployment/`, `extending/`) and all 28 named files are present.

### docs-structure — frontmatter
verdict:  ✅ SATISFIED
reason:   Spec requires `title` and `description` (≤160 chars) on every page. Automated scan of all `docs/**/*.md` found no missing frontmatter, missing title, or missing description, and no description exceeded 160 characters.

### readmes — root-README-rewrite
verdict:  ✅ SATISFIED
reason:   Spec requires a hook, capability table, architecture ASCII diagram, quick-install block, doc links, no raw config JSON, and no inaccurate field names. All present: hook on line 3, capability table includes memory/observability/budget/MCP/resilience, ASCII diagram present, `npm install -g reeboot` block, links table present. Only two `json` mentions in README are path strings (`config.json`), not raw config blocks.

### readmes — reeboot-README-rewrite
verdict:  ✅ SATISFIED
reason:   Spec requires install instructions, setup wizard walkthrough, correct config example with `agent.model.{authMode, provider, id, apiKey}` nesting, CLI cheat-sheet with `logs`, `contexts`, `sessions`, `tasks due`, Signal using `apiPort` (number), and links to docs. All confirmed present. `contexts` and `sessions` are listed as "coming soon" which is accurate, not misleading.

### capability-pages — memory.md
verdict:  ✅ SATISFIED
reason:   Spec requires MEMORY.md/USER.md, `memory.enabled`, two write paths (tool + consolidation), schedule config, char limits, `session_search`, file locations, and config table. All 13 grep hits confirm coverage.

### capability-pages — domain-knowledge.md
verdict:  ✅ SATISFIED
reason:   Spec requires knowledge.enabled, two document tiers, nomic-embed-text-v1.5, chunk config, wiki mode, agent tools, sqlite-vec dev note, and config table. All 19 grep hits confirm coverage.

### capability-pages — token-budget.md
verdict:  ✅ SATISFIED
reason:   Spec requires three budget layers, ModelRegistry cost tracking, threshold/block behaviour, `set_budget`, `check_budget`, `budget_status`, "cost unavailable" for local models, and config table. All confirmed present including "cost unavailable" language and all three tools.

### capability-pages — mcp-tools.md
verdict:  ✅ SATISFIED
reason:   Spec requires MCP intro, `mcp.servers[]`, required server fields, `network`/`filesystem` permissions, proxy tool pattern (`list`/`call`), proxy rationale, stdio-only-in-v1 note, and config table. All confirmed.

### capability-pages — scheduling.md
verdict:  ✅ SATISFIED
reason:   Spec requires `schedule_task`, interval syntax, `origin_channel`/`origin_peer` routing, timer and heartbeat tools, sleep interceptor, `catchup_window`, and `reeboot tasks due`. All confirmed — sleep interceptor table present, catchup_window config present.

### capability-pages — proactive-agent.md
verdict:  ✅ SATISFIED
reason:   Spec requires heartbeat config fields, in-session heartbeat/timer tools, and sleep interceptor table of allowed vs. blocked patterns. All present — table with allowed/blocked patterns, all three `heartbeat.*` config fields documented.

### capability-pages — web-search.md
verdict:  ✅ SATISFIED
reason:   Spec requires accurate provider table (duckduckgo, brave, tavily, serper, exa, searxng, none) and `fetch_url` as always-available. All 7 providers and `fetch_url` confirmed via grep.

### capability-pages — all-files-exist
verdict:  ✅ SATISFIED
reason:   Spec requires all 7 capability pages to exist and be non-empty. All 7 files confirmed present and non-empty via filesystem scan.

### channel-pages — signal-accuracy
verdict:  ✅ SATISFIED
reason:   Spec requires `apiPort: 8080` (number, not `apiUrl`), and all 8 fields matching `SignalChannelSchema`. Confirmed: `apiPort` appears as a number field in both config example and reference table; all required fields (`enabled`, `phoneNumber`, `apiPort`, `pollInterval`, `owner_id`, `owner_only`, `trust`, `trusted_senders`) present in the config reference table.

### channel-pages — trust-and-access
verdict:  ✅ SATISFIED
reason:   Spec requires `trust: "owner" | "end-user"` semantics, `owner_only`, `owner_id`, `trusted_senders`, which channels support each field, and practical examples. Confirmed — table shows "Web, WhatsApp, Signal" for the `trust` field and Mode 1/Mode 2 examples are present.

### channel-pages — whatsapp-accuracy
verdict:  ✅ SATISFIED
reason:   Spec requires Mode 1 (self-chat, empty `owner_id`) and Mode 2 (dedicated account, `owner_id` set), explicit `owner_only` default of `true`, and credentials path. All present — Mode 1 and Mode 2 sections present, `owner_only: true` in both config examples, credentials path documented.

### config-reference — full-coverage
verdict:  ✅ SATISFIED
reason:   Spec requires all 19 top-level sections: agent, channels, sandbox, logging, server, extensions, routing, session, credentialProxy, search, heartbeat, skills, mcp, permissions, security, contexts, memory, knowledge, resilience, budget. All 19 confirmed present as `##`-level headings in `docs/configuration/reference.md`.

### config-reference — field-accuracy
verdict:  ✅ SATISFIED
reason:   Spec requires every documented field to match `reeboot/src/config.ts`. Spot checks confirm: `agent.model.authMode`, `agent.name`, `logging.rate_limit_warn_threshold` (default 5000), `channels.signal.apiPort` (number) all match the Zod schema exactly.

### config-reference — annotated-example
verdict:  ✅ SATISFIED
reason:   Spec requires a complete annotated JSON example with correct nesting, Signal `apiPort`, memory section, budget section, and MCP servers array. Confirmed at the `## Complete Annotated Example` section — `authMode` in `agent.model`, `apiPort: 8080`, memory, budget, and `mcp.servers[]` all present.

### config-reference — authMode-documented
verdict:  ✅ SATISFIED
reason:   Spec requires `authMode: "own"` and `authMode: "pi"` explanations with the pi delegation path (`~/.pi/agent/auth.json`). Confirmed at the `agent.model.authMode` row: both values documented with pi delegation path cited explicitly.

### getting-started-extending — introduction
verdict:  ✅ SATISFIED
reason:   Spec requires one paragraph explaining what reeboot is, who it is for, and what makes it different (local, single-process, multi-channel, extensible). All present — opening paragraph, "Who It's For" and "What Makes It Different" sections present.

### getting-started-extending — installation
verdict:  ✅ SATISFIED
reason:   Spec requires npm install, Node.js version, Docker alternative, and first-run wizard behaviour. All confirmed: Node ≥ 22, Docker section, first-run wizard auto-launch documented.

### getting-started-extending — quick-start
verdict:  ✅ SATISFIED
reason:   Spec requires 5 steps, no prior knowledge assumed. Page is titled "Five steps. No prior knowledge required." and contains exactly 5 numbered steps (Step 1–5, Step 5 optional).

### getting-started-extending — setup-wizard
verdict:  ✅ SATISFIED
reason:   Spec requires authMode choice, all 8 providers listed, model selection, agent name, channel setup, search provider step, and `reeboot setup` re-run command. All confirmed — 8 providers in table, all 5 wizard steps, `reeboot setup` on line 11.

### getting-started-extending — skills
verdict:  ✅ SATISFIED
reason:   Spec requires 15 bundled skills listed, permanent vs. ephemeral distinction, TTL config, load/unload/list tools, and custom SKILL.md instructions. All confirmed — 15-skill table, ephemeral TTL config, all three agent tools, "Writing a Custom Skill" section present.

### getting-started-extending — extensions
verdict:  ✅ SATISFIED
reason:   Spec requires hooks, minimal extension example, hot-reload (`reeboot reload`), and all core extensions with config toggles. All confirmed — 6 hooks tabulated, example present, `reeboot reload` documented, all 9 core extensions listed with their `extensions.core.*` toggles.

### getting-started-extending — packages
verdict:  ✅ SATISFIED
reason:   Spec requires install/uninstall/list commands, `pi` manifest format, and how to publish. All confirmed — `reeboot install npm:/git:/local`, `reeboot uninstall`, `reeboot packages list`, `pi` manifest in package.json, and publishing section present.

### security-observability-deployment — sandbox
verdict:  ✅ SATISFIED
reason:   Spec requires sandbox-exec/bwrap distinction, `sandbox.mode` values, disable config, what's sandboxed/not. All confirmed — macOS `sandbox-exec` and Linux `bwrap`, `sandbox.mode` table, `extensions.core.sandbox`, and a sandboxed-vs-not table present.

### security-observability-deployment — injection-guard
verdict:  ✅ SATISFIED
reason:   Spec requires guard purpose, `security.injection_guard.enabled`, `external_source_tools` (default: fetch_url/web_fetch), trust-level interaction, and config table. All confirmed.

### security-observability-deployment — permission-tiers
verdict:  ✅ SATISFIED
reason:   Spec requires trust tier semantics (tool access, injection), `owner_only`, `owner_id`, `permissions.violations.log`, per-channel trust config. All confirmed — tool restrictions explicitly documented for `end-user` trust, `violations.log` present.

### security-observability-deployment — logging
verdict:  ✅ SATISFIED
reason:   Spec requires pino/NDJSON, `logging.level` options, `reeboot logs` with `--follow` and `--level`, SSE endpoint, `retention_days`, `rate_limit_warn_threshold`, and config table. All confirmed.

### security-observability-deployment — events
verdict:  ✅ SATISFIED
reason:   Spec requires audit events, OTEL schema (trace_id, span_id, created_ns, severity), turn journal permanence ("closed rows retained, not deleted"), `operational_logs` table, and retention/pruning. All confirmed — OTEL columns present, "Turns are **never deleted**" statement present, `operational_logs` documented.

### security-observability-deployment — resilience
verdict:  ✅ SATISFIED
reason:   Spec requires crash recovery with `recovery.mode` ("safe_only"/"always"/"never"), `side_effect_tools`, outage detection, `outage_threshold`/`probe_interval`, scheduler catchup, `catchup_window`, and restart notification via DB marker. All confirmed — DB marker notification present ("via a `reeboot_state` marker in the database"), full config table present.

### security-observability-deployment — channel-adapters-mirrors-contract
verdict:  ✅ SATISFIED
reason:   Spec requires Tier 1/2 classification table, all contract clauses, Mode 1/Mode 2 explanation, contract test suite table, and note that `CHANNEL_CONTRACT.md` is canonical. All present — canonical source note, full Tier 1 clause set (inbound/outbound/lifecycle/policy must-nots) confirmed against `reeboot/src/channels/CHANNEL_CONTRACT.md`, Tier 2 clauses confirmed, Mode 1/2 section, test suite table.

## Triage

✅ All capabilities satisfied — no action required.

---
