# Brief — release-2.7.0

## Why

The repo has accumulated a large body of work since the last tagged release (`v2.6.0`,
commit `5a267ab`) — 42 commits spanning roughly July 8 → August 8 (ree SDK, memory
redesign, webhooks, auth-gating, skills UI, MCP server, and more). This work is real and
shipped in code, but it has **never been released**:

- The last git tag is still `v2.6.0`.
- `reeboot/package.json` still declares `2.6.0`.
- The CHANGELOG already contains a `[2.7.0] - 2026-07-16` section claiming a release that
  was never cut (no tag, no version bump). It only documents the mid-July beta era and is
  well short of "everything since 2.6.0."

The motivation is to produce one honest, accurate `2.7.0` release that accounts for all
work since `v2.6.0`, is clearly documented for operators, and is actually tagged and
pushed — resolving the bookkeeping drift between the CHANGELOG, the package version, and
the git tags.

## What Changes

After this request completes:

- `CHANGELOG.md` has a single, complete `[2.7.0]` entry covering **everything since
  `v2.6.0`** — user- and operator-facing features in `Added` / `Changed` / `Fixed` /
  `Breaking` buckets (per the fine-grained-but-curated shape agreed in discovery), plus one
  compact trailing "Internal & tooling" line for dev-only plumbing. The legacy
  `[2.7.0] - 2026-07-16` and `[Unreleased]` stubs are absorbed into it.
- The version is made real: `reeboot/package.json` is bumped to `2.7.0` (and the hardcoded
  `serverVersion` in `src/server.ts`'s MCP wiring matches it).
- Git bookkeeping is resolved: all pending work is committed, an annotated `v2.7.0` tag is
  cut, and tag + branch are pushed to `origin`.
- The release is produced from a **clean committed tree** — no in-flight uncommitted work
  is silently excluded or included.

## Goals

- A changelog that is **accurate and complete** — every user-facing change since `v2.6.0`
  appears exactly once, cross-checked against git so no commit is lost.
- **Honest versioning** — changelog, package.json, and tags all agree on `2.7.0`.
- **Operator clarity** — real feature/breaking bullets are readable at a glance; dev-only
  plumbing is collapsed to one line (the "in-between" shape from discovery).
- A **tagged, pushed** release that can be consumed by others.

## Non-Goals

- No **npm publish** — this is tag + push only (explicitly requested; publishing is a later,
  separate step).
- No **webchat version** treatment — `webchat/package.json` stays at `0.0.1`.
- No new features or code behavior changes — this is a release/documentation task, except
  the mechanical version-string bump already being wired in server.ts.
- No rewrite of `decisions.md` content beyond committing any already-written entries.
- Not retroactively splitting the span into multiple intermediate releases.

## Impact

- **Operators / users**: receive the first release in ~2 months covering the entire July →
  Aug feature set, with a clear summary and named breaking changes.
- **Release mechanics**: resolves the drift where the CHANGELOG claimed a release the repo
  never shipped.
- **Repo hygiene**: ends with a clean working tree, a real `v2.7.0` tag, and matching
  package/changelog versions.
