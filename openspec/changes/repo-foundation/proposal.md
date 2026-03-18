## Why

`reeboot` is a personal AI agent that runs locally and is reachable via WhatsApp, Signal, or a built-in WebChat. Before any features can be built, the repository needs a solid foundation: TypeScript/ESM project scaffold, CLI entry point, config system, SQLite database layer, and a basic Fastify server. Without this foundation nothing else can be composed.

## What Changes

- Create the `reeboot` npm package repository with TypeScript, ESM, Node ≥ 22
- Implement `src/config.ts` — load/validate `~/.reeboot/config.json`, apply defaults, expose typed config object
- Implement `src/db/` — SQLite schema via Drizzle (contexts, messages, tasks, channels, usage tables)
- Implement `src/server.ts` — Fastify HTTP server skeleton with `/api/health` and `/api/status` endpoints
- Implement `src/index.ts` — CLI entrypoint using Commander with sub-commands: `start`, `setup`, `doctor`, `status`, `reload`, `restart`, `install`, `uninstall`, `packages list`, `channels list/login/logout`, `contexts list/create`, `sessions list`
- Implement `src/setup-wizard.ts` — Inquirer-based interactive first-run wizard (provider, API key, model, channels, agent name); writes config + scaffolds `~/.reeboot/` directory tree
- Bundle `templates/global-agents.md` and `templates/main-agents.md` as scaffolded defaults

## Capabilities

### New Capabilities

- `cli-entrypoint`: `npx reeboot` / `reeboot <cmd>` Commander CLI with all Phase 1 sub-commands registered
- `config-system`: Load, validate, and provide typed access to `~/.reeboot/config.json` with sensible defaults
- `database`: SQLite database via Drizzle ORM — schema, migrations, connection singleton
- `http-server`: Fastify HTTP server with health + status REST endpoints
- `setup-wizard`: Interactive first-run wizard that writes config and scaffolds `~/.reeboot/` directory structure

### Modified Capabilities

## Impact

- New npm package `reeboot` — no existing code
- Runtime dependencies introduced: `commander`, `inquirer`, `fastify`, `better-sqlite3`, `drizzle-orm`, `pino`, `nanoid`, `@mariozechner/pi-coding-agent`
- Dev dependencies: `typescript`, `tsx`, `@types/node`, `@types/better-sqlite3`, `drizzle-kit`, `vitest`
- Node.js ≥ 22 required; ESM-only package
