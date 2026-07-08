# Tasks — docker-integration-tests

## 0. Create directory structure and config files

- [ ] **RED** — Check: `reeboot/tests/docker-integration/` does not exist. Assertion fails — directory is absent.
- [ ] **ACTION** — Create `reeboot/tests/docker-integration/`. Create `config-pi.json` with `sdk: "pi"`, local model config, memory/knowledge disabled. Create `config-ree.json` with `sdk: "ree"`, local model config, ree-specific settings, memory/knowledge disabled.
- [ ] **GREEN** — Verify: both config files exist, are valid JSON, have correct `sdk` values, and reference the local model (`ornith-35b-vllm`, `baseUrl: http://100.107.230.26:3000/v1`).

## 1. Create helpers.mjs — shared test primitives

- [ ] **RED** — Write `reeboot/tests/docker-integration/helpers.mjs` with stubs. Run `node -e "import('./helpers.mjs').then(() => console.log('ok'))"` → fails (module not found).
- [ ] **ACTION** — Create `helpers.mjs` with:
  - `waitForHealth(base, timeout)` — polls `GET /api/health` every 1s until 200 or timeout. Throws on timeout.
  - `restGet(base, path)` — `fetch(base + path)`, parses JSON, returns body.
  - `restPost(base, path, body)` — `fetch(base + path, { method: 'POST', body: JSON.stringify(body) })`, returns JSON.
  - `restPut(base, path, body)` — same with PUT.
  - `restDelete(base, path)` — same with DELETE.
  - `wsConnect(base, contextId)` — `new WebSocket(base + '/ws/chat/' + contextId)`, returns `{ ws, events: [] }` with message listener attached.
  - `assert(condition, label)` — pushes `{ label, pass: Boolean(condition) }` to a results array.
  - `summary()` — prints each result as `[PASS]` or `[FAIL]`, returns `results.every(r => r.pass)`.
- [ ] **GREEN** — Verify: `node -e "import('./helpers.mjs').then((m) => { m.assert(true, 'test'); console.log(m.summary()); })"` prints `[PASS] test` and exits 0.

## 2. Create run-ree.sh — Docker build, start, test, teardown

- [ ] **RED** — Check: `reeboot/tests/docker-integration/run-ree.sh` does not exist. Assertion fails.
- [ ] **ACTION** — Create `run-ree.sh`:
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
- [ ] **GREEN** — Verify: `./run-ree.sh` builds the image, starts the container, waits for health, and tears down. (Test suite will fail since test-ree.mjs doesn't exist yet — that's expected.)

## 3. Create run-pi.sh — identical structure, pi config

- [ ] **RED** — Check: `reeboot/tests/docker-integration/run-pi.sh` does not exist.
- [ ] **ACTION** — Copy `run-ree.sh` to `run-pi.sh`. Change `CONTAINER_NAME=reeboot-integration-pi`, `CONFIG_FILE=config-pi.json`, `TEST_FILE=test-pi.mjs`. `chmod +x`.
- [ ] **GREEN** — Verify: `./run-pi.sh` builds (uses cached image), starts container with pi config, waits for health, tears down.

## 4. Create test-ree.mjs — ree-specific integration tests

- [ ] **RED** — Write `reeboot/tests/docker-integration/test-ree.mjs` with 16 test scenarios. Run `node test-ree.mjs` → fails (tests don't pass yet).
- [ ] **ACTION** — Create `test-ree.mjs` importing helpers. Implement all 16 scenarios:
  1. Health check — `restGet('/api/health')`, assert status=ok, version present
  2. Runtime status — `restGet('/api/status')`, assert valid JSON
  3. Channels — `restGet('/api/channels')`, assert web present
  4. Contexts — `restGet('/api/contexts')`, assert main exists
  5. Tasks CRUD — GET → POST → GET (verify task) → DELETE
  6. Budget CRUD — GET → PUT → GET (verify change)
  7. Logs stream — `fetch('/api/logs/stream')`, read until 10s timeout, assert SSE frame
  8. Reload — `restPost('/api/reload')`, then `restGet('/api/health')` still ok
  9. WS connect — `wsConnect('main')`, assert `connected` event
  10. WS text turn — send "Say hello", assert `text_delta`(×N) + `message_end`
  11. WS tool call — send "run bash: echo test", assert `tool_call_start` + `tool_call_end`
  12. WS multi-turn — send msg1, wait for `message_end`, send msg2, wait for `message_end`
  13. WS abort — send message, wait for `text_delta`, send abort, assert no `message_end`
  14. Concurrent chats — 2 WS connections (main + test), both send, both get `message_end`
  15. Chat isolation — verify tools registered on chat A not visible to chat B
  16. Extension subset — send "What tools do you have?", assert response mentions tools
- [ ] **GREEN** — Verify: `./run-ree.sh` exits 0, all 16 tests print `[PASS]`.

## 5. Create test-pi.mjs — pi-specific integration tests

- [ ] **RED** — Write `reeboot/tests/docker-integration/test-pi.mjs` with 14 test scenarios. Run `node test-pi.mjs` → fails.
- [ ] **ACTION** — Create `test-pi.mjs` importing helpers. Implement all 14 scenarios:
  1. Health check — same as ree
  2. Runtime status — same as ree
  3. Channels — assert web + whatsapp present (even if disabled)
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
  14. Logs stream — same as ree
- [ ] **GREEN** — Verify: `./run-pi.sh` exits 0, all 14 tests print `[PASS]`.

## 6. Create reeboot/AGENTS.md — developer instructions

- [ ] **RED** — Check: `reeboot/AGENTS.md` does not exist.
- [ ] **ACTION** — Create `reeboot/AGENTS.md` with:
  - Title: "Reeboot — Developer Instructions"
  - Section "Integration tests" explaining the two scripts
  - Commands to run each script
  - Instruction: "Run these after any major implementation (SDK adapter, agent loop change, extension refactoring, Docker build change)"
  - Note about requirements: Docker, local LLM model reachable
- [ ] **GREEN** — Verify: `reeboot/AGENTS.md` exists, references both scripts, states when to run them.

## 7. Run both scripts end-to-end

- [ ] **RED** — Check: `./run-pi.sh` or `./run-ree.sh` exits non-zero or has test failures.
- [ ] **ACTION** — Run both scripts. Fix any failures: adjust assertions, handle edge cases (e.g., model refuses tool call, SSE stream format), add delays where needed.
- [ ] **GREEN** — Verify: `./run-pi.sh` exits 0 with all 14 `[PASS]`. `./run-ree.sh` exits 0 with all 16 `[PASS]`. Container logs show no errors.
