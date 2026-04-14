# Decisions

Architectural and strategic decisions across all requests.
One decision per entry. One paragraph. Reference the request for details.

## Entry format

### <Decision title> — YYYY-MM-DD (Request: <request-name>)

What was decided and why. What was considered and rejected.
See request artifacts for full context.

---

## What belongs here
- Library or technology choices with rationale
- Architectural patterns adopted
- Approaches explicitly rejected and why
- Deviations from the original plan with explanation
- Decisions that constrain future work

## What does NOT belong here
- Activity entries ("added X", "removed Y", "refactored Z")
- Implementation details available in request artifacts
- Decisions too small to affect future planning

---

<!-- decisions below this line -->

### Sandbox wrapper injected via DI, not which-package mock — 2026-04-14 (Request: permission-tiers)

`McpServerPool` accepts an optional `sandboxWrapper` constructor parameter (defaulting to `defaultSandboxWrapper`) so tests can inject a mock wrapper directly instead of mocking the `which` package via `vi.mock`. The `which` package is a CJS module — vitest's ESM dynamic import mocking (`vi.mock` + `await import()` inside the module under test) proved unreliable for it. `mcpManagerExtension` also accepts an optional pre-built `pool` parameter for the same reason. The production code path remains unchanged: the default wrapper uses `which` to locate `sandbox-exec`/`bwrap` at runtime. This DI approach is preferred over module-level mocking for any CJS dependency used via dynamic import.

### MCP client uses proxy tool, not direct registration — 2026-04-13 (Request: mcp-client)

All MCP server tools are exposed through a single `mcp` proxy tool (~200 tokens) rather than registered as individual native pi tools (150–300 tokens each). The agent discovers tools via `mcp({ action: "list", server })` then invokes them via `mcp({ action: "call", ... })`. Direct registration was rejected because token cost scales linearly with tool count — a single server with 75 tools would consume 10k+ tokens regardless of whether any are used.

### pi-mcp-adapter rejected in favour of native implementation — 2026-04-13 (Request: mcp-client)

`pi-mcp-adapter` (nicobailon) is the most mature community MCP extension for pi but hardcodes `~/.pi/agent/` for all config and cache paths. Reeboot uses `~/.reeboot/agent/` as its agentDir. Adopting the package would split the user's configuration across two directories. Forking was considered and rejected (maintenance burden). Decision: build `mcp-manager.ts` as a native bundled extension with config in `~/.reeboot/config.json → mcp.servers`.

### MCP client v1 is stdio-only, lazy-start — 2026-04-13 (Request: mcp-client)

Servers are spawned as child processes on first tool call (not at session start) and killed on `session_shutdown`. HTTP/SSE transport deferred to v2. No wizard setup step in v1 — manual config only.

### TypeScript 6 did not require tsconfig `types` array — 2026-04-07 (Request: typescript-v6)

The brief predicted TS 6 would default `types` to `[]`, requiring an explicit `"types": ["node"]` in tsconfig to preserve global Node.js types. In practice, TS 6.0.2 compiled reeboot cleanly with no tsconfig changes — `tsc` exited 0 immediately after the pin bump. The `types` defaulting change either did not land in the 6.0 final release as described in the RC notes, or TS still auto-includes `@types/node` when it is present as a devDependency. No tsconfig change was made; the existing config is sufficient for TS 6.

### cron-parser v5 .next() returns CronDate directly, not an iterator result — 2026-04-07 (Request: cron-parser-v5)

The brief (and upstream changelog) described cron-parser v5's `.next()` as returning an ES iterator result `{ value: CronDate, done: boolean }`, requiring `.next().value.toDate()`. At runtime, v5's `.next()` returns a `CronDate` directly — the call chain is identical to v4 (`.next().toDate()`). The TypeScript type declaration (`CronExpression.d.ts`) confirms `next(): CronDate`. The only real breaking change for reeboot was the import API: `parseExpression(expr)` → `CronExpressionParser.parse(expr)` and dropping the `createRequire` CJS hack. Also discovered: stale compiled `.js` files in `src/` were shadowing TypeScript sources for the vitest runner — these were deleted.

### External packages managed via pi's DefaultPackageManager, not custom npm — 2026-03-21 (Request: package-install-fix)

Reeboot's original `packages.ts` reimplemented package management (npm install to `~/.reeboot/packages/`, tracking in `config.json`). This was broken: pi's `DefaultPackageManager` reads package lists from `agentDir/settings.json`, not `config.json`. Packages were installed but never discovered by the loader. The fix delegates to pi's `DefaultPackageManager` directly — it handles installation, settings.json tracking, and discovery on reload. User-scope npm packages are installed globally (`npm install -g`) consistent with how pi itself works. A one-time migration moves legacy `config.json` packages to `settings.json` on startup.

### authMode splits auth from identity in pi session — 2026-03-21 (Request: agent-isolation)

Reeboot's pi-runner was accidentally delegating model selection, API key resolution, and persona to `~/.pi/agent/` because pi's `DefaultResourceLoader` uses `agentDir` for both identity (AGENTS.md, extensions) and auth (auth.json, settings.json). The fix splits these: `agentDir` is always `~/.reeboot/agent/` for persona/extensions; auth/model is driven by `authMode: "pi" | "own"` in config.json. `authMode: "pi"` delegates to pi's own files; `authMode: "own"` injects credentials as runtime overrides via pi's `AuthStorage` API. Considered a single shared agentDir with pi (Option B) — rejected because user's personal pi extensions, settings, and persona bleed into reeboot.

### Pi is a bundled dependency, not an assumed host installation — 2026-03-21 (Request: agent-isolation)

Pi (`@mariozechner/pi-coding-agent`) is listed in reeboot's `package.json` dependencies and ships inside reeboot's `node_modules`. No separate pi installation is required on the host or in Docker. The user's personal pi installation (if present) is only relevant for `authMode: "pi"` auth delegation — the binary, runtime, and code are always reeboot's bundled copy.

### Docker headless config via env vars, existing config wins — 2026-03-21 (Request: agent-isolation)

For headless Docker deployments, `REEBOOT_*` env vars are translated to `--no-interactive` flags by `entrypoint.sh` only when no `config.json` exists. If a config.json is already present (volume mount from host setup), it is used as-is and env vars are ignored. `REEBOOT_AGENTS_MD` is an exception — it writes directly to `~/.reeboot/agent/AGENTS.md` before start, enabling persona injection without a wizard. A future platform can implement richer config bundle injection (URL fetch, base64 decode) as an entrypoint wrapper outside reeboot core.
