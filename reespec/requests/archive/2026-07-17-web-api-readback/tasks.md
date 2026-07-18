# Tasks — web-api-readback

> **Executor notes — read first.**
> - All backend paths are relative to `reeboot/`. All SPA paths are relative to `reeboot/webchat/`.
> - **Backend tests**: run from `reeboot/` with `npx vitest run <file>`. Tests import server code via
>   the `@src/` alias (e.g. `@src/server.js`) — copy the setup from `tests/rest-api.test.ts`.
> - **SPA tests**: run from `reeboot/webchat/` with `npx vitest run <file>` (jsdom + `src/test-setup.ts`
>   are already configured in `webchat/vitest.config.ts`).
> - **Foreign keys are ON** (`db.pragma('foreign_keys = ON')`), so you must insert a `contexts` row
>   before inserting into `messages`. The `main` context is auto-created by `startServer`.
> - Do the tasks **in order**. One test → one implementation → re-run. Do not batch.
> - Pino level numbers: `debug=20, info=30, warn=40, error=50, fatal=60`.

---

## 1. GET /api/contexts/:id/messages returns persisted conversation history

Implements spec `conversation-history-api` (S1–S5).

- [x] **RED** — Create `tests/web-readback-api.test.ts`. Use the exact harness from
      `tests/rest-api.test.ts` (`beforeEach`/`afterEach`, `startTestServer()` with `{ port:0,
      logLevel:'silent', db, reebotDir: tmpDir }`). Add a helper to seed messages:
      ```ts
      function insertMessage(role: string, content: string, contextId = 'main') {
        db.prepare(
          `INSERT INTO messages (id, context_id, channel, peer_id, role, content)
           VALUES (?, ?, 'web', 'p1', ?, ?)`
        ).run(`m-${Math.random().toString(36).slice(2)}`, contextId, role, content);
      }
      ```
      Write these tests (context `main` exists after `startTestServer()`):
      - S1: seed user "hello", assistant "hi", user "bye"; `GET /api/contexts/main/messages` → 200,
        body length 3, order `['hello','hi','bye']` by `content`, each item has `role/content/created_at`.
      - S2: no seed; `GET /api/contexts/main/messages` → 200, body `[]`.
      - S3: `GET /api/contexts/does-not-exist/messages` → 404, body `{error:'Context not found'}`.
      - S4: seed m1..m5; `GET /api/contexts/main/messages?limit=2` → length 2, contents `['m4','m5']`.
      - S5: `db.prepare("INSERT INTO contexts (id,name) VALUES ('work','Work')").run()`, seed one
        message in `work` and one in `main`; `GET /api/contexts/main/messages` → every row's context is
        main (assert none has content from the `work` row).
      Run `npx vitest run tests/web-readback-api.test.ts` → **fails** (route returns 404 / not found).
- [x] **ACTION** — In `src/server.ts`, add a route immediately after the
      `app.get('/api/contexts/:id/sessions', ...)` block (around line 556):
      ```ts
      app.get('/api/contexts/:id/messages', (c) => {
        const id = c.req.param('id');
        const ctx = getContextById(db, id);
        if (!ctx) return c.json({ error: 'Context not found' }, 404);
        const raw = Number(c.req.query('limit') ?? '200');
        const limit = Math.max(1, Math.min(1000, Number.isFinite(raw) ? raw : 200));
        const rows = db.prepare(
          `SELECT role, content, created_at FROM (
             SELECT rowid, role, content, created_at FROM messages
             WHERE context_id = ? ORDER BY rowid DESC LIMIT ?
           ) ORDER BY rowid ASC`
        ).all(id, limit);
        return c.json(rows);
      });
      ```
      (`getContextById` is already imported in `server.ts` — it is used by the sessions route.)
- [x] **GREEN** — `npx vitest run tests/web-readback-api.test.ts` → all messages tests **pass**.

---

## 2. GET /api/logs returns persisted log history in LogRecord shape

Implements spec `logs-history-api` (S1–S5).

