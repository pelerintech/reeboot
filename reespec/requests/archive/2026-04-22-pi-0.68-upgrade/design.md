# Design: Pi 0.68 Upgrade

## Pin Bump

`package.json` changes `"@mariozechner/pi-coding-agent": "0.65.2"` to `"0.68.1"`. No source changes required — our analysis confirmed:

- `createAgentSession()` does not receive a `tools` array in reeboot's code (the removed `Tool[]` API is not used).
- `DefaultResourceLoader` already receives explicit `cwd` and `agentDir` (no ambient `process.cwd()` reliance).
- None of the removed exports (`readTool`, `bashTool`, etc.) are imported anywhere.

Verification: `npm install && npm run check` in `reeboot/` must exit 0.

---

## Graceful Reload Teardown

### Mechanism

Pi 0.68 adds `event.reason: "quit" | "reload" | "new" | "resume" | "fork"` to the `session_shutdown` event. In reeboot's architecture, only two values are reachable:

- `"reload"` — triggered by `reeboot reload` → `loader.reload()`
- `"quit"` — triggered by process exit (SIGTERM, SIGHUP, `reeboot stop`)

`"new"`, `"resume"`, and `"fork"` require pi's interactive session navigation, which reeboot never uses. Full teardown is the safe default for any unexpected value.

### Guard pattern — same in all three extensions

```typescript
pi.on("session_shutdown", async (event) => {
  if (event.reason === "reload") return;
  // full teardown below
});
```

Explicit `=== "reload"` rather than a catch-all (`!== "quit"`) so any unexpected reason still triggers full teardown.

### Per-extension behaviour

**`mcp-manager.ts`** — `_pool.disconnectAll()` kills all MCP child processes. On reload, extensions are immediately re-initialised by pi, so the pool will reconnect on the next tool call. Skipping disconnect avoids the spawn + handshake cost and any in-flight MCP calls being aborted mid-execution.

**`scheduler-tool.ts`** — `manager.clearAll()` cancels every in-session timer and heartbeat. On reload, timers that were waiting mid-interval are silently lost. Skipping this preserves active timer state across the reload. The `TimerManager` itself survives in memory between extension re-registrations because pi re-runs the extension factory — a new `TimerManager` is created. Therefore the guard is: skip `clearAll()` on reload so in-flight timers are not explicitly cancelled, but accept that the new extension instance starts with a fresh manager. The timers themselves (`setTimeout` handles) remain active in the event loop and will fire.

**`skill-manager.ts`** — `clearInterval(loop)` stops the TTL expiry polling loop. On reload the new extension instance starts a new interval. Skipping the clear means two intervals briefly overlap during the reload window (~milliseconds). This is harmless — both poll the same `active-skills.json` file and produce the same result. The old interval orphans naturally when the old closure is GC'd.

---

## PI_CACHE_RETENTION=long

Set as an exported environment variable at process start:

- **`entrypoint.sh`** — add `export PI_CACHE_RETENTION=long` near the top, after the host variable exports but before any exec. This covers Docker deployments.
- **`generatePlist()`** in `daemon.ts` — add an `<EnvironmentVariables>` dict to the launchd plist. This covers macOS daemon mode.
- **`generateSystemdUnit()`** in `daemon.ts` — add `Environment=PI_CACHE_RETENTION=long` to the `[Service]` section. This covers Linux daemon mode.

Direct `reeboot start` (non-daemon, non-Docker) is not covered by this change — users running interactively can set the variable themselves. This is acceptable for v1; a future config key could propagate it automatically.

---

## Doctor Context Files Check

`loadProjectContextFiles(cwd, agentDir)` from `@mariozechner/pi-coding-agent` returns the list of AGENTS.md / context files that would be loaded for a given workspace. 

New check added to `runDoctor()`:

```typescript
async function checkContextFiles(reebotDir: string, cwd: string): Promise<CheckResult>
```

- Calls `loadProjectContextFiles(cwd, reebotDir)` (agentDir is `~/.reeboot/`).
- If files are found: `pass` — lists the file paths.
- If none found: `warn` — "no AGENTS.md context files found" with a fix hint.
- If the import throws: `warn` — reports the error but does not fail doctor.

The check is `warn`-only on failure (not `fail`) because missing context files are not a blocking problem — reeboot runs fine without them.

`runDoctor()` gains a `cwd` option (defaults to `process.cwd()`), passed through to the new check. Existing callers are unaffected.
