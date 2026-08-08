# Tasks — release-2.7.0

Every task has exactly three steps (RED → ACTION → GREEN). Code tasks write a runnable
test; non-code tasks use a binary, verifiable assertion. This request is release/documentation
work, so all tasks are non-code (git/CHANGELOG assertions), except the version-string edit
which is verified by reading the files back.

## 1. Bump version to 2.7.0 (package + MCP serverVersion)

- [ ] **RED** — Assert: `reeboot/package.json` `version` is `"2.6.0"` and the hardcoded
      `serverVersion` constant in `reeboot/src/server.ts` is `'2.6.0'`. Assertion FAILS for
      the new target (neither is `2.7.0`). Verify via `grep -n '"version"' reeboot/package.json`
      and `grep -n "serverVersion" reeboot/src/server.ts`.
- [ ] **ACTION** — Set both to `2.7.0`: edit `reeboot/package.json` `version` and the
      `serverVersion` constant in `reeboot/src/server.ts` (leave `webchat/package.json` untouched).
- [ ] **GREEN** — Re-check: both `reeboot/package.json` and the `server.ts` constant read
      `2.7.0`. Assertion passes.

## 2. Write the complete `[2.7.0]` CHANGELOG entry, absorbing Unreleased

- [ ] **RED** — Assert: `CHANGELOG.md` `[2.7.0]` section exists but is missing major
      feature bullets (e.g. no "MCP", no "webhooks", no "memory" pluggability, no `Breaking`
      word) and/or a non-empty `[Unreleased]` section still sits above it. Assertion FAILS
      (incomplete).
- [ ] **ACTION** — Retitle/expand `[2.7.0]` to today's date; add fine-grained `Added` /
      `Changed` / `Fixed` / `Breaking` bullets drawn from the archive briefs + `decisions.md`;
      add one trailing "Internal & tooling" line for dev-only work; fold the `[Unreleased]`
      content in and remove the empty `[Unreleased]` stub.
- [ ] **GREEN** — Re-check: `[2.7.0]` contains the major feature spans (ree SDK, WebChat UI,
      A2A, MCP server, memory, webhooks, auth, skills, jina, hot memory, audit view,
      interactive views, whatsapp reconnect), a `Breaking` item exists, and no `[Unreleased]`
      section remains. Assertion passes.

## 3. Cross-check changelog completeness against git

- [ ] **RED** — Assert: every commit in `git log --oneline v2.6.0..HEAD` maps to at least one
      changelog bullet or the internal line. Enumerate the log and diff it against the written
      bullets; the assertion FAILS where a feature commit is unaccounted.
- [ ] **ACTION** — Add any missing bullets (or fold into the internal line) so every feature
      commit since `v2.6.0` is accounted for.
- [ ] **GREEN** — Re-run the mapping: no feature commit in `v2.6.0..HEAD` lacks a changelog
      home. Assertion passes.

## 4. Commit the release (version bump + changelog)

- [ ] **RED** — Assert: the `2.7.0` version and changelog edits are uncommitted
      (`git status --short` shows changes to `reeboot/package.json`, `reeboot/src/server.ts`,
      `CHANGELOG.md`). Assertion FAILS (changes not yet committed).
- [ ] **ACTION** — `git add` those files (plus any request artifacts) and create one release
      commit with a short, meaningful message: `release: 2.7.0`.
- [ ] **GREEN** — Assert: `git status --short` is clean for those files and `git log --oneline -1`
      shows `release: 2.7.0`. Assertion passes.

## 5. Tag and push v2.7.0

- [ ] **RED** — Assert: `git tag --list 'v2.7.0'` is empty. Assertion FAILS (tag not yet cut).
- [ ] **ACTION** — Create an annotated tag `git tag -a v2.7.0 -m "release 2.7.0"`; push it and
      push `main` to `origin` (`git push origin v2.7.0 && git push origin main`). No npm publish.
- [ ] **GREEN** — Assert: `git tag --list 'v2.7.0'` shows `v2.7.0`, `git ls-remote
      --tags origin v2.7.0` shows it pushed, and `git log --oneline origin/main -1` includes
      the release commit. Assertion passes.
