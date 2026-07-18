# Tasks — docker-integration-tests

## 0. Create directory structure and config files

- [x] **RED** — Check: `reeboot/tests/docker-integration/` does not exist. Assertion fails — directory is absent.
- [x] **ACTION** — Create `reeboot/tests/docker-integration/`. Create `config-pi.json` with `sdk: "pi"`, local model config, memory/knowledge disabled. Create `config-ree.json` with `sdk: "ree"`, local model config, ree-specific settings, memory/knowledge disabled.
- [x] **GREEN** — Verify: both config files exist, are valid JSON, have correct `sdk` values, and reference the local model (`ornith-35b-vllm`, `baseUrl: http://100.107.230.26:3000/v1`).

## 1. Create helpers.mjs — shared test primitives

- [x] **RED** — Write `reeboot/tests/docker-integration/helpers.mjs` with stubs. Run `node -e "import('./helpers.mjs').then(() => console.log('ok'))"` → fails (module not found).
- [x] **ACTION** — Create `helpers.mjs` with:
  - `waitForHealth(base, timeout)` — polls `GET /api/health` every 1s until 200 or timeout. Throws on timeout.
  - `restGet(base, path)` — `fetch(base + path)`, parses JSON, returns body.
  - `restPost(base, path, body)` — `fetch(base + path, { method: 'POST', body: JSON.stringify(body) })`, returns JSON.
  - `restPut(base, path, body)` — same with PUT.
  - `restDelete(base, path)` — same with DELETE.
  - `wsConnect(base, contextId)` — `new WebSocket(base + '/ws/chat/' + contextId)`, returns `{ ws, events: [] }` with message listener attached.
  - `assert(condition, label)` — pushes `{ label, pass: Boolean(condition) }` to a results array.
  - `summary()` — prints each result as `[PASS]` or `[FAIL]`, returns `results.every(r => r.pass)`.
- [x] **GREEN** — Verify: `node -e "import('./helpers.mjs').then((m) => { m.assert(true, 'test'); console.log(m.summary()); })"` prints `[PASS] test` and exits 0.

## 2. Create run-ree.sh — Docker build, start, test, teardown

- [x] **RED** — Check: `reeboot/tests/docker-integration/run-ree.sh` does not exist. Assertion fails.
- [x] **ACTION** — Create `run-ree.sh`:
  - `#!/usr/bin/env bash`, `set -euo pipefail`
  - Resolve `SCRIPT_DIR`, `REEBOOT_DIR`, `IMAGE_TAG=reeboot:integration`, `CONTAINER_NAME=reeboot-integration-ree`
  - `cleanup()` trap: `docker rm -f "$CONTAINER_NAME" 2>/dev/null`
  - Step 1: `docker build -f "$REEBOOT_DIR/container/Dockerfile" "$REEBOOT_DIR" -t "$IMAGE_TAG"`
  - Step 2: `docker run -d --name "$CONTAINER_NAME" -p 3000:3000 -v "$CONFIG_FILE:/home/reeboot/.reeboot/config.json" -e REEBOOT_HOST=0.0.0.0 "$IMAGE_TAG"`
  - Step 3: `node -e "import('./helpers.mjs').then(m => m.waitForHealth('http://localhost:3000', 30000))"`
  - Step 4: `node test-ree.mjs`
  - Step 5: `docker logs "$CONTAINER_NAME" 2>&1 | tail -50`
  - Step 6: exit with test result code
  - `chmod +x run-ree.sh`
- [x] **GREEN** — Verify: `./run-ree.sh` builds the image, starts the container, waits for health, and tears down. (Test suite will fail since test-ree.mjs doesn't exist yet — that's expected.)

## 3. Create run-pi.sh — identical structure, pi config

- [x] **RED** — Check: `reeboot/tests/docker-integration/run-pi.sh` does not exist.
- [x] **ACTION** — Copy `run-ree.sh` to `run-pi.sh`. Change `CONTAINER_NAME=reeboot-integration-pi`, `CONFIG_FILE=config-pi.json`, `TEST_FILE=test-pi.mjs`. `chmod +x`.
- [x] **GREEN** — Verify: `./run-pi.sh` builds (uses cached image), starts container with pi config, waits for health, tears down.

## 4. Create test-ree.mjs — ree-specific integration tests

