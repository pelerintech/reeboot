# Tasks — readme-and-changelog

---

### 1. Root README.md exists with required sections

- [x] **RED** — Check: `README.md` does not exist at repo root `/Users/bn/p/pel/reeboot/agent/README.md`.
      Assertion: `test ! -f README.md` → passes (file absent).
- [x] **ACTION** — Write `README.md` at repo root. Include: `# reeboot` heading, one-liner description,
      Quick Start section (`npm install -g reeboot`, first-run wizard note), feature table (WebChat,
      WhatsApp, Signal, multi-context, scheduled tasks, extensions, skills, packages, daemon, doctor,
      web search), architecture ASCII diagram, repo layout section, Development section
      (`cd reeboot && npm install && npm test`), and links to `reeboot/README.md`, npm, Docker Hub.
- [x] **GREEN** — Verify all of the following:
      `grep -q "# reeboot" README.md` ✓
      `grep -q "npm install -g reeboot" README.md` ✓
      `grep -q "Quick Start" README.md` ✓
      `grep -q "Development" README.md` ✓
      `grep -q "reeboot/README.md" README.md` ✓
      File is non-empty: `wc -l README.md` → > 30 lines.

---

### 2. CHANGELOG.md exists with version 1.0.0 entry

- [x] **RED** — Check: `CHANGELOG.md` does not exist at repo root.
      Assertion: `test ! -f CHANGELOG.md` → passes (file absent).
- [x] **ACTION** — Write `CHANGELOG.md` with Keep a Changelog header, and the `## [1.0.0] - 2026-03-18`
      entry. Added section covers Phase 1 core: WebChat, WhatsApp, Signal (polling), multi-context
      conversations, scheduled tasks, extension loader, package system, credential proxy, daemon mode,
      setup wizard, doctor, REST API, WebSocket chat, SQLite database, pi agent runner.
- [x] **GREEN** — Verify:
      `grep -q "# Changelog" CHANGELOG.md` ✓
      `grep -q "\[1.0.0\]" CHANGELOG.md` ✓
      `grep -q "2026-03-18" CHANGELOG.md` ✓
      `grep -q "WebChat" CHANGELOG.md` ✓
      `grep -q "WhatsApp" CHANGELOG.md` ✓

---

### 3. CHANGELOG.md contains 1.2.0 entry (Signal RPC)

- [x] **RED** — Check: `CHANGELOG.md` does not yet contain `[1.2.0]`.
      Assertion: `grep -q "\[1.2.0\]" CHANGELOG.md` → fails (entry absent).
- [x] **ACTION** — Add `## [1.2.0] - 2026-03-19` entry to `CHANGELOG.md` (above 1.0.0, below 1.3.0 placeholder).
      Changed/Added section covers: Signal json-rpc transport mode, RPC connection improvements,
      WhatsApp session stability fixes.
- [x] **GREEN** — Verify:
      `grep -q "\[1.2.0\]" CHANGELOG.md` ✓
      `grep -q "2026-03-19" CHANGELOG.md` ✓
      `grep -q "json-rpc\|Signal RPC\|Signal rpc" CHANGELOG.md` ✓

---

### 4. CHANGELOG.md contains 1.3.0 entry (Phase 2 & 3)

- [x] **RED** — Check: `CHANGELOG.md` does not yet contain `[1.3.0]`.
      Assertion: `grep -q "\[1.3.0\]" CHANGELOG.md` → fails (entry absent).
- [x] **ACTION** — Add `## [1.3.0] - 2026-03-21` entry at the top of the versions list.
      Added section covers: revamped setup wizard, scheduler upgrade (natural-language parsing,
      task run log, poll loop, tasks-due), proactive agent (system heartbeat, in-session timer,
      in-session heartbeat, sleep interceptor), web search extension (7 backends + fetch_url),
      skill manager extension, 15 bundled skills (github, gmail, gcal, gdrive, notion, slack,
      linear, hubspot, postgres, sqlite, docker, files, reeboot-tasks, web-research, send-message),
      `reeboot skills` CLI, Docker container image, GitHub Actions CI/CD, Ollama model templates.
- [x] **GREEN** — Verify:
      `grep -q "\[1.3.0\]" CHANGELOG.md` ✓
      `grep -q "2026-03-21" CHANGELOG.md` ✓
      `grep -q "heartbeat\|Heartbeat" CHANGELOG.md` ✓
      `grep -q "web search\|web-search\|Web Search" CHANGELOG.md` ✓
      `grep -q "skill\|Skill" CHANGELOG.md` ✓
      `grep -q "Docker\|docker" CHANGELOG.md` ✓
      Versions in correct order: `grep -n "\[1\." CHANGELOG.md` shows 1.3.0 on lowest line number.
