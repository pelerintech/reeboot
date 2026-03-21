# Findings: Bun + better-sqlite3 / Native Addons

**Research Date:** 2026-03-20
**Research Question:** Can Bun run better-sqlite3 (node-gyp native addon)? What are the workarounds or alternatives?

---

## Key Findings

1. **better-sqlite3 does NOT work with Bun** — it fails with an ABI version mismatch error. This is a persistent, well-documented, unresolved issue as of early 2026.
2. **The official Bun team response** (May 2024, GitHub #11197): *"Bun does not support `better-sqlite3` right now due to missing APIs. You can use Bun's built-in SQLite database instead."*
3. **Bun has its own built-in `bun:sqlite`** — a high-performance synchronous SQLite driver with an API inspired by better-sqlite3, claimed 3–6× faster for reads.
4. **The root cause** is an ABI (Application Binary Interface) version mismatch: better-sqlite3 is compiled against Node.js's `NODE_MODULE_VERSION`, but Bun uses a different ABI version. Recompiling against Bun's ABI is the only workaround — and this requires rebuilding better-sqlite3 from source targeting Bun's version.
5. **Bun v1.2.5 (March 2025) rewrote Node-API**, passing 98% of Node's `js-native-api` tests — but this did not fix the better-sqlite3 ABI mismatch because better-sqlite3 uses V8/NAN-level APIs, not just pure Node-API.
6. **Multiple open issues remain** (#16050, #25863, #19328) as of January–April 2025, all unresolved.
7. **The community workaround** for Docker/CI is: install with npm (not bun) to trigger native recompilation against Bun's ABI. Multi-stage builds or `npm install` + `bun run` combos are common.
8. **bun:sqlite is already supported by Drizzle ORM** via `drizzle-orm/bun-sqlite`, making migration from better-sqlite3 + Drizzle straightforward.

---

## better-sqlite3 on Bun: Current Status

### Error Encountered
```
error: The module 'better_sqlite3' was compiled against a different Node.js ABI version
using NODE_MODULE_VERSION 131. This version of Bun requires NODE_MODULE_VERSION 127.
Please try re-compiling or re-installing the module.
```
(Issue #16050, Dec 2024 — Bun 1.1.33)

```
error: The module 'better_sqlite3' was compiled against a different Node.js ABI version
using NODE_MODULE_VERSION 115. This version of Bun requires NODE_MODULE_VERSION 127.
Please try re-compiling or re-installing the module.
```
(Issue #19328, April 2025 — Bun 1.2.10)

### Root Cause
better-sqlite3 is a **node-gyp native C++ addon** that compiles to a `.node` binary linked against Node.js's V8/ABI. Bun exposes its own ABI version (NODE_MODULE_VERSION) which **does not match** Node.js's version. Simply running `bun install` does not trigger recompilation — the prebuilt binary is used, which mismatches.

### Official Bun Team Statement
From Bun core contributor (GitHub #11197, May 2024):
> *"Bun does not support `better-sqlite3` right now due to missing APIs. You can use Bun's built-in SQLite database instead."*

### Timeline of Issues
| Date | Issue | Status |
|------|-------|--------|
| Sept 2023 | #6008 — "Could not locate bindings file" | Open/stale |
| Dec 2023 | #7819 — symbol lookup error on Linux | Open |
| May 2024 | #11197 — Segfault with better-sqlite3 + Drizzle | Confirmed not supported |
| Dec 2024 | #16050 — ABI mismatch, request for native compat | Open |
| Jan 2026 | #25863 — "Could you add compatibility with better-sqlite3?" | Open |
| Apr 2025 | #19328 — ABI mismatch on Bun 1.2.10 | Open |

### Known Workarounds
1. **Recompile for Bun's ABI**: Run `npm install` (not `bun install`) or use `npm rebuild` which uses `node-gyp-build` to compile for the detected runtime. In some configurations this can build against Bun's ABI.
2. **Multi-stage Docker build**: Install dependencies with Node (so node-gyp compiles correctly), then copy to Bun image. Heavily disliked — defeats the purpose of using Bun.
3. **Switch to `bun:sqlite`** (recommended): The canonical solution per the Bun team.

### Does NAPI Rewrite Help?
Bun v1.2.5 (March 2025) did a **full rewrite of Node-API**, passing 98% of Node's `js-native-api` test suite. However, better-sqlite3 relies on **NAN (Native Abstractions for Node.js)** and V8-level C++ APIs — not just Node-API. The issue tracking V8 C++ API support is #4290 (open since 2023). This means **the NAPI rewrite does not fix better-sqlite3**.

---

## Alternative SQLite Options for Bun

### 1. `bun:sqlite` (Recommended)
- **Built into Bun** — no npm install needed
- **API inspired by better-sqlite3** — similar synchronous design
- **Performance**: Bun claims 3–6× faster than better-sqlite3 for read queries (benchmarked against Northwind Traders dataset)
- **Community benchmark** (Reddit r/bunjs, Feb 2024): ~2.1× faster in real-world tests (96,301 vs 46,659 ops/sec)
- Features: transactions, named/positional params, prepared statements, BLOB → Uint8Array, bigint support, multi-query

```typescript
import { Database } from "bun:sqlite";
const db = new Database("mydb.sqlite");
const query = db.query("SELECT * FROM users WHERE id = ?");
const user = query.get(1);
```

**Official docs**: https://bun.com/docs/runtime/sqlite

### 2. Drizzle ORM + bun:sqlite
Drizzle ORM has **first-class support** for bun:sqlite:
```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);
```
- Official guide: https://orm.drizzle.team/docs/get-started/bun-sqlite-new
- Bun's own docs: https://bun.com/docs/guides/ecosystem/drizzle

### 3. `@libsql/client` / Turso
- Works with Bun (JavaScript client, no native addon)
- Compatible with Drizzle ORM
- Good for edge/serverless use cases

### 4. `db0` (UnJS)
- Mentioned in nuxt/content issues as alternative
- https://db0.unjs.io/connectors/sqlite

---

## Other Native Addon Compatibility

### General State (2024–2025)
- **Node-API (NAPI) addons**: Progressively better support. Bun v1.2.5 passes 98% of Node's NAPI tests. Many NAPI addons now work.
- **NAN (Native Abstractions) addons**: **Not supported**. better-sqlite3 uses NAN internals. Issue #4290 (V8 C++ API support) is open since Aug 2023.
- **Prebuilt binaries**: Often fail due to ABI mismatch since Bun uses its own NODE_MODULE_VERSION.
- Bun homepage notes: *"Native Addons. Call C-compatible native code from JavaScript. Bun.ffi, NAPI, partial V8 C++ API."* — **partial** is the key word.

### Medium.com comparison (Sept 2025):
> "Native addons: Node — Widest coverage; Deno — NAPI compatible via shims; Bun — NAPI progressing."

### Bun v1.2.21 (Aug 2025) note:
Fixed: "assertion failure during process exit when using NAPI addons, such as `node-sqlite3`, that trigger garbage collection" — showing Bun is actively fixing NAPI edge cases, but better-sqlite3 (NAN-based) remains distinct.

---

## Recommended Path for reeboot

**Short term (if targeting Bun):**
- **Switch from `better-sqlite3` to `bun:sqlite`** — this is the only reliable path
- The API is nearly identical (synchronous, same patterns), so migration effort is moderate
- Drizzle ORM supports bun:sqlite natively (`drizzle-orm/bun-sqlite`), so if reeboot uses Drizzle, the ORM layer changes minimally

**Medium term:**
- Abstract the database layer behind an interface so the driver is swappable
- This allows running with Node.js (better-sqlite3) OR Bun (bun:sqlite) depending on environment

**If staying with Node.js:**
- better-sqlite3 continues to work perfectly; no changes needed
- Bun is blocked as a runtime unless the SQLite layer is swapped

**Do NOT attempt:**
- Running better-sqlite3 under Bun directly (ABI mismatch; crashes or fails to load)
- Multi-stage Docker workarounds (fragile, adds complexity)
- Waiting for Bun to fix V8/NAN support (no clear ETA, issue open since 2023)

---

## Sources

| Source | URL | Date |
|--------|-----|------|
| GitHub: Make better-sqlite3 work in bun (#16050) | https://github.com/oven-sh/bun/issues/16050 | Dec 2024 |
| GitHub: Segfault with better-sqlite3 (#11197) | https://github.com/oven-sh/bun/issues/11197 | May 2024 |
| GitHub: Could you add compatibility with better-sqlite3? (#25863) | https://github.com/oven-sh/bun/issues/25863 | Jan 2026 |
| GitHub: better-sqlite3 ABI mismatch (#19328) | https://github.com/oven-sh/bun/issues/19328 | Apr 2025 |
| GitHub: nuxt/content better-sqlite3 doesn't support Bun (#2936) | https://github.com/nuxt/content/issues/2936 | Dec 2024 |
| GitHub: better-auth bun:sqlite support (#1062) | https://github.com/better-auth/better-auth/issues/1062 | Dec 2024 |
| GitHub: Support V8 C++ APIs / NAN addons (#4290) | https://github.com/oven-sh/bun/issues/4290 | Aug 2023 |
| Bun Docs: SQLite | https://bun.com/docs/runtime/sqlite | Current |
| Bun Blog: v1.2.5 (Node-API rewrite) | https://bun.com/blog/bun-v1.2.5 | Mar 2025 |
| Bun Blog: v1.2 | https://bun.com/blog/bun-v1.2 | Jan 2025 |
| Drizzle ORM: Get Started with bun:sqlite | https://orm.drizzle.team/docs/get-started/bun-sqlite-new | Current |
| Bun Docs: Drizzle guide | https://bun.com/docs/guides/ecosystem/drizzle | Current |
| Reddit r/bunjs: bun:sqlite vs better-sqlite3 benchmark | https://www.reddit.com/r/bunjs/comments/1aqyx43/bunsqlite_vs_bettersqlite3/ | Feb 2024 |
| AppSignal Blog: When to Use Bun Instead of Node.js | https://blog.appsignal.com/2024/05/01/when-to-use-bun-instead-of-nodejs.html | May 2024 |
| OneUptime: How to Use SQLite with Bun's Native Support | https://oneuptime.com/blog/post/2026-01-31-bun-sqlite/view | Jan 2026 |
| Dev.to: Bun 1.2 Deep Dive (SQLite, S3) | https://dev.to/pockit_tools/bun-12-deep-dive-built-in-sqlite-s3-and-why-it-might-actually-replace-nodejs-4738 | Feb 2026 |
| Medium: JavaScript Runtime Race 2025 | https://medium.com/@Modexa/the-javascript-runtime-race-deno-vs-node-vs-bun-in-2025-522f342de5c5 | Sept 2025 |