- [x] **RED** — Write `reeboot/tests/docker-integration/test-ree.mjs` with 16 test scenarios. Run `node test-ree.mjs` → fails (tests don't pass yet).
- [x] **ACTION** — Create `test-ree.mjs` importing helpers. Implement all 16 scenarios:
  1. Health check — `restGet('/api/health')`, assert status=ok, version present
  2. Runtime status — `restGet('/api/status')`, assert valid JSON
  3. Channels — `restGet('/api/channels')`, assert web present
  4. Contexts — `restGet('/api/contexts')`, assert main exists
  5. Tasks CRUD — GET → POST → GET (verify task) → DELETE
  6. Budget CRUD — GET → PUT → GET (verify change)
  7. Logs stream — `fetch('/api/logs/stream')`, verify SSE endpoint reachable with correct content type
  8. Reload — `restPost('/api/reload')`, then `restGet('/api/health')` still ok
  9. WS connect — `wsConnect('main')`, assert `connected` event
  10. WS text turn — send "Say hello", assert `text_delta`(×N) + `message_end`
  11. WS tool call — send "run bash: echo test", assert `tool_call_start` + `tool_call_end`
  12. WS multi-turn — send msg1, wait for `message_end`, send msg2, wait for `message_end`
  13. WS abort — send message, wait for `text_delta`, send cancel, assert `cancelled`
  14. Concurrent chats — 2 WS connections, sequential turns, both get `message_end`
  15. Chat isolation — verify independent sessions
  16. Extension subset — send "What tools do you have?", assert response
- [x] **GREEN** — Verify: `./run-ree.sh` exits 0, all 16 tests print `[PASS]`.

## 5. Create test-pi.mjs — pi-specific integration tests

- [x] **RED** — Write `reeboot/tests/docker-integration/test-pi.mjs` with 14 test scenarios. Run `node test-pi.mjs` → fails.
- [x] **ACTION** — Create `test-pi.mjs` importing helpers. Implement all 14 scenarios:
  1. Health check — same as ree
  2. Runtime status — same as ree
  3. Channels — assert web present
  4. Contexts — assert main exists
  5. Sessions — `restGet('/api/contexts/main/sessions')`, assert array
  6. Extensions loaded — `restPost('/api/reload')`, then health still ok
  7. WS connect — same as ree
  8. WS text turn — same as ree
  9. WS tool call (bash) — same as ree
  10. WS tool call (read) — send "read package.json", assert `tool_call_start` (read)
  11. WS multi-turn — same as ree
  12. Tasks endpoint — `restGet('/api/tasks')`, assert array
  13. Budget endpoint — `restGet('/api/settings/budget')`, assert valid JSON
  14. Logs stream — verify SSE endpoint reachable
- [x] **GREEN** — Verify: `./run-pi.sh` exits 0, all 14 tests print `[PASS]`.

## 6. Create reeboot/AGENTS.md — developer instructions

- [x] **RED** — Check: `reeboot/AGENTS.md` does not exist.
- [x] **ACTION** — Create `reeboot/AGENTS.md` with:
  - Title: "Reeboot — Developer Instructions"
  - Section "Integration tests" explaining the two scripts
  - Commands to run each script
  - Instruction: "Run these after any major implementation (SDK adapter, agent loop change, extension refactoring, Docker build change)"
  - Note about requirements: Docker, local LLM model reachable
- [x] **GREEN** — Verify: `reeboot/AGENTS.md` exists, references both scripts, states when to run them.

## 7. Run both scripts end-to-end

- [x] **RED** — Check: `./run-pi.sh` or `./run-ree.sh` exits non-zero or has test failures.
- [x] **ACTION** — Run both scripts. Fix any failures: adjust assertions, handle edge cases (e.g., model refuses tool call, SSE stream format), add delays where needed.
- [x] **GREEN** — Verify: `./run-pi.sh` exits 0 with all 14 `[PASS]`. `./run-ree.sh` exits 0 with all 16 `[PASS]`. Container logs show no errors.

---

## Post-evaluation gap fixes

## 8. Add `uptime` assertion to health check (REST API spec S1)

- [x] **RED** — Check: neither `test-pi.mjs` nor `test-ree.mjs` asserts `uptime` in health response.
- [x] **ACTION** — Add `assert(typeof health.uptime === 'number' && health.uptime > 0, ...)` to both test files' health check.
- [x] **GREEN** — Verify: `grep 'uptime'` finds the assertion in both files.

## 9. Add `toolName` field assertions to tool_call_start events (WS spec S3, S8)

- [x] **RED** — Check: no `toolName` assertions on `tool_call_start` events in any test.
- [x] **ACTION** — Add `assert(toolStart.toolName === 'bash', ...)` to test-pi.mjs test 9, `assert(toolStart.toolName === 'read', ...)` to test-pi.mjs test 10, `assert(toolStart.toolName === 'bash', ...)` to test-ree.mjs test 11.
- [x] **GREEN** — Verify: `grep 'toolName'` finds assertions in all three tool call tests.

## 10. Fix multi-turn tests to verify context recall (WS spec S4)

- [x] **RED** — Check: neither test file verifies the second turn's text contains the remembered name.
- [x] **ACTION** — After second turn completes, extract text_deltas and assert text contains "Alice" (ree) / "Bob" (pi).
- [x] **GREEN** — Verify: both test files now assert context recall.

## 11. Document abort type mismatch (WS spec S5)

- [x] **RED** — Check: spec says `{ type: "abort" }` but server accepts `{ type: "cancel" }`.
- [x] **ACTION** — Keep `cancel` type (matches server), add comment noting spec discrepancy.
- [x] **GREEN** — Verify: test uses `cancel`/`cancelled` with explanatory comment.

## 12. Fix concurrent chat test (WS spec S6)

- [x] **RED** — Check: test runs sequential connections to same context instead of simultaneous to different contexts.
- [x] **ACTION** — Rewrite test 14 to open connections to `main` and `test` simultaneously, send both messages before waiting.
- [x] **GREEN** — Verify: test uses `wsConnect(BASE, 'main')` and `wsConnect(BASE, 'test')` with simultaneous sends.

## 13. Fix pi logs stream to verify SSE frame content (REST API spec S8)

- [x] **RED** — Check: pi test 14 only checks status code and content-type, doesn't read SSE frames.
- [x] **ACTION** — Update test 14 to read response body, trigger reload for log generation, and assert at least one `data: ` frame.
- [x] **GREEN** — Verify: test reads stream body and asserts `gotFrame`.

---

## Round 2 post-evaluation gap fixes

## 14. Fix `test-ree.mjs` logs stream to assert `gotFrame` (REST API spec S8)

- [x] **RED** — Check: `test-ree.mjs` test 7 asserts `assert(true, ...)` instead of `assert(gotFrame, ...)`.
- [x] **ACTION** — Change assertion to `assert(gotFrame, '7c. Logs stream — at least 1 SSE frame with data: prefix')`.
- [x] **GREEN** — Verify: `grep '7c.*Logs stream'` shows `gotFrame` assertion.

## 15. Add `toolCallId` matching assertions (WS spec S3)

- [x] **RED** — Check: no `toolCallId` assertions in any tool call test.
- [x] **ACTION** — Capture `toolCallId` from `tool_call_start` and assert it matches `tool_call_end.toolCallId` in all three tool call tests (pi bash, pi read, ree bash).
- [x] **GREEN** — Verify: `grep 'toolCallId'` finds assertions in all three tests.

## 16. Add `write` tool test to pi suite + verify tool names in ree extension subset (brief goal + WS spec S7)

- [x] **RED** — Check: no `write` tool test in `test-pi.mjs`; ree test 16 only asserts non-empty response.
- [x] **ACTION** — Add `write` tool test (10b) to `test-pi.mjs` with `toolName`, `toolCallId`, and `message_end` assertions. Update ree test 16 to assert response text includes `bash`, `read`, `write`.
- [x] **GREEN** — Verify: `grep 'write'` finds write tool test in pi; `grep 'bash\|read\|write'` finds tool name assertions in ree.

## 17. Strengthen abort test — verify no `message_end` and connection liveness (WS spec S5)

- [x] **RED** — Check: abort test only asserts `cancelled` event, doesn't verify `message_end` absence or connection liveness.
- [x] **ACTION** — Rewrite test 13 to: (a) record events before abort, (b) assert no `message_end` in aborted turn's events, (c) send follow-up message to verify connection still open.
- [x] **GREEN** — Verify: test 13 has three assertions — cancelled event, no message_end, connection liveness.

## 18. Add `assertEvent()` to helpers.mjs (brief Goals)

- [x] **RED** — Check: `assertEvent` is not exported from `helpers.mjs` (confirmed by `grep`).
- [x] **ACTION** — Add `assertEvent(events, type, label)` to `helpers.mjs`. Function asserts that an event of the given type exists in the events array, tracks pass/fail via `results`, returns the found event or null.
- [x] **GREEN** — Verify: `node -e "import('./helpers.mjs').then(m => console.log(typeof m.assertEvent))"` prints `function`.
