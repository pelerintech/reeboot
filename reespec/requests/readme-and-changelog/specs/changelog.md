# Spec — CHANGELOG

## Capability

A `CHANGELOG.md` file at the repository root following Keep a Changelog format, covering three versions.

---

## Scenarios

### GIVEN the repo root, WHEN a reader checks release history, THEN they find a CHANGELOG

- File exists at `CHANGELOG.md` (repo root)
- First heading is `# Changelog`
- References keepachangelog.com and semver.org

### GIVEN the CHANGELOG, WHEN a reader looks at version order, THEN versions appear newest-first

- 1.3.0 appears before 1.2.0, which appears before 1.0.0

### GIVEN the CHANGELOG, WHEN a reader reads the 1.0.0 entry, THEN it covers Phase 1 core features

- Entry dated 2026-03-18
- Added section covers: WebChat channel, WhatsApp channel, Signal channel (polling mode), multi-context conversations, scheduled tasks, extension loader, package system, credential proxy, daemon mode (launchd/systemd), setup wizard, doctor command, REST API, WebSocket chat, SQLite database, pi-compatible agent runner

### GIVEN the CHANGELOG, WHEN a reader reads the 1.2.0 entry, THEN it covers the Signal RPC improvements

- Entry dated 2026-03-19
- Added/Changed section covers: Signal json-rpc transport mode, Signal RPC connection improvements
- Notes whatsapp fixes

### GIVEN the CHANGELOG, WHEN a reader reads the 1.3.0 entry, THEN it covers Phase 2 & 3 additions

- Entry dated 2026-03-21
- Added section covers:
  - Revamped interactive setup wizard (provider, name, channels, web-search steps)
  - Scheduler upgrade: natural language schedule parsing, task run log, task poll loop, tasks-due command
  - Proactive agent: system heartbeat, in-session timer tool, in-session heartbeat tool, sleep interceptor
  - Web search extension with 7 backends (DuckDuckGo, Brave, Tavily, Serper, Exa, SearXNG, none)
  - `fetch_url` tool
  - Skill manager extension (load/unload/list skills at runtime)
  - 15 bundled skills (github, gmail, gcal, gdrive, notion, slack, linear, hubspot, postgres, sqlite, docker, files, reeboot-tasks, web-research, send-message)
  - `reeboot skills` CLI commands
  - Docker container image + entrypoint
  - GitHub Actions CI/CD workflow
  - Ollama model templates
