# Request Hono Migration — Design

## Decisions

### 1. Hono replaces both Fastify instances

Both the main HTTP server (port 3000, `server.ts`) and the credential proxy (port 3001, `credential-proxy.ts`) are rewritten on Hono. This fully removes the Fastify dependency and its CVE surface.

**Rejected:** Migrating only the main server and keeping Fastify for the proxy — would leave the CVE surface partially exposed and require maintaining two framework patterns.

### 2. WebSocket via `@hono/node-ws`

The `/ws/chat/:contextId` route uses `upgradeWebSocket` from `@hono/node-ws`. The WS handler receives a Hono `Context` which provides param extraction, header access, and raw Node request via `c.env.incoming` for `remoteAddress`.

```
Before (Fastify):
  server.get('/ws/chat/:contextId', { websocket: true }, (socket, req) => { ... })

After (Hono):
  app.get('/ws/chat/:contextId', upgradeWebSocket((c) => ({
    onOpen(event, ws) { ... },
    onMessage(event, ws) { ... use c.req.param('contextId'), c.env.incoming.socket.remoteAddress ... }
  })))
```

**Rejected:** Raw `ws` with manual upgrade — more boilerplate, no Hono routing integration. Raw ws stays as a transitive dependency of `@hono/node-ws`.

### 3. Static files via `@hono/node-server/serve-static`

WebChat static files are served with `serveStatic` from `@hono/node-server`. Root path `/` maps to `webchat/` directory.

**Note:** Two CVEs exist against `@hono/node-server/serve-static` (CVE-2026-29087, CVE-2026-39406 — path traversal via URL decoding). Impact here is **negligible**: the server binds to loopback only and serves a single-user local agent's static files. Still, we use the latest patched version.

**Rejected:** `hono/serve-static` (bun-only) — we run on Node. Manual `readFileSync` route handlers — too much boilerplate.

### 4. Pino retained but not wired to HTTP logging

`pino` and `pino-pretty` stay in `dependencies` for potential future structured logging use. Hono's built-in `logger()` middleware or no request logging is used instead of pino HTTP logging. The current Fastify pino config was dev-only noise.

**Rejected:** `hono-pino` (third-party, v0.4.0, very new) — unnecessary dependency for simple request logging we don't need.

### 5. `startServer` returns `{ port, host }`, not a server object

Tests need the actual bound port (especially with `port: 0`). Instead of returning a server object with `.address()`, `startServer` resolves to a plain object:

```ts
{ port: number; host: string }
```

All 6 test files are updated from `server.addresses()[0]` to `server.port` / `server.host`.

**Rejected:** Returning the raw `node:http.Server` — callers might call `.close()` bypassing our lifecycle logic. Returning a wrapper object — unnecessary abstraction when a plain object suffices.

### 6. Credential proxy tests use Hono's `.fetch()` directly

`credential-proxy.ts` exports its Hono app alongside the `startProxy` function. Tests call `app.fetch(new Request(...))` — Hono's native test helper, no `inject()` equivalent needed. This is cleaner than `server.inject()` and works in any JS environment.

**Rejected:** Starting a real proxy server in tests on port 0 — slower, port race conditions. Using `node:http` with `fetch()` mock — reintroduces fetch mocking complexity we just escaped.

### 7. Internal singletons unchanged

`_activeRunners`, `_channelAdapters`, `_orchestrator`, `_scheduler`, `_credProxy` remain as module-level singletons in `server.ts`. The lifecycle methods (`startServer`, `stopServer`) manage them the same way — only the framework plumbing changes.

## Architecture (After)

```
┌─────────────────────────────────────────────────────────────┐
│                    Hono Main App (server.ts)                │
│  ┌─────────────┐  ┌─────────────────────┐  ┌─────────────┐ │
│  │   Routes    │  │ @hono/node-ws       │  │  serveStatic│ │
│  │  REST API   │  │  /ws/chat/:ctxId    │  │  (webchat/) │ │
│  │  (channels, │  │                     │  │             │ │
│  │   tasks,    │  │                     │  │             │ │
│  │   contexts) │  │                     │  │             │ │
│  └─────────────┘  └─────────────────────┘  └─────────────┘ │
│                                                             │
│  createServer({ fetch: app.fetch })                         │
│  injectWebSocket(server)                                    │
│  server.listen(port, host)                                  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│           Hono Proxy App (credential-proxy.ts)              │
│  Port: 3001 — `/*` route forwards to LLM providers         │
│  createServer({ fetch: proxyApp.fetch })                    │
└─────────────────────────────────────────────────────────────┘
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@hono/node-ws` API instability | Low | Medium | Package is at v1.3.0, well-used. If API changes, we pin version. |
| WS auth logic incorrect (remoteAddress, token extraction) | Medium | High | Port carefully, test auth paths explicitly in ws-chat.test.ts |
| serveStatic CVE regression | Low | Low | Always use latest `@hono/node-server`. Acceptable risk for loopback-only server. |
| Test flakiness from port 0 + race conditions | Medium | Low | Tests already use port 0 successfully; Hono path is the same. |
| TypeScript compilation issues with Hono types | Low | Medium | Hono has excellent TS support. Build step catches issues. |

## Assumptions

- Hono v4.x and `@hono/node-server` v1.x are current at time of implementation.
- `@hono/node-ws` v1.x is compatible with `@hono/node-server` v1.x.
- WebSocket message types (`connected`, `message`, `cancel`, `error`, etc.) remain unchanged.
- REST API contract (routes, status codes, response shapes) remains unchanged.