- [x] **RED** — In `tests/web-readback-api.test.ts` add a `describe('GET /api/logs', ...)`. Seed helper:
      ```ts
      function insertLog(level: number, msg: string, component: string | null = null) {
        db.prepare(
          `INSERT INTO operational_logs (level, msg, component) VALUES (?, ?, ?)`
        ).run(level, msg, component);
      }
      ```
      (The `operational_logs` table exists after `startServer` runs its migrations.) Tests:
      - S1: `insertLog(40,'disk slow','scheduler')`; `GET /api/logs?level=info` → 200, contains
        `{ timestamp: <string>, level:'warn', component:'scheduler', message:'disk slow' }`.
      - S2: `insertLog(30,'i')` and `insertLog(50,'e')`; `GET /api/logs?level=error` → only the level-50
        row (message `'e'`), length 1.
      - S3: `insertLog(30,'first')` then `insertLog(40,'second')`; `GET /api/logs` (no level) → length 2,
        `message` order `['first','second']`, levels `['info','warn']`.
      - S4: insert 5 rows at level 30; `GET /api/logs?limit=2` → length 2, the most recent two, ascending.
      - S5: no seed; `GET /api/logs` → 200, `[]`.
      Run `npx vitest run tests/web-readback-api.test.ts` → the `/api/logs` tests **fail** (404).
- [x] **ACTION** — In `src/server.ts`:
      1. Add a helper near the existing `_pinoLevelToNumber`:
         ```ts
         function _pinoNumberToLevel(n: number): string {
           if (n >= 60) return 'fatal';
           if (n >= 50) return 'error';
           if (n >= 40) return 'warn';
           if (n >= 30) return 'info';
           return 'debug';
         }
         ```
      2. Add the route just after `GET /api/logs/stream` (around line 367):
         ```ts
         app.get('/api/logs', (c) => {
           const levelNum = _pinoLevelToNumber(c.req.query('level') ?? 'info');
           const raw = Number(c.req.query('limit') ?? '200');
           const limit = Math.max(1, Math.min(1000, Number.isFinite(raw) ? raw : 200));
           const rows = db.prepare(
             `SELECT level, msg, component, created_at FROM (
                SELECT id, level, msg, component, created_at FROM operational_logs
                WHERE level >= ? ORDER BY id DESC LIMIT ?
              ) ORDER BY id ASC`
           ).all(levelNum, limit) as Array<{ level: number; msg: string; component: string | null; created_at: string }>;
           return c.json(rows.map((r) => ({
             timestamp: r.created_at,
             level: _pinoNumberToLevel(r.level),
             component: r.component ?? undefined,
             message: r.msg,
           })));
         });
         ```
- [x] **GREEN** — `npx vitest run tests/web-readback-api.test.ts` → all `/api/logs` tests **pass**.

---

## 3. DB log stream persists info-level (30+) logs

Implements spec `info-log-persistence` (S1–S3).

- [x] **RED** — Create `tests/observability/info-log-persistence.test.ts`:
      ```ts
      import { describe, it, expect, beforeEach, afterEach } from 'vitest';
      import Database from 'better-sqlite3';
      import { runObservabilityMigration } from '@src/db/schema.js';
      import { initLogger, getLogger } from '@src/observability/logger.js';

      let db: Database.Database;
      beforeEach(() => { db = new Database(':memory:'); runObservabilityMigration(db); });
      afterEach(() => { try { db.close(); } catch {} });
      const flush = () => new Promise((r) => setTimeout(r, 50));
      const rowFor = (msg: string) =>
        db.prepare('SELECT level, msg FROM operational_logs WHERE msg = ?').get(msg) as any;

      describe('info-log-persistence', () => {
        it('persists info logs (S1)', async () => {
          initLogger({ level: 'info' }, db);
          getLogger().info({ component: 'test' }, 'hello info');
          await flush();
          const row = rowFor('hello info');
          expect(row).toBeTruthy();
          expect(row.level).toBe(30);
        });
        it('does NOT persist debug logs (S2)', async () => {
          initLogger({ level: 'debug' }, db);
          getLogger().debug('noisy debug');
          await flush();
          expect(rowFor('noisy debug')).toBeUndefined();
        });
        it('still persists warn+ (S3 regression)', async () => {
          initLogger({ level: 'info' }, db);
          getLogger().warn('careful');
          await flush();
          const row = rowFor('careful');
          expect(row).toBeTruthy();
          expect(row.level).toBe(40);
        });
      });
      ```
      Run `npx vitest run tests/observability/info-log-persistence.test.ts` → S1 **fails** (info row
      absent, because the DB stream currently drops `level < 40`).
