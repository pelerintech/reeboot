# Request Hono Migration — Brief

## What

Replace Fastify with Hono as the web server framework for reeboot's HTTP interface (main server on port 3000) and credential proxy (port 3001). This includes all routing, WebSocket upgrade handling, static file serving, and request logging currently handled by Fastify and its plugins.

New dependencies: `hono`, `@hono/node-server`, `@hono/node-ws`, `hono-pino` (or equivalent pino logger for Hono).
Removed dependencies: `fastify`, `@fastify/websocket`, `@fastify/static`.

## Why

1. **CVE mitigation** — Fastify and its plugin ecosystem have disclosed security advisories. Dropping the dependency removes the attack surface entirely.
2. **Lightweight foundation** — Hono is smaller and faster to start. For a single-user agent this matters more than Fastify's multi-core/enterprise optimisations which never materialise.
3. **Future portability** — Hono is built on Web Standards (`Request`/`Response`). This opens the door to running on Bun or Deno in the future without a framework rewrite.
4. **Simpler mental model** — Hono's middleware-based routing is closer to Express/Koa patterns and reduces the conceptual overhead of Fastify's plugin/register lifecycle.

## Goals

- [ ] Main server (`server.ts`) runs on Hono with identical route behaviour
- [ ] WebSocket `/ws/chat/:contextId` works via `@hono/node-ws`
- [ ] Static file serving for `webchat/` works (use `hono/serve-static` or `@hono/node-server/serve-static`)
- [ ] Credential proxy (`credential-proxy.ts`) runs on Hono
- [ ] Request logging uses pino (retained dependency) via Hono middleware
- [ ] All existing tests pass or are updated/removed where the interface changed
- [ ] No behavioural regression in the CLI (`reeboot start`, `reeboot status`, etc.)

## Non-Goals

- [ ] Change the WebSocket protocol between client and server — message types stay identical
- [ ] Change the REST API contract (status codes, response shapes, routes)
- [ ] Replace `ws` library — it stays for `@hono/node-ws`
- [ ] Add new routes or new server features — pure port, no expansion
- [ ] Bun/Deno runtime support in this request — that is a future phase unlocked by this work

## Impact

| Surface | Change |
|---|---|
| `reeboot/src/server.ts` | Complete rewrite of server scaffolding (routes stay conceptually same) |
| `reeboot/src/credential-proxy.ts` | Complete rewrite on Hono |
| `reeboot/package.json` | Remove fastify + plugins; add hono + node-server + node-ws |
| `reeboot/tests/server.test.ts` | Update `server.addresses()` → `server.address()` etc. |
| `reeboot/tests/rest-api.test.ts` | Same |
| `reeboot/tests/ws-chat.test.ts` | Same + verify WS still upgrades |
| `reeboot/tests/task-api.test.ts` | Same |
| `reeboot/tests/channel-api.test.ts` | Same |
| `reeboot/tests/credential-proxy.test.ts` | Rewrite `.inject()` → direct handler testing or real HTTP |
| `reeboot/tests/*` (other) | May need `vi.resetModules()` updates if imports change |
| `reeboot/src/index.ts` | No changes — calls `startServer()` same as before |
| `reeboot/src/wizard/steps/launch.ts` | No changes — calls `startServer()` same as before |

## Success Criteria

- `npm run build` succeeds with zero TypeScript errors
- `npm run test:run` passes (all existing + updated tests green)
- `reeboot start` serves the webchat at the configured port
- WS chat connects and streams messages correctly
- Credential proxy intercepts LLM API calls when enabled
- No fastify-related packages in `node_modules` after `npm install`
