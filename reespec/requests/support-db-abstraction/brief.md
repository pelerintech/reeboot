# Brief — support-db-abstraction

## Problem

The `ExtensionAPI` interface types `ExtensionContext.db` as `any` — deliberately, so extensions are not locked to a specific database library. This was the right call for `sdk-pluggability` (the interface must be SDK-agnostic). But it leaves a real gap: `observability` and `token-meter` both call `db.prepare(...).run(...)` — the `better-sqlite3` synchronous API. A customer support deployment at scale will almost certainly use Postgres (or a managed store), not an embedded SQLite file, because:

- Hundreds of concurrent chats need a concurrent-write-capable store (SQLite serialises writes).
- Support data (session events, rate limits, messages) must be queryable by external dashboards/BI tools.
- Managed deployments prefer a managed DB.

Without a DB abstraction, the support runtime either (a) forces better-sqlite3 and hits write-contention at scale, or (b) leaves `db: any` and extensions break at runtime against a Postgres client that has no `.prepare().run()`.

## Vision

A reeboot-owned minimal `ExtensionDB` interface that captures only what extensions actually use (the `prepare(sql).run/bind/get/all` shape, plus any transaction helpers), with two adapters: the existing `better-sqlite3` adapter (default, unchanged) and a new Postgres adapter. Extensions depend on `ExtensionDB`, not `any` and not `better-sqlite3`'s `Database` type.

```
Extension code:
  db.prepare('INSERT ...').run(...)
       ↓
ExtensionDB interface (reeboot-owned):
  prepare(sql): Statement  // .run(), .get(), .all()
       ↓
  ┌──────────────┐         ┌──────────────┐
  │ SqliteAdapter│         │ PostgresAdapter│
  │ (better-sqlite3) │     │ (pg pool)      │
  └──────────────┘         └──────────────┘
```

## Goals

- Define `ExtensionDB` and `ExtensionStatement` interfaces in `extension-api.ts`, capturing only the methods extensions actually call (audit all 17 extensions + the support subset).
- `ExtensionContext.db` is typed `ExtensionDB | undefined` (not `any`).
- The existing `better-sqlite3` singleton (`getDb()`) is wrapped in a `SqliteAdapter` that implements `ExtensionDB` — zero behaviour change for current deployments.
- A `PostgresAdapter` implements `ExtensionDB` over a `pg` connection pool, translating the synchronous-style calls to the async Postgres API (extensions stay sync-shaped; the adapter bridges internally, or we accept that extensions must become async — see open question).
- The support runtime can be configured to use either adapter via config.

## Non-Goals

- Not introducing an ORM or migration framework.
- Not changing the schema (existing tables/migrations stay).
- Not making all extensions async (unless the design forces it — see open question).
- Not building admin/query tooling for the DB.

## Open question (resolve in discovery)

The `better-sqlite3` API is **synchronous**; Postgres is **asynchronous**. `db.prepare(...).run(...)` returns immediately in SQLite but must `await` in Postgres. Two options:
- **(a) Sync-over-async bridge** — the `PostgresAdapter` uses `deasync` or a worker to present a sync API. Keeps extensions unchanged but is fragile and blocks the event loop (bad for hundreds of concurrent chats).
- **(b) Make `ExtensionDB` async** — `prepare().run()` returns a `Promise`. Extensions become async at their DB call sites. Cleaner and correct for concurrency, but touches every extension that writes to the DB (observability, token-meter, memory-manager, knowledge-manager).

This is the core design decision and must be resolved before planning. The recommendation is **(b)** — async is correct for a multi-chat runtime, and the extension changes are mechanical (add `await` at DB call sites). But it has cross-cutting impact and deserves a discovery pass.

## What should be done first

1. **Audit DB usage** — grep every `db.prepare` / `db.exec` / `db.transaction` call across `src/extensions/` and `src/` to define the exact `ExtensionDB` surface (don't guess).
2. **Resolve the sync/async question** (above) via discovery.
3. **Define `ExtensionDB` + `ExtensionStatement`** in `extension-api.ts`.
4. **Wrap `getDb()` in `SqliteAdapter`** and retype `ExtensionContext.db` — prove existing deployments are unchanged.
5. **Build `PostgresAdapter`** and wire it into the support runtime via config.

## Scope

- Modified: `src/extensions/extension-api.ts` — `ExtensionDB`, `ExtensionStatement`, retype `db`.
- New: `src/db/sqlite-adapter.ts` — wraps `better-sqlite3`.
- New: `src/db/postgres-adapter.ts` — implements `ExtensionDB` over `pg`.
- Modified: extensions that call `db` (add `await` if option (b) is chosen).
- Tests: adapter conformance suite (both adapters pass the same tests), support-runtime config selects the adapter.

## Impact

- Extensions are no longer coupled to `better-sqlite3` at the type level.
- Support deployments can use Postgres (or any future adapter) without touching extension code.
- The `db: any` escape hatch is replaced with a real, documented contract.
- The sync/async question is resolved deliberately, not discovered at runtime under load.