- [x] **ACTION** — In `src/observability/logger.ts` make two edits:
      1. In `createDbStream`, change `if (level < 40) continue;` → `if (level < 30) continue;`.
      2. In `createLogger`, change the DB stream entry
         `streams.push({ stream: createDbStream(db), level: 'warn' });` →
         `streams.push({ stream: createDbStream(db), level: 'info' });`.
      Leave the file stream at `level: 'warn'` and stdout/SSE unchanged.
- [x] **GREEN** — `npx vitest run tests/observability/info-log-persistence.test.ts` → all 3 **pass**.
      Then run the observability suite to confirm no regression:
      `npx vitest run tests/observability/` → **passes**.

---

## 4. Chat page hydrates transcript from history on mount

Implements spec `conversation-history-ui` (S1–S4).

- [x] **RED** — Create `webchat/src/pages/__tests__/Chat.test.tsx`. Stub `fetch` and `WebSocket`
      (copy the `MockWebSocket` block from `webchat/src/hooks/__tests__/useWebSocket.test.ts`):
      ```tsx
      import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
      import { render, screen, waitFor } from '@testing-library/react';
      import Chat from '../Chat';
      // ---- MockWebSocket: paste the exact block from useWebSocket.test.ts ----
      // (assign to globalThis.WebSocket in beforeEach, delete in afterEach)

      function mockFetchReturning(rows: any[]) {
        return vi.fn().mockResolvedValue({ ok: true, json: async () => rows } as any);
      }
      beforeEach(() => { /* set globalThis.WebSocket = MockWebSocket */ });
      afterEach(() => { vi.restoreAllMocks(); /* delete globalThis.WebSocket */ });

      describe('Chat history hydration', () => {
        it('fetches history on mount and renders it (S1)', async () => {
          const fetchMock = mockFetchReturning([
            { role:'user', content:'hello', created_at:'2026-07-17 10:00:00' },
            { role:'assistant', content:'hi there', created_at:'2026-07-17 10:00:01' },
          ]);
          globalThis.fetch = fetchMock as any;
          render(<Chat />);
          await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
          expect(screen.getByText('hi there')).toBeInTheDocument();
          expect(fetchMock).toHaveBeenCalledWith('/api/contexts/main/messages');
        });
        it('re-hydrates on remount (S2)', async () => {
          globalThis.fetch = mockFetchReturning([
            { role:'user', content:'earlier question', created_at:'2026-07-17 09:00:00' },
          ]) as any;
          const { unmount } = render(<Chat />);
          await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
          unmount();
          render(<Chat />);
          await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
        });
        it('renders empty state when history is empty (S3)', async () => {
          globalThis.fetch = mockFetchReturning([]) as any;
          render(<Chat />);
          await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());
        });
        it('fetches history once, not on WS reconnect (S4)', async () => {
          const fetchMock = mockFetchReturning([{ role:'user', content:'x', created_at:'2026-07-17 09:00:00' }]);
          globalThis.fetch = fetchMock as any;
          render(<Chat />);
          await waitFor(() => expect(screen.getByText('x')).toBeInTheDocument());
          // simulate a reconnect: close the current socket instance (triggers onclose→reconnect)
          // then assert the messages endpoint was still only called once
          expect(fetchMock.mock.calls.filter(c => c[0] === '/api/contexts/main/messages').length).toBe(1);
        });
      });
      ```
      Run from `reeboot/webchat/`: `npx vitest run src/pages/__tests__/Chat.test.tsx` → S1/S2 **fail**
      (no fetch happens; transcript starts empty).
- [x] **ACTION** — In `webchat/src/pages/Chat.tsx` add a mount-only hydration effect (after the existing
      focus effect near line 44):
      ```tsx
      useEffect(() => {
        let cancelled = false;
        fetch('/api/contexts/main/messages')
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: Array<{ role: string; content: string; created_at: string }>) => {
            if (cancelled) return;
            setMessages(rows.map((row, i) => ({
              id: `hist-${i}`,
              role: (row.role === 'user' || row.role === 'assistant' || row.role === 'error')
                ? row.role : 'assistant',
              content: row.content,
              timestamp: Date.parse(row.created_at) || Date.now(),
            })));
          })
          .catch(() => { /* leave transcript empty on error */ });
        return () => { cancelled = true; };
      }, []); // mount only — do NOT depend on WS status (avoids refetch on reconnect)
      ```
