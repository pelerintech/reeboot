# Design — docker-integration-tests

## Concrete references

Before implementing, read:

- `reeboot/src/server.ts` — Hono routes, WebSocket handler, REST endpoints
- `reeboot/src/agent-runner/index.ts` — `createRunner` factory (pi vs ree)
- `reeboot/src/agent-runner/interface.ts` — `AgentRunner` interface, `RunnerEvent` union
- `reeboot/container/Dockerfile` — build stages, entrypoint
- `reeboot/container/entrypoint.sh` — config resolution, startup
- `reespec/requests/ree-sdk/design.md` — ree SDK architecture (for understanding ree-specific tests)
- `reespec/decisions.md` — "ree-sdk: one SDK per process" (pi and ree are separate containers)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ run-*.sh (shell script)                                      │
│                                                              │
│  1. docker build -t reeboot:integration                      │
│  2. docker run -d -p 3000:3000 -v config.json               │
│  3. waitForHealth() — poll GET /api/health until 200        │
│  4. node test-*.mjs — run the test suite                    │
│  5. docker logs (always, for debugging)                     │
│  6. docker rm                                                │
│  7. exit $?                                                  │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│ helpers.mjs (shared)                                         │
│                                                              │
│  waitForHealth(url, timeout)  — poll REST until up          │
│  wsConnect(url)             — return WebSocket + events     │
│  restGet(url, path)          — fetch GET, return JSON       │
│  restPost(url, path, body)   — fetch POST, return JSON      │
│  restPut(url, path, body)    — fetch PUT, return JSON       │
│  restDelete(url, path)       — fetch DELETE, return JSON    │
│  assert(condition, label)    — track pass/fail              │
│  summary()                   — print results, return code   │
└──────────────────────────────────────────────────────────────┘
              │
         ┌────┴────┐
         ▼         ▼
┌──────────────┐ ┌──────────────┐
│ test-pi.mjs  │ │ test-ree.mjs │
│              │ │              │
│ 14 tests:    │ │ 16 tests:    │
│ health       │ │ health       │
│ status       │ │ status       │
│ channels     │ │ channels     │
│ contexts     │ │ contexts     │
│ sessions     │ │ tasks CRUD   │
│ extensions   │ │ budget CRUD  │
│ coding tools │ │ logs stream  │
│ multi-turn   │ │ reload       │
│              │ │ ws text      │
│              │ │ ws tool      │
│              │ │ ws multi     │
│              │ │ ws abort     │
│              │ │ concurrent   │
│              │ │ isolation    │
└──────────────┘ └──────────────┘
```

### Shell script structure

Both scripts are identical except for the config file and test file name:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REEBOOT_DIR="$(dirname "$SCRIPT_DIR")/.."
IMAGE_TAG="reeboot:integration"
CONTAINER_NAME="reeboot-integration-ree"   # or "-pi"
CONFIG_FILE="$SCRIPT_DIR/config-ree.json"   # or "config-pi.json"
TEST_FILE="$SCRIPT_DIR/test-ree.mjs"        # or "test-pi.mjs"

cleanup() { docker rm -f "$CONTAINER_NAME" 2>/dev/null; }
trap cleanup EXIT

echo "=== Building Docker image ==="
docker build -f "$REEBOOT_DIR/container/Dockerfile" "$REEBOOT_DIR" -t "$IMAGE_TAG"

echo "=== Starting container ==="
docker run -d --name "$CONTAINER_NAME" \
  -p 3000:3000 \
  -v "$CONFIG_FILE:/home/reeboot/.reeboot/config.json" \
  -e REEBOOT_HOST=0.0.0.0 \
  "$IMAGE_TAG"

echo "=== Waiting for health ==="
# Poll /api/health until 200 or timeout
node -e "
const { waitForHealth } = require('./helpers.mjs');
waitForHealth('http://localhost:3000', 30000);
"

echo "=== Running tests ==="
node "$TEST_FILE"
RESULT=$?

echo "=== Container logs ==="
docker logs "$CONTAINER_NAME" 2>&1 | tail -50

exit $RESULT
```

### Config files

**config-pi.json** — full-featured pi mode:
```json
{
  "sdk": "pi",
  "agent": {
    "name": "Reeboot",
    "model": {
      "authMode": "own",
      "provider": "custom",
      "id": "ornith-35b-vllm",
      "baseUrl": "http://100.107.230.26:3000/v1",
      "apiKey": "sk-local-proxy"
    }
  },
  "channels": {
    "web": { "enabled": true, "port": 3000, "trust": "owner" },
    "whatsapp": { "enabled": false },
    "signal": { "enabled": false }
  },
  "memory": { "enabled": false },
  "knowledge": { "enabled": false }
}
```

**config-ree.json** — lightweight ree mode:
```json
{
  "sdk": "ree",
  "agent": {
    "name": "Reeboot",
    "model": {
      "authMode": "own",
      "provider": "custom",
      "id": "ornith-35b-vllm",
      "baseUrl": "http://100.107.230.26:3000/v1",
      "apiKey": "sk-local-proxy"
    }
  },
  "channels": {
    "web": { "enabled": true, "port": 3000, "trust": "owner" },
    "whatsapp": { "enabled": false },
    "signal": { "enabled": false }
  },
  "ree": {
    "maxChats": 50,
    "idleTtlMs": 1800000,
    "maxHistoryPerChat": 50,
    "systemPrompt": "You are a helpful test assistant. Keep responses concise."
  },
  "memory": { "enabled": false },
  "knowledge": { "enabled": false }
}
```

### Helpers module

Pure Node.js, no framework dependencies. Uses `http`/`https` built-ins for REST and `ws` (already in package.json) for WebSocket.

