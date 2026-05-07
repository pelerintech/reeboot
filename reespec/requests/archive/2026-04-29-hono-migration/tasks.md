# Tasks: Hono Migration (Parallel Build + Cutover)

## Philosophy

Build the Hono implementations **alongside** the Fastify originals. Keep everything working at every step. Only remove Fastify after the new code is fully tested, integrated, and smoke-tested. The cutover is done via a thin re-export shim — reversible in minutes if anything breaks.

```
Phase 1:  Add Hono deps (Fastify still present, all tests green)
Phase 2:  Build credential-proxy-hono.ts + tests (new files only)
Phase 3:  Build server-hono.ts + tests (new files only)
Phase 4:  Cutover — re-export shim flips the system to Hono
Phase 5:  Cleanup — rename tests, delete old tests, rename source files
Phase 6:  Remove Fastify deps, final verify
```

---

## Phase 1: Add Hono Dependencies

### 1. Install Hono alongside Fastify

- [x] **RED** — Assert `test -d node_modules/hono` is false AND `npm run test:run` is green.
- [x] **ACTION** — `npm install hono @hono/node-server @hono/node-ws`. Add to `dependencies` in `package.json`. Do NOT remove `fastify`, `@fastify/websocket`, `@fastify/static`.
- [x] **GREEN** — `node_modules/hono` exists. `npm run build` passes. `npm run test:run` passes (unchanged — Hono deps still unused).

---

## Phase 2: Build Hono Credential Proxy

### 2. Create src/credential-proxy-hono.ts

- [x] **RED** — Assert `src/credential-proxy-hono.ts` does not exist.
- [x] **ACTION** — Write `src/credential-proxy-hono.ts`:
  - Exports: `startProxy`, `stopProxy`, `proxyApp`
  - `proxyApp = new Hono()` — exported for direct handler testing
  - `proxyApp.all('/*', async (c) => { ... })` reads method/body/headers from `c.req`
  - Forwards via `fetch()` to provider URL (same provider mapping as original)
  - Returns response with `c.json()` or `c.text()` — same status codes as original
  - `startProxy(config)` creates server via `createServer({ fetch: proxyApp.fetch })` from `@hono/node-server`, calls `.listen()`, stores singleton
  - `stopProxy()` closes server, nulls singleton
  - No Fastify imports anywhere
- [x] **GREEN** — `npm run build` passes. `grep -i fastify src/credential-proxy-hono.ts` returns empty.

### 3. Write tests for credential-proxy-hono.ts

- [x] **RED** — Write `tests/credential-proxy-hono.test.ts`:
  - Import `{ startProxy, stopProxy, proxyApp }` from `@src/credential-proxy-hono.js`
  - Mock `fetch` globally (provider forwarding)
  - Tests: disabled → null, enabled → server starts on 127.0.0.1, `/v1/messages` forwards with real key replacing placeholder, provider routing (anthropic/openai/google), error handling (502), stopProxy idempotent
  - Use `proxyApp.fetch(new Request(...))` for direct handler testing
  - Run → fails (file does not exist or has compilation errors)
- [x] **ACTION** — Complete the test file per `specs/credential-proxy.spec.md`.
- [x] **GREEN** — `npm run test:run -- tests/credential-proxy-hono.test.ts` passes.

---

## Phase 3: Build Hono Main Server

### 4. Create src/server-hono.ts

- [x] **RED** — Assert `src/server-hono.ts` does not exist.
- [x] **ACTION** — Write `src/server-hono.ts`:
  - Exports: `startServer`, `stopServer`, `type ServerOptions`
  - Uses `Hono` for routing, `@hono/node-server` for `createServer`, `@hono/node-ws` for WS
  - Fresh internal singletons: `_server`, `_activeRunners`, `_channelAdapters`, `_orchestrator`, `_scheduler`, `_credProxy` — no sharing with old server.ts
  - Startup sequence faithful to original: DB setup, resilience DB phase, channel/orchestrator init, deferred resilience phase, credential proxy, scheduler, heartbeat
  - `startServer(opts)` returns `{ port: number, host: string }`
  - All routes ported with Hono syntax (`app.get(path, handler)`, `c.json()`, `c.req.param()`, `c.req.json()`, `c.header()`)
  - WS route: `app.get('/ws/chat/:contextId', upgradeWebSocket((c) => ({ onOpen, onMessage, onClose })))` — auth via `c.env.incoming.socket.remoteAddress`, token via `c.req.query()`/`c.req.header()`
  - Static files: `serveStatic` from `@hono/node-server/serve-static` for `webchat/`
  - Not-found: `app.notFound((c) => c.json({ error: 'Not found' }, 404))`
  - `stopServer()` lifecycle: close proxy, stop heartbeat, stop scheduler, stop orchestrator, stop adapters, abort runners, close server
- [x] **GREEN** — `npm run build` passes. `grep -i fastify src/server-hono.ts` returns empty.

### 5. Write server bootstrap tests for server-hono.ts

