# Design — release-2.7.0

## Context

Repo state at planning time:

- Last tag: `v2.6.0` (commit `5a267ab`); HEAD is `6b10574` (this request's prep commit).
- 43 commits now sit between `v2.6.0` and HEAD, spanning ~Jul 8 → Aug 8.
- `reeboot/package.json` declares `2.6.0`; `webchat/package.json` declares `0.0.1`.
- `CHANGELOG.md` has a stale `[2.7.0] - 2026-07-16` section (a release never actually cut)
  plus a small `[Unreleased]` section (bundle-lean catalog, multi-user ree, audit view).
- The MCP server work (previously uncommitted) was committed in this request's prep commit
  `6b10574`, so the release can be cut from committed code. Its MCP wiring hardcodes
  `serverVersion = '2.6.0'` in `reeboot/src/server.ts` — must be updated to `2.7.0`.
- Sources of truth for changelog content:
  1. **Archived request briefs** (`reespec/requests/archive/2026-07-*`, `2026-08-*`) — the
     per-feature "what changed" narrative.
  2. **`reespec/decisions.md`** — carries explicit breaking-change and behavioral signals
     (memory contract reshape, zod 4, discrim-union memory config, hot-first memory, etc.).
  3. **git log** — the completeness cross-check (every commit must map to a changelog line).
- Command available: `reespec status --request release-2.7.0` to verify artifacts throughout.

## Approach

### Single, honest 2.7.0 release (decided in discovery)

Collapse everything since `v2.6.0` into ONE `2.7.0` release. Do NOT pretend intermediate
releases existed. The meaninglessly-dated `[2.7.0] - 2026-07-16` stub becomes the live
entry, retitled with today's date and expanded to the full span.

### Changelog shape: fine-grained but curated ("in-between")

- Each user-/operator-facing change across the span gets its own bullet, bucketed into
  `Added` / `Changed` / `Fixed` / `Breaking`.
- `Breaking` is explicit and named — surfaced from `decisions.md` (memory config
  discriminated-union, memory `add`→hot-first semantics, provider-owned hot memory,
  skills default-on enabled set, zod 4 default semantics).
- Dev-only plumbing (test-suite-stabilization, ci-zod4-fix, docker-integration-tests,
  observability internals that produced no user-visible behavior) is collapsed into ONE
  trailing "Internal & tooling" line rather than bulleted.
- The `[Unreleased]` content is absorbed into the `2.7.0` section; no empty `[Unreleased]`
  stub is left behind (release is cut).

Changelog content is compiled from archive briefs + decisions.md, then cross-checked
against `git log v2.6.0..HEAD` so no feature commit is omitted.

### Version mechanics

- `reeboot/package.json` → `2.7.0`.
- `reeboot/src/server.ts` MCP `serverVersion` string → `2.7.0` (matches package).
- New `[2.7.0]` entry dated today (2026-08-08).
- `webchat/package.json` untouched (out of scope — non-goal).

### Release mechanics (tag + push only)

- Commit the version bump + changelog together as one "release: 2.7.0" commit.
- Create an annotated tag `v2.7.0`.
- Push the tag and push `main` to `origin/main`.
- **No npm publish** (explicit non-goal).

## Risks

- **Unaccounted commits** — mitigated by the git-log cross-check task; any commit not
  traceable to a bullet is surfaced during execution and resolved with the human if unclear.
- **Breaking-change omission** — mitigated by deriving `Breaking` explicitly from
  `decisions.md` rather than from commit messages.
- **Stale version strings** — the hardcoded MCP `serverVersion` could be missed; the version
  task asserts on *both* `package.json` and the `server.ts` constant.
- **Accidental push of unrelated work** — mitigated by cutting the tag from the explicit
  release commit and checking `git status`/diff before pushing.
- **Human-anchored assertions** — kept to a minimum; the plan prefers verifiable
  file/git-state assertions over "stakeholder approves" wherever possible.
