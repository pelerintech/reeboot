## 1. Test Infrastructure (RED — all failing tests first)

- [x] 1.1 Write failing tests for catalog structure: `skills/` directory exists in package root; each skill subdirectory contains a `SKILL.md`; each SKILL.md has valid frontmatter (`name`, `description`); `name` matches the directory name; `description` is non-empty and under 1024 chars; all 15 expected skill names are present
- [x] 1.2 Write failing tests for `reeboot skills list` CLI: exits 0; output contains one line per skill; each line contains the skill name; each line contains the description; output is sorted alphabetically by name
- [x] 1.3 Write failing tests for `reeboot skills update` stub: exits 0; prints a message indicating extended catalog update is not yet available; does not modify any files
- [x] 1.4 Write failing tests for skill content quality: each skill SKILL.md contains a `## Setup` section; each CLI-wrapping skill mentions the CLI binary name in the setup section; each API-key skill mentions the environment variable name; no skill is empty beyond frontmatter

## 2. Skill Catalog Structure (GREEN)

- [x] 2.1 Create `skills/` directory in package root; ensure it is present in `package.json` `files` array (already added by npm-publish change — verify)
- [x] 2.2 Create `skills/github/SKILL.md`: wraps `gh` CLI; covers issues, PRs, releases, GitHub Actions, code search; setup section documents `brew install gh` and `gh auth login`; ensure 1.1 and 1.4 tests pass for this skill
- [x] 2.3 Create `skills/gmail/SKILL.md`: wraps `gmcli` (`npm install -g @mariozechner/gmcli`); covers search, read thread, send, draft, labels, attachments; setup section documents GCP project creation, OAuth consent, credentials JSON download, `gmcli accounts credentials`, `gmcli accounts add`; ensure tests pass
- [x] 2.4 Create `skills/gcal/SKILL.md`: wraps `gccli` (`npm install -g @mariozechner/gccli`); covers list events, create event, update event, delete event, free/busy query; references same GCP auth as gmail skill; ensure tests pass
- [x] 2.5 Create `skills/gdrive/SKILL.md`: wraps `gdcli` (`npm install -g @mariozechner/gdcli`); covers list, read, upload, search, share; references same GCP auth; ensure tests pass
- [x] 2.6 Create `skills/notion/SKILL.md`: uses `NOTION_API_KEY` env var + `curl` against Notion REST API; covers pages, databases, blocks, search; setup section documents creating an internal integration token and sharing pages; ensure tests pass
- [x] 2.7 Create `skills/slack/SKILL.md`: uses `SLACK_BOT_TOKEN` env var + curl (or `slack` CLI if installed); covers message send, channel list, thread reply, file upload; setup section documents creating a Slack App and installing to workspace; ensure tests pass
- [x] 2.8 Create `skills/linear/SKILL.md`: uses `LINEAR_API_KEY` env var + curl against Linear GraphQL API; covers issue create, list, update, search; setup documents API key generation; ensure tests pass
- [x] 2.9 Create `skills/hubspot/SKILL.md`: uses `HUBSPOT_ACCESS_TOKEN` env var + curl; covers contacts, deals, companies, pipelines, notes; setup documents private app token creation; ensure tests pass
- [x] 2.10 Create `skills/postgres/SKILL.md`: wraps `psql` CLI; uses `DATABASE_URL` env var; covers query, insert, schema inspection; setup documents `DATABASE_URL` format; ensure tests pass
- [x] 2.11 Create `skills/reeboot-tasks/SKILL.md`: meta-skill teaching the agent to manage its own scheduler — `schedule_task`, `list_tasks`, `cancel_task`, `pause_task`, `resume_task` tools; documents schedule formats (cron, interval, once); no external dependencies; ensure tests pass
- [x] 2.12 Create `skills/web-research/SKILL.md`: structured multi-query research pattern using the web-search extension; teaches agent to run multiple searches, synthesize results, cite sources; requires web-search extension to be enabled; ensure tests pass
- [x] 2.13 Create `skills/send-message/SKILL.md`: teaches agent to send a message back to the originating channel using reeboot's channel routing; documents when to use vs. just responding in turn; no external dependencies; ensure tests pass
- [x] 2.14 Create `skills/files/SKILL.md`: local filesystem operations — read, write, list, search; documents which paths are safe and which are protected; references reeboot's protected-paths extension; ensure tests pass
- [x] 2.15 Create `skills/docker/SKILL.md`: wraps `docker` and `docker-compose` CLIs; covers container list/start/stop/logs, image pull/build, compose up/down; setup documents Docker Desktop or Docker Engine install; ensure tests pass

## 3. CLI Commands (GREEN)

- [x] 3.1 Add `skills` command group to `src/index.ts` following existing commander pattern; ensure 1.2 and 1.3 test structure compiles
- [x] 3.2 Implement `reeboot skills list`: scan `skills/` directory in package root; parse frontmatter from each SKILL.md; print sorted table of name + description; ensure 1.2 tests pass
- [x] 3.3 Implement `reeboot skills update` stub: print message `"Extended skill catalog update coming soon. Currently using X bundled skills."` where X is the count; exit 0; ensure 1.3 tests pass

## 4. Integration & Documentation

- [x] 4.1 Run full test suite — all 1.1–1.4 tests green; no regressions in existing tests
- [x] 4.2 Manual smoke test (`reeboot skills list`): run command, verify all 15 skills appear with names and descriptions
- [ ] 4.3 Manual smoke test (skill-manager integration): with `skill-manager` extension running, call `load_skill("github")` tool, verify the github skill loads successfully from bundled catalog
- [ ] 4.4 Manual smoke test (agent-guided setup): in WebChat, ask agent to "help me set up Gmail access", verify it loads the gmail skill and walks through setup instructions
- [ ] 4.5 Update `README.md`: add "Bundled Skills" section listing all 15 skills with brief description; document how to browse with `reeboot skills list` and how to load via agent or config
- [x] 4.6 Log key decisions to `architecture-decisions.md`: bundled-vs-extended catalog split, npm package as delivery mechanism (no git required), why CLI-wrapping over building OAuth infrastructure, skill content conventions (required sections: Setup, Usage)
