# Tasks — sample API server

### 1. Create HTTP server entry point
- [x] **RED** — No server.ts exists
- [x] **ACTION** — Create `src/server.ts` with Hono app, listen on port 3000
- [x] **GREEN** — Server starts and responds to health checks

### 2. Implement profile CRUD routes
- [x] **RED** — No profile routes
- [x] **ACTION** — Create `src/routes/profiles.ts` with GET/POST/PUT/DELETE
- [x] **GREEN** — All CRUD endpoints tested

### 3. Add database layer
- [x] **RED** — No database access
- [x] **ACTION** — Create `src/repos/profile-repo.ts` with SQLite queries
- [x] **GREEN** — Integration tests pass

### 4. Add caching
- [ ] **RED** — No caching
- [ ] **ACTION** — Integrate Redis cache layer
- [ ] **GREEN** — Cache hit/miss metrics verified
