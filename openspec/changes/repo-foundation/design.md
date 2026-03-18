## Context

This is the first change in the `reeboot` project. There is no existing code. We are establishing the repository from scratch: build tooling, package shape, config loading, database schema, HTTP server skeleton, and the CLI entry point with the interactive setup wizard.

All subsequent changes depend on these foundations being stable and tested. The design choices made here (ESM, Drizzle, Fastify, Commander) establish the conventions every later change will follow.

## Goals / Non-Goals

**Goals:**
- Publishable npm package skeleton with correct `bin`, `exports`, and `main` fields
- TypeScript strict mode, ESM, Node ≥ 22 — no CommonJS
- Typed, validated config system with sensible defaults
- SQLite database with Drizzle schema covering all Phase 1 tables
- Fastify HTTP server with `/api/health` and `/api/status` endpoints
- Commander CLI with all sub-commands registered (even if they are stubs)
- Interactive setup wizard (Inquirer) that writes `~/.reeboot/config.json` and scaffolds directories
- TDD from the start — every module has a vitest unit test suite; integration tests for config + DB

**Non-Goals:**
- Agent runner (Week 2)
- WebSocket / WebChat (Week 2)
- Channel adapters (Week 3+)
- Scheduler (Week 4)

## Decisions

### ESM-only, TypeScript strict, Node ≥ 22
All modern dependencies (`baileys`, `inquirer@12`, `nanoid`) are ESM-only. Starting ESM from day one avoids dual-module complexity. `"type": "module"` in `package.json`. `tsconfig.json` targets `ES2022` with `module: NodeNext`. `tsx` for dev execution; `tsc` for build output to `dist/`.

### Drizzle ORM over raw SQL or Prisma
Better-sqlite3 is the fastest synchronous SQLite driver for Node.js. Drizzle ORM is lightweight, generates typed queries from a TypeScript schema, and emits plain SQL migrations — no binary, no ORM magic. Prisma would add heavyweight binary generation that is overkill for a local single-user SQLite store.

### Fastify over Express/Hono
Fastify is the established choice from the plan (matches architecture doc). It has first-class TypeScript types, plugin ecosystem (`@fastify/websocket`, `@fastify/static`), and good performance. WebSocket support in Week 2 via `@fastify/websocket`.

### Commander over Yargs/Meow
Commander is the simplest, most widely understood CLI framework. All sub-commands are declared with `.command()` and lazy-loaded action handlers to keep startup fast.

### Config at `~/.reeboot/config.json`
Machine-scoped, not project-scoped. `reeboot` is a personal agent, not a per-repo tool. Config is read on startup and re-read on `reeboot reload`. Schema validated with a lightweight Zod schema (no heavy JSON Schema setup). Defaults applied at load time. Environment variables can override specific fields (`REEBOOT_PORT`, `REEBOOT_LOG_LEVEL`) for CI/scripting.

### Inquirer@12 for wizard
Inquirer v12 is ESM-compatible and provides all needed prompt types (list, input, password, checkbox for channel selection, confirm). The wizard writes `~/.reeboot/config.json` and scaffolds the full directory tree on first run.

### TDD: red → green
Every module gets a `*.test.ts` alongside it. Tests run with `vitest`. Implementation only after the test is written and failing. Config loading, DB schema, and server endpoints all have integration tests using temp directories / in-memory SQLite.

## Risks / Trade-offs

- **Drizzle migration strategy for SQLite**: `drizzle-kit push` is used for development (no migration files needed for local SQLite). If the schema changes in later changes, a migration will be generated. → Mitigation: document the `drizzle-kit push` command in the architecture-decisions after this change; add a note in tasks.md.
- **ESM + `tsx` dev experience**: Some older dev tooling doesn't handle ESM well. → Mitigation: all scripts in `package.json` use `tsx` which handles this transparently.
- **`better-sqlite3` native binary**: Requires node-gyp / pre-built binaries on install. → Mitigation: `better-sqlite3` ships pre-built binaries for Node 22 on macOS and Linux via `@mapbox/node-pre-gyp`. This is well-established.
- **Inquirer v12 ESM-only**: If reeboot is ever imported in a CJS context it would break. → This is intentional; reeboot is ESM-only.

## Open Questions

- Should `reeboot doctor` in this change be fully implemented or just a stub? → **Decision**: Stub only — outputs "doctor: not yet implemented". Full implementation is Week 4.
- Should `config.extensions` be validated strictly or pass-through? → **Decision**: Validated with Zod, but unknown extension keys are stripped (not rejected) to avoid breaking config on future additions.