- [x] **RED** — Write `tests/server-hono.test.ts`:
  - Import `{ startServer, stopServer }` from `@src/server-hono.js`
  - Tests: `startServer({ port: 0, logLevel: 'silent' })` returns `{ port: >0 }`, `GET /api/health` → 200 `{ status, uptime, version }`, `GET /api/status` → 200, unknown route → 404 JSON, `stopServer()` resolves, `stopServer()` idempotent
  - Run → fails
- [x] **ACTION** — Complete the test file. Use `http://localhost:${port}` pattern.
- [x] **GREEN** — `npm run test:run -- tests/server-hono.test.ts` passes.

### 6. Write REST API tests for server-hono.ts

- [x] **RED** — Write `tests/rest-api-hono.test.ts`:
  - Import from `@src/server-hono.js`
  - Setup/tearndown with tmp DB, tmp dir
  - Tests: `GET /` → 200 HTML, `GET /api/health`, `GET /api/status`, `GET /api/channels`, `POST /api/channels/:type/login` (202 + 404), `POST /api/channels/:type/logout` (200 + 404), `POST /api/reload` (200 + 503 + 500), `POST /api/restart` (200), `GET /api/contexts`, `POST /api/contexts` (201 + 400), `GET /api/contexts/:id/sessions` (200 + 404)
  - Run → fails
- [x] **ACTION** — Complete the test file per `specs/rest-api.spec.md`.
- [x] **GREEN** — `npm run test:run -- tests/rest-api-hono.test.ts` passes.

### 7. Write task API tests for server-hono.ts

- [x] **RED** — Write `tests/task-api-hono.test.ts`:
  - Import from `@src/server-hono.js`
  - Mock `node-cron` as original does
  - Tests: `GET /api/tasks` → 200 empty array, `GET /api/tasks` with preload → has rows, `POST /api/tasks` → 201, `POST /api/tasks` invalid schedule → 400, `POST /api/tasks` missing fields → 400, `DELETE /api/tasks/:id` → 204 + 404, deleted task absent from GET
  - Run → fails
- [x] **ACTION** — Complete the test file per `specs/rest-api.spec.md` task scenarios.
- [x] **GREEN** — `npm run test:run -- tests/task-api-hono.test.ts` passes.

### 8. Write channel API tests for server-hono.ts

- [x] **RED** — Write `tests/channel-api-hono.test.ts`:
  - Import from `@src/server-hono.js`
  - Mock WhatsApp/Signal adapters with `vi.mock` (same pattern as old test)
  - Tests: `GET /api/channels` → array with `type`, `status`, `connectedAt`, `POST /api/channels/unknown/login` → 404, `POST /api/channels/unknown/logout` → 404
  - Run → fails
- [x] **ACTION** — Complete the test file. Verify mock adapter pattern works with Hono's import resolution.
- [x] **GREEN** — `npm run test:run -- tests/channel-api-hono.test.ts` passes.

### 9. Write WebSocket chat tests for server-hono.ts

- [x] **RED** — Write `tests/ws-chat-hono.test.ts`:
  - Import from `@src/server-hono.js`
  - Helper: `wsConnect(url)` returns `{ ws, messages }` using native `WebSocket`
  - Tests: connect `/ws/chat/main` → receives `connected` with `sessionId`, unknown context → close code 4004, message while busy → error, invalid JSON → error, token auth (optional, loopback bypass)
  - Run → fails
- [x] **ACTION** — Complete the test file per `specs/websocket.spec.md`.
- [x] **GREEN** — `npm run test:run -- tests/ws-chat-hono.test.ts` passes.

---

## Phase 4: Cutover — Flip the Re-Export Shim

### 10. Backup old source files

- [x] **RED** — Assert `src/server-fastify.ts` does not exist and `src/credential-proxy-fastify.ts` does not exist.
- [x] **ACTION** — Copy `src/server.ts` → `src/server-fastify.ts`. Copy `src/credential-proxy.ts` → `src/credential-proxy-fastify.ts`. These are emergency rollback backups.
- [x] **GREEN** — Both backup files exist and compile.

### 11. Flip server.ts to re-export from server-hono.ts

- [x] **RED** — `npm run test:run -- tests/server-hono.test.ts` passes (tests still point directly to `-hono`). `npm run test:run -- tests/server.test.ts` still runs the old test against Fastify (expected to still pass before flip).
- [x] **ACTION** — Replace contents of `src/server.ts` with a single line:
  ```ts
  export { startServer, stopServer, type ServerOptions } from './server-hono.js';
  ```
- [x] **GREEN** — `npm run test:run -- tests/server-hono.test.ts` passes (unchanged — imports directly from `-hono`). `npm run test:run -- tests/resilience-integration.test.ts` passes (imports from `@src/server.js`, now Hono, but only needs `startServer`/`stopServer` signatures). `npm run test:run -- tests/resilience-wiring.test.ts` passes (same). `npm run test:run -- tests/smoke.test.ts` passes (imports `dist/server.js`, re-export compiles fine).

### 12. Flip credential-proxy.ts to re-export from credential-proxy-hono.ts

