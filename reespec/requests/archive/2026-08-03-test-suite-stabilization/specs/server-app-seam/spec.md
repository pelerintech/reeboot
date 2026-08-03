# Spec — server-app-seam

`server.ts` exposes its Hono app independent of socket binding so every route and WebSocket handler is testable without a real socket.

## GIVEN/WHEN/THEN

### buildApp is socket-free and returns the real app
- GIVEN a caller invokes `buildApp({ db, reebotDir, ... })`
- WHEN no `listen` call is made and no server is created
- THEN it resolves to the same Hono app with all production routes registered (health, status, channels, contexts, sessions, messages, budget settings/logs, tasks, events, logs, reload/restart, a2a, webhook, webchat static), and a caller can drive any route with `app.request('/api/...', { method, body, headers })` and observe the real handler behavior (status, JSON/streamed body, DB writes).

### Route behavior is verified against the injected db
- GIVEN a test calls `app.request()` against a `buildApp` instance backed by an injected in-memory/temp DB with migrations applied
- WHEN the request mutates state (e.g. `POST /api/tasks`, `POST /api/contexts`, budget settings)
- THEN the persisted effect is observable via a follow-up `GET` on the same app (and/or a direct read of the injected db), including error statuses (400/404) for unknown inputs.

### WebSocket handlers are drivable at both ends
- GIVEN the real WS handler (onConnect/onMessage/onClose and message parsing/routing) is exercised directly with fixture handshake/message payloads
- WHEN a valid message arrives
- THEN the expected response/event is emitted; and the client-side consumer logic, given that response, performs the expected action — both without a real TCP/browser socket.

### listen path is preserved for production
- GIVEN `startServer(opts)` is called
- WHEN it completes
- THEN it still creates a server, injects WebSocket upgrade, and binds `port` (same behavior as before the seam; unchanged production surface).