```js
// helpers.mjs
export async function waitForHealth(base, timeout = 30000) { ... }
export async function restGet(base, path) { ... }
export async function restPost(base, path, body) { ... }
export async function restPut(base, path, body) { ... }
export async function restDelete(base, path) { ... }
export function wsConnect(base, contextId) { ... }
export function assert(condition, label) { ... }
export function summary() { ... }
```

Each test calls `assert(condition, "label")` which tracks pass/fail in an array. At the end, `summary()` prints results and returns the exit code.

### Pi test scenarios (test-pi.mjs)

| # | Scenario | Method | Assertion |
|---|---|---|---|
| 1 | Health check | GET `/api/health` | `status === "ok"`, `version` present |
| 2 | Runtime status | GET `/api/status` | valid JSON, `uptime > 0` |
| 3 | Channels registered | GET `/api/channels` | `web` present, `whatsapp` present (even if disabled) |
| 4 | Contexts exist | GET `/api/contexts` | array, contains `main` |
| 5 | Sessions endpoint | GET `/api/contexts/main/sessions` | array (may be empty) |
| 6 | Extensions loaded | POST `/api/reload` → GET `/api/health` | server stays up after reload |
| 7 | WS connect | WebSocket `/ws/chat/main` | `connected` event received |
| 8 | WS text turn | Send "Say hello" | `text_delta`(×N) + `message_end` received |
| 9 | WS tool call (bash) | Send "run bash: echo test" | `tool_call_start` + `tool_call_end` + text |
| 10 | WS tool call (read) | Send "read package.json" | `tool_call_start` (read) + `tool_call_end` + text |
| 11 | WS multi-turn | Send msg1, then msg2 | msg2 response references msg1 context |
| 12 | Tasks endpoint | GET `/api/tasks` | array returned |
| 13 | Budget endpoint | GET `/api/settings/budget` | valid JSON returned |
| 14 | Logs stream | GET `/api/logs/stream` | SSE frames arrive (at least 1) |

### Ree test scenarios (test-ree.mjs)

| # | Scenario | Method | Assertion |
|---|---|---|---|
| 1 | Health check | GET `/api/health` | `status === "ok"`, `version` present |
| 2 | Runtime status | GET `/api/status` | valid JSON, `uptime > 0` |
| 3 | Channels registered | GET `/api/channels` | `web` present, no whatsapp/signal |
| 4 | Contexts exist | GET `/api/contexts` | array, contains `main` |
| 5 | Tasks CRUD | GET → POST → GET → DELETE | create returns task, delete removes it |
| 6 | Budget CRUD | GET → PUT → GET | put changes budget, get reflects it |
| 7 | Logs stream | GET `/api/logs/stream` | SSE frames arrive |
| 8 | Reload | POST `/api/reload` → GET `/api/health` | server stays up |
| 9 | WS connect | WebSocket `/ws/chat/main` | `connected` event received |
| 10 | WS text turn | Send "Say hello" | `text_delta`(×N) + `message_end` received |
| 11 | WS tool call | Send "run bash: echo test" | `tool_call_start` + `tool_call_end` + text |
| 12 | WS multi-turn | Send msg1, then msg2 | both turns complete |
| 13 | WS abort | Send long prompt → abort | no `message_end`, clean disconnect |
| 14 | Concurrent chats | 2 WS connections, both send | both get independent responses |
| 15 | Chat isolation | Chat A registers tool, Chat B doesn't see it | tools are per-chat |
| 16 | Extension subset | WS turn with capabilities | tools list injected (from capabilities extension) |

### AGENTS.md

Developer-facing document at `reeboot/AGENTS.md` that instructs future agents:

```markdown
# Reeboot — Developer Instructions

## Integration tests

After any major implementation (new SDK adapter, agent loop change,
extension refactoring, Docker build change), validate the full system:

```bash
cd reeboot/tests/docker-integration
./run-pi.sh    # tests pi SDK in Docker
./run-ree.sh   # tests ree SDK in Docker
```

Both scripts build the Docker image, start a container with the target
SDK config, run integration tests against the live container, and tear
down. They require Docker and a reachable local LLM model.

Each script exits 0 on success, 1 on any test failure. Container logs
are always printed for debugging.
```

## Risks

**Local model availability.** Both tests require `ornith-35b-vllm` at `http://100.107.230.26:3000/v1`. If the model is down, all WS chat tests fail. Mitigation: the scripts print a clear error if the model is unreachable.

**Docker build time.** Each script runs `docker build` which takes ~2 minutes with layer caching. Mitigation: the image tag is fixed (`reeboot:integration`) so repeated runs reuse the cache.

**Port 3000 conflict.** If another process uses port 3000, the container fails to start. Mitigation: the script checks for existing containers and removes them.

**Test flakiness.** LLM responses vary — a model might refuse to use a tool or give an unexpected response. Mitigation: tests assert event structure (tool_call_start fired), not response content.

## Tradeoffs

**Why shell scripts, not a test framework runner?** Shell scripts are self-contained — no npm install, no vitest config, no tsx. You `chmod +x` and run. They match the "manual, on-demand" requirement.

**Why separate test files, not one shared suite?** Pi and ree serve different use cases with different features. Sharing test logic via `helpers.mjs` avoids duplication while keeping scenarios SDK-specific.

**Why the same local model for both?** Avoids API costs, rate limits, and network dependencies. The model is already available and fast enough for integration testing.

**Why not test every REST endpoint?** The goal is to verify the system works, not achieve 100% endpoint coverage. The most critical paths (health, channels, contexts, tasks, budget, WS chat) are tested. Endpoints like `/api/channels/:type/login` require actual channel credentials and are out of scope.