- [x] **RED** — `npm run test:run -- tests/credential-proxy-hono.test.ts` passes.
- [x] **ACTION** — Replace contents of `src/credential-proxy.ts` with:
  ```ts
  export { startProxy, stopProxy, proxyApp } from './credential-proxy-hono.js';
  ```
- [x] **GREEN** — `npm run test:run -- tests/credential-proxy-hono.test.ts` passes.

### 13. Full test suite after both flips

- [x] **RED** — Run `npm run test:run` → may have failures from old test files still present.
- [x] **ACTION** — Run `npm run test:run` and review failures. The old test files (`tests/server.test.ts`, `tests/rest-api.test.ts`, `tests/ws-chat.test.ts`, `tests/task-api.test.ts`, `tests/channel-api.test.ts`, `tests/credential-proxy.test.ts`) will fail because they use Fastify-specific APIs (`.addresses()`, `.inject()`). These files are deleted in Phase 5.
- [x] **GREEN** — All tests that are NOT old Fastify-coupled tests pass. The known failures are only in the 6 old test files that will be replaced.

---

## Phase 5: Cleanup — Replace Old Tests, Rename Source Files

### 14. Delete old Fastify-coupled test files

- [x] **RED** — Assert these files exist: `tests/server.test.ts`, `tests/rest-api.test.ts`, `tests/ws-chat.test.ts`, `tests/task-api.test.ts`, `tests/channel-api.test.ts`, `tests/credential-proxy.test.ts`.
- [x] **ACTION** — Delete all 6 files.
- [x] **GREEN** — Files are gone. `npm run test:run` passes (only new Hono tests and unaffected existing tests remain).

### 15. Rename new test files to standard names

- [x] **RED** — Assert these files exist: `tests/server-hono.test.ts`, `tests/rest-api-hono.test.ts`, `tests/ws-chat-hono.test.ts`, `tests/task-api-hono.test.ts`, `tests/channel-api-hono.test.ts`, `tests/credential-proxy-hono.test.ts`.
- [x] **ACTION** — Rename each `-hono.test.ts` → `.test.ts`. Update imports inside each renamed file: `from '@src/server-hono.js'` → `from '@src/server.js'`, `from '@src/credential-proxy-hono.js'` → `from '@src/credential-proxy.js'`.
- [x] **GREEN** — `npm run test:run` passes with all renamed tests.

### 16. Rename source files and update re-exports

- [x] **RED** — Assert `src/server-fastify.ts`, `src/credential-proxy-fastify.ts`, `src/server-hono.ts`, `src/credential-proxy-hono.ts` exist.
- [x] **ACTION** —
  1. Rename `src/server-hono.ts` → `src/server.ts` (overwrite the re-export shim)
  2. Rename `src/server-fastify.ts` → `src/_server-fastify.ts` (clearly marked for deletion in Phase 6)
  3. Rename `src/credential-proxy-hono.ts` → `src/credential-proxy.ts` (overwrite the re-export shim)
  4. Rename `src/credential-proxy-fastify.ts` → `src/_credential-proxy-fastify.ts`
- [x] **GREEN** — `npm run build` passes. `npm run test:run` passes.

### 17. Audit for any remaining imports of -hono or -fastify files

- [x] **RED** — `grep -rn "server-fastify\|credential-proxy-fastify\|server-hono\|credential-proxy-hono" src/ tests/` returns matches.
- [x] **ACTION** — Fix any remaining imports or references.
- [x] **GREEN** — `grep` returns empty.

---

## Phase 6: Remove Fastify Dependency

### 18. Remove Fastify packages from package.json

- [x] **RED** — `npm ls fastify` returns results. `npm ls @fastify/websocket` returns results. `npm ls @fastify/static` returns results.
- [x] **ACTION** — Remove `fastify`, `@fastify/websocket`, `@fastify/static` from `dependencies` in `package.json`. Run `npm install`.
- [x] **GREEN** — `npm ls fastify` returns empty. `npm ls @fastify/websocket` returns empty. `npm ls @fastify/static` returns empty. `npm ls hono` shows installed. `npm run build` passes.

### 19. Delete old Fastify source backups

- [x] **RED** — Assert `src/_server-fastify.ts` and `src/_credential-proxy-fastify.ts` exist.
- [x] **ACTION** — Delete both files.
- [x] **GREEN** — `npm run build` passes. `npm run test:run` passes.

### 20. Full verification

- [x] **RED** — No automated assertion.
- [x] **ACTION** —
  1. `npm run build` → zero errors
  2. `npm run test:run` → all tests green
  3. `npm ls fastify` → empty
  4. `grep -rn "fastify" src/` → zero matches
  5. Manual: `npm run dev` or `node dist/index.js`, open `http://localhost:3000/`, verify WebChat loads, WS connects, message flows
- [x] **GREEN** — All checks pass.

---

## Task Count Summary

| Phase | Tasks |
|---|---|
| 1. Add deps | 1 |
| 2. Credential proxy | 2 |
| 3. Main server + tests | 6 |
| 4. Cutover | 4 |
| 5. Cleanup | 4 |
| 6. Remove deps | 3 |
| **Total** | **20** |
