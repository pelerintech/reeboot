# Brief — readme-and-changelog

## What

Add a top-level `README.md` and `CHANGELOG.md` to the repository root (`/Users/bn/p/pel/reeboot/agent/`).

The README is the project's public front door — what reeboot is, how to install and use it, and where to find more.
The CHANGELOG documents what changed in each released version, derived from the three commit phases.

## Goals

- `README.md` at repo root that describes reeboot clearly, with install instructions, feature highlights, and links.
- `CHANGELOG.md` at repo root covering three versions:
  - **1.0.0** — Phase 1 core (initial commit)
  - **1.2.0** — Signal channel RPC enhancements (signal rpc commit)
  - **1.3.0** — Phase 2 & 3 (setup wizard UX, scheduler upgrade, proactive agent, web search, skill manager, Docker, skills library, CI/CD)

## Non-Goals

- Not updating `reeboot/README.md` (the package-level README that ships on npm — already comprehensive)
- Not adding docs for features not yet implemented
- Not changing any source code

## Impact

Anyone landing on the GitHub repo gets immediate orientation. The changelog gives a clear release history.
