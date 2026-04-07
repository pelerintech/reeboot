# Design — readme-and-changelog

## Context

The repo already has a detailed `reeboot/README.md` that targets npm users. The root of the repo has no README, which means GitHub renders nothing useful on the project page. There is also no CHANGELOG.

## Decisions

### Root README is a project overview, not a copy of the package README

The package README (`reeboot/README.md`) is comprehensive and targets installers. The root README targets GitHub visitors — it should orient them quickly: what is this, how does it work at a high level, and where to go next. It links to `reeboot/README.md` for full usage docs.

Structure:
1. Hero — one-liner + quick install
2. What it does — feature table (same 10 rows as package README)
3. Architecture sketch (reuse the ASCII diagram)
4. Repo layout — where things live
5. Development — how to build and test
6. Links — npm, Docker Hub, full docs

### CHANGELOG follows Keep a Changelog format

`https://keepachangelog.com` is the standard. Sections per version: Added / Changed / Fixed.
Versions in reverse chronological order (newest first).

Version mapping from commits:
- **1.0.0** (2026-03-18, initial commit `461f1bf`) — Phase 1: all core systems landed together
- **1.2.0** (2026-03-19, `e3f9bae`) — Signal RPC mode, json-rpc transport, whatsapp fixes, architecture decisions update
- **1.3.0** (2026-03-21, `1bc1f55`) — Phase 2 & 3: full wizard UX, scheduler upgrade (natural language + heartbeat + parse), proactive agent (system heartbeat + in-session timer/heartbeat + sleep interceptor), web search extension (7 backends), skill manager extension, 15 bundled skills, Docker container + CI workflow, skills CLI

### No version 1.1.0

The version jump from 1.0.0 → 1.2.0 is intentional — 1.1.x was skipped in practice. The CHANGELOG reflects actual released versions only.

## Risks / Tradeoffs

- Root README may drift from package README over time — acceptable, they serve different audiences.
- CHANGELOG entries are reconstructed from commit diffs, not kept incrementally — acceptable for a first-time changelog.
