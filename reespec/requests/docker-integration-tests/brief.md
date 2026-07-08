# Brief — docker-integration-tests

## Problem

The ree-sdk and sdk-pluggability implementations are verified by unit tests (95 runtime tests, 21 adapter tests) but have never been validated as a running system. Unit tests mock the TanStack client, mock the DB, and mock the provider — they prove the code paths exist but not that a built Docker container actually starts, serves requests, and runs full agent turns against a real LLM.

Without container-level integration tests:
- A future change could break the Docker build silently (peer deps, TypeScript errors caught only by `tsc` not by `npm ci`)
- The WebSocket protocol, REST API, and agent loop could regress without anyone noticing
- There is no single command to verify "reeboot works end-to-end with sdk=pi" or "sdk=ree"
- Future contributors (human or agent) have no automated way to validate a major change

## Vision

Two self-contained shell scripts that build the Docker image, start a container with the target SDK config, run a full battery of integration tests against the live container, tear it down, and exit with a pass/fail code. Run manually after major implementations — not in CI.

```
./tests/docker-integration/run-pi.sh
  → docker build → docker run (sdk=pi) → 14 tests → docker rm → exit 0|1

./tests/docker-integration/run-ree.sh
  → docker build → docker run (sdk=ree) → 16 tests → docker rm → exit 0|1
```

Both hit the same local model (`ornith-35b-vllm`) to avoid API costs and rate limits. Each test suite is tailored to its SDK's actual use case: pi tests single-owner features (sessions, channels, coding tools); ree tests multi-user features (concurrent chats, isolation, API-driven flow).

## Goals

- `run-pi.sh`: builds image, starts container with `sdk: "pi"`, runs pi-specific integration tests, tears down, exits with result code.
- `run-ree.sh`: builds image, starts container with `sdk: "ree"`, runs ree-specific integration tests, tears down, exits with result code.
- Shared `helpers.mjs` with reusable primitives: `waitForHealth()`, `wsConnect()`, `assertEvent()`, `restGet()`, `restPost()`.
- Pi test suite covers: health, status, channels (WA + Signal), contexts, sessions, full extension set, coding tools (bash, read, write), multi-turn history.
- Ree test suite covers: health, status, channels (web only), contexts, tasks CRUD, budget CRUD, logs stream, reload, WS chat (text + tool + multi-turn + abort), concurrent chat isolation.
- `reeboot/AGENTS.md` created as a developer-facing document instructing future agents to run these tests after major implementations.
- Tests use the same local model (`ornith-35b-vllm`) for both SDKs — no API keys needed.

## Non-Goals

- Not CI/automated pipeline tests — these are manual, on-demand.
- Not replacing the existing unit test suite — complementary, not替代.
- Not testing every REST endpoint exhaustively — the most important ones.
- Not testing WhatsApp/Signal actual connectivity — only that channels are registered and report correct state.
- Not testing the webchat UI — API and WebSocket only.
- Not testing MCP, knowledge corpus, or memory consolidation — separate concerns.

## Impact

- Single command to verify "reeboot works" after any major change.
- Catches Docker build failures, WebSocket protocol regressions, and agent loop bugs that unit tests cannot.
- Documents the expected behaviour of each SDK mode in executable form.
- Gives future agents a clear instruction: "run these after your change."

## Scope

- 2 shell scripts: `run-pi.sh`, `run-ree.sh`
- 2 test suites: `test-pi.mjs`, `test-ree.mjs`
- 1 shared helpers module: `helpers.mjs`
- 2 config files: `config-pi.json`, `config-ree.json`
- 1 new file: `reeboot/AGENTS.md` (developer instructions)
- No new npm dependencies — uses `node` built-ins + `ws` (already in package.json)