- [x] **GREEN** — `npx vitest run src/pages/__tests__/Chat.test.tsx` → all 4 **pass**.

---

## 5. Logs page seeds history on mount and on level change

Implements spec `logs-history-ui` (S1–S3).

- [x] **RED** — Create `webchat/src/pages/__tests__/Logs.test.tsx`. Stub `fetch` and provide a minimal
      `EventSource` mock (jsdom has none):
      ```tsx
      import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
      import { render, screen, waitFor, fireEvent } from '@testing-library/react';
      import Logs from '../Logs';

      class MockEventSource { url: string; onopen: any; onmessage: any; onerror: any;
        constructor(url: string){ this.url = url; } close(){} }

      beforeEach(() => { (globalThis as any).EventSource = MockEventSource as any; });
      afterEach(() => { vi.restoreAllMocks(); delete (globalThis as any).EventSource; });

      describe('Logs history seeding', () => {
        it('seeds history on mount (S1)', async () => {
          const fetchMock = vi.fn().mockResolvedValue({ ok:true, json: async () => ([
            { timestamp:'2026-07-17 09:00:00', level:'info', component:'server', message:'started' },
          ])});
          globalThis.fetch = fetchMock as any;
          render(<Logs />);
          await waitFor(() => expect(screen.getByText('started')).toBeInTheDocument());
          expect(fetchMock).toHaveBeenCalledWith('/api/logs?level=info');
        });
        it('refetches when level filter changes (S2)', async () => {
          const fetchMock = vi.fn().mockResolvedValue({ ok:true, json: async () => [] });
          globalThis.fetch = fetchMock as any;
          render(<Logs />);
          await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/logs?level=info'));
          fireEvent.change(screen.getByRole('combobox'), { target: { value: 'error' } });
          await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/logs?level=error'));
        });
      });
      ```
      (S3 — live SSE append — is covered by the existing live behavior; assert seed coexists with a
      manually dispatched `onmessage` record if you extend the mock. Optional if time-boxed.)
      Run from `reeboot/webchat/`: `npx vitest run src/pages/__tests__/Logs.test.tsx` → **fails**
      (page shows "Waiting for logs…"; no fetch of `/api/logs`).
- [x] **ACTION** — In `webchat/src/pages/Logs.tsx`, inside the existing `useEffect` keyed on
      `[filterLevel, paused, onIncrementErrorBadge]` (line 33), **before** `connect()` is called, seed
      history for the current level:
      ```tsx
      fetch(`/api/logs?level=${filterLevel}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: LogRecord[]) => { if (!closed) setLogs(rows); })
        .catch(() => { /* ignore */ });
      ```
      Place it right after `setFailed(false);` at the top of the effect body (the effect already
      re-runs when `filterLevel` changes, satisfying S2). Keep the live `EventSource` wiring intact so
      new records still append (S3).
- [x] **GREEN** — `npx vitest run src/pages/__tests__/Logs.test.tsx` → tests **pass**.

---

## 6. Full build + suite integration gate

Confirms nothing regressed and the new code type-checks in both packages.

- [x] **RED** — Before wiring is complete, run `npm run check` from `reeboot/` (this is
      `tsc && vitest run`). Assertion: it currently **fails or lacks** the new endpoints/tests
      (baseline — the new test files were added and must be green together). If everything from tasks
      1–5 is already green individually, this step verifies they pass together.
- [x] **ACTION** — Fix any type errors or cross-test interference surfaced (e.g. the `initLogger`
      singleton in task 3 leaking into other tests — if so, ensure `tests/observability/info-log-persistence.test.ts`
      re-initialises the logger in `beforeEach` and does not rely on global order).
- [x] **GREEN** — From `reeboot/`: `npm run check` → build + backend suite **pass**. From
      `reeboot/webchat/`: `npx vitest run` → SPA suite **passes** (existing 33 tests + the new Chat/Logs
      tests). Both green = request complete.
