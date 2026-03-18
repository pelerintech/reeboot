## 1. Repository Scaffold

- [x] 1.1 Write failing test: package.json has `bin.reeboot`, `type: "module"`, `exports` fields (TDD red)
- [x] 1.2 Create `package.json` with all required fields, `bin`, `exports`, and dependency list
- [x] 1.3 Create `tsconfig.json` targeting ES2022, `module: NodeNext`, strict mode
- [x] 1.4 Create `.gitignore`, `README.md` stub, `vitest.config.ts`
- [x] 1.5 Verify package scaffold test passes (TDD green)

## 2. Config System

- [x] 2.1 Write failing tests for `loadConfig()`: missing file returns defaults, valid file parses, invalid JSON throws, schema violation throws, env var override works (TDD red)
- [x] 2.2 Implement `src/config.ts` with Zod schema, `loadConfig()`, `saveConfig()`, env var overrides
- [x] 2.3 Verify all config tests pass (TDD green)

## 3. Database

- [x] 3.1 Write failing tests for `openDatabase()`: creates file, all 5 tables present, singleton, FK constraint, `closeDb()` (TDD red)
- [x] 3.2 Implement `src/db/schema.ts` — Drizzle table definitions for all 5 tables
- [x] 3.3 Implement `src/db/index.ts` — `openDatabase()`, `getDb()`, `closeDb()` singleton
- [x] 3.4 Verify all database tests pass (TDD green)

## 4. HTTP Server

- [x] 4.1 Write failing tests for Fastify server: starts on port, `/api/health` shape, `/api/status` shape, 404 JSON, stop gracefully (TDD red)
- [x] 4.2 Implement `src/server.ts` — Fastify instance, register routes, `startServer()`, `stopServer()`
- [x] 4.3 Implement `GET /api/health` returning `{ status, uptime, version }`
- [x] 4.4 Implement `GET /api/status` returning stub `{ agent, channels }`
- [x] 4.5 Configure pino logger (JSON in production, pretty in development)
- [x] 4.6 Register custom 404 handler returning `{ error: "Not found" }`
- [x] 4.7 Verify all HTTP server tests pass (TDD green)

## 5. CLI Entry Point

- [x] 5.1 Write failing tests for CLI: `--help` exits 0, unknown command exits non-zero, no-config triggers wizard path (TDD red)
- [x] 5.2 Implement `src/index.ts` — Commander setup, register all sub-commands
- [x] 5.3 Wire `reeboot start` to check for config, launch wizard if missing, else start server
- [x] 5.4 Wire `reeboot status` to call server `/api/status` and print result
- [x] 5.5 Add stub handlers for: `doctor`, `reload`, `restart`, `install`, `uninstall`, `packages list`, `channels *`, `contexts *`, `sessions list`
- [x] 5.6 Verify CLI tests pass (TDD green)

## 6. Setup Wizard

- [x] 6.1 Write failing tests for wizard: non-interactive mode writes config, scaffolds directories, templates copied, existing AGENTS.md not overwritten (TDD red)
- [x] 6.2 Implement `src/setup-wizard.ts` — Inquirer prompts for provider, API key, model, channels, name
- [x] 6.3 Implement non-interactive mode (`--no-interactive` + flags)
- [x] 6.4 Implement directory scaffolding: create all `~/.reeboot/` subdirectories
- [x] 6.5 Implement AGENTS.md template scaffolding from `templates/`
- [x] 6.6 Add confirm-overwrite prompt for interactive re-run when config exists
- [x] 6.7 Verify all wizard tests pass (TDD green)

## 7. Bundled Templates

- [x] 7.1 Create `templates/global-agents.md` with global memory scaffold
- [x] 7.2 Create `templates/main-agents.md` with Reeboot personal assistant persona scaffold

## 8. Integration & Architecture Update

- [x] 8.1 Run full test suite — all tests pass, no skipped
- [x] 8.2 Verify `npx reeboot --help` works from a clean install of the built package
- [x] 8.3 Update `architecture-decisions.md` — document Drizzle `push` strategy for local SQLite, note that `reeboot doctor` is a stub until Week 4, confirm Zod for config validation, note `better-sqlite3` pre-built binary approach
