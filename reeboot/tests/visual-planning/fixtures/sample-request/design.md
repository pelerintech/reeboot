# API Server — design

## Architecture

Client → Gateway → Auth Middleware → Route Handler → Service Layer → Repository → Database
                              ↓
                        Cache Layer (Redis)

## Key files

`src/server.ts` — Entry point, HTTP server setup
`src/routes/profiles.ts` — Profile CRUD routes
`src/services/profile-service.ts` — Business logic layer
`src/repos/profile-repo.ts` — Database access layer

## Design decisions

### Decision: Database choice
We chose SQLite for local development and testing, Postgres for production.
Rejected: MongoDB — overkill for this scope.

### Decision: HTTP framework
We chose Hono for its lightweight footprint and TypeScript-first API.
Rejected: Express — heavier, more boilerplate.

### Decision: Caching strategy
We chose Redis for distributed caching across API instances.
Rejected: In-memory cache — doesn't scale horizontally.
