# Tasks — security-hermes-parity

Read: brief.md, design.md, all specs/ before executing any task.
Run tests from `reeboot/`: `npx vitest run <path>` or `npx vitest run` for full suite.

**Prerequisite:** `security-hardening` request must be complete. This builds on Phase 1's dangerous command detection and injection scanner.

---

### 1. Config schema — add new security fields

- [x] **RED** — Write `tests/config-security-fields.test.ts`: import `loadConfig` from `src/config.js`. Write a temp config with `security.dangerous_commands: { mode: 'manual', yolo: false, timeout: 30 }`, `security.website_blocklist: { enabled: true, domains: ['evil.com'] }`, `security.allow_private_urls: true`, `security.advisories: { acked_advisories: ['ADV-001'] }`. Assert all fields parse correctly. Assert defaults: `mode` defaults to `'deny'`, `timeout` defaults to `60`, `yolo` defaults to `false`, `allow_private_urls` defaults to `false`, `website_blocklist.enabled` defaults to `false`, `domains` defaults to `[]`, `acked_advisories` defaults to `[]`. Run → fails (fields don't exist in schema).

- [x] **ACTION** — In `src/config.ts`: add `DangerousCommandsSchema`, `WebsiteBlocklistSchema`, `AdvisoryConfigSchema`. Extend `SecurityConfigSchema` with `dangerous_commands`, `website_blocklist`, `allow_private_urls`, `advisories`. Add `allow_private_urls` as a top-level `security` field (not nested). Export the new types.

- [x] **GREEN** — Run `npx vitest run tests/config-security-fields.test.ts` → passes. Run `npx vitest run tests/config.test.ts` → still passes.

---

### 2. Hardline blocklist — add to confirm_destructive

- [x] **RED** — Write `tests/extensions/hardline-blocklist.test.ts`: import confirm-destructive default export. Test `tool_call` for bash with hardline patterns: `"rm -rf /"`, `"rm -rf --no-preserve-root /"`, `":(){ :|:& };:"`, `"dd if=/dev/zero of=/dev/sda"`, `"echo x > /etc/passwd"`, `"chmod 000 /"`. All must return `{ block: true, reason: /permanently blocked/i }`. Assert hardline is checked and blocked regardless of the approval `mode` config. Run → fails (current confirm_destructive has single-tier patterns, hardline reason text not present).

- [x] **ACTION** — In `src/extensions/confirm-destructive.ts`: split the pattern list into `HARDLINE_PATTERNS` and `DANGEROUS_PATTERNS`. In the `tool_call` handler, check hardline patterns first. If matched, return block with reason containing "permanently blocked". Then check dangerous patterns (which become the approval-mode-gated tier).

- [x] **GREEN** — Run `npx vitest run tests/extensions/hardline-blocklist.test.ts` → passes. Run `npx vitest run tests/extensions/dangerous-commands.test.ts` → still passes (Phase 1 patterns still work).

---

### 3. Approval modes — deny/manual/smart/off

- [x] **RED** — Write `tests/extensions/approval-modes.test.ts`: import confirm-destructive. Test each mode:
  - `deny`: dangerous command → blocked (existing behavior, unchanged)
  - `manual` + hasUI: dangerous command → `ctx.ui.confirm()` is called; if confirm returns true → no block; if false → blocked
  - `manual` + no UI: dangerous command → blocked with "Awaiting owner approval" reason; `.pending_approval.json` written to workspace
  - `smart`: low-risk command (e.g., `rm -rf ./node_modules`) → auto-approved (no block). Mock the LLM call to return `{ risk: 'low' }`
  - `smart`: high-risk command → auto-denied. Mock LLM returns `{ risk: 'high' }`
  - `smart`: medium-risk → falls back to manual behavior. Mock LLM returns `{ risk: 'medium' }`
  - `smart`: cache hit → no second LLM call for same command
  - `off`: dangerous command → no block, log entry written
  Run → fails (no approval modes, just flat blocking).

- [x] **ACTION** — In `src/extensions/confirm-destructive.ts`: add `mode` reading from `config.security.dangerous_commands.mode`. Implement mode-specific behavior after dangerous pattern match:
  - `deny`: return block (current behavior)
  - `manual`: `ctx.hasUI` → `ctx.ui.confirm()`; else → write `.pending_approval.json`, return block with approval message
  - `smart`: call `llmAssessRisk(command)` (lightweight LLM call with structured output `{ risk, reason }`), then route to auto-approve/deny/manual
  - `off`: log and return undefined (allow)
  Add `llmAssessRisk()` function that sends a minimal prompt to the configured provider. Add in-session cache (Map) for smart mode results. Add pending approval file handling: `before_agent_start` checks for `.pending_approval.json`, reads owner's latest message for "yes"/"no", and updates session allowlist.

- [x] **GREEN** — Run `npx vitest run tests/extensions/approval-modes.test.ts` → passes. Run `npx vitest run tests/extensions/dangerous-commands.test.ts` → still passes.

---

### 4. YOLO mode

- [x] **RED** — Write `tests/extensions/yolo-mode.test.ts`: import confirm-destructive. Test:
  - YOLO active (`config.security.dangerous_commands.yolo: true`): dangerous command → auto-approved, log entry with `yolo` field
  - YOLO active + hardline command → still blocked (hardline overrides YOLO)
  - YOLO toggled via `REBOOT_YOLO_MODE=1` env var → same behavior
  - YOLO off: dangerous command → normal mode behavior (not auto-approved)
  Run → fails (no YOLO logic).

- [x] **ACTION** — In `src/extensions/confirm-destructive.ts`: check `config.security.dangerous_commands.yolo` and `process.env.REBOOT_YOLO_MODE` at the start of the `tool_call` handler. If YOLO is active AND the command is not a hardline match, log with `{ yolo: true }` and return undefined (auto-approve).

- [x] **GREEN** — Run `npx vitest run tests/extensions/yolo-mode.test.ts` → passes.

---

### 5. Approval timeout

- [x] **RED** — Write `tests/extensions/approval-timeout.test.ts`: import confirm-destructive. Test:
  - Pending approval created with `created_at` timestamp. Owner's next message arrives after `timeout` seconds → approval denied, pending file deleted.
  - Owner's message arrives within timeout with "yes" → approval granted.
  - CLI mode: `ctx.ui.confirm` is called with timeout option. Mock timeout → returns false.
  Run → fails (no timeout logic in pending approval handling).

- [x] **ACTION** — In `src/extensions/confirm-destructive.ts`: in the `before_agent_start` handler that checks pending approvals, compare `Date.now()` against `created_at + timeout * 1000`. If expired, clear the pending file and treat as denied. In CLI confirm calls, pass timeout option. Read timeout from `config.security.dangerous_commands.timeout`.

- [x] **GREEN** — Run `npx vitest run tests/extensions/approval-timeout.test.ts` → passes.

---

### 6. SSRF guard module

- [x] **RED** — Write `tests/security/ssrf-guard.test.ts`: import `isUrlSafe` from `src/security/ssrf-guard.ts`. Test all blocked ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `::1`, `169.254.x.x`, `100.64-127.x.x`, `metadata.google.internal`. Test safe URLs: `example.com`, `github.com`. Test `allow_private_urls: true` → all URLs safe. Test DNS failure → fail-closed. Test redirect chain: safe URL → private redirect → re-validated and blocked. Run → fails (file doesn't exist).

- [x] **ACTION** — Create `src/security/ssrf-guard.ts`: export `isUrlSafe(url: string, opts?: { allowPrivate?: boolean }): Promise<{ safe: boolean; reason?: string }>`. Use `dns.lookup()` or `dns.promises.lookup()` to resolve hostnames. Check IPs against blocked ranges via `net.isIP()` and manual range checks. Check against cloud metadata hostname list. Fail-closed on DNS errors.

- [x] **GREEN** — Run `npx vitest run tests/security/ssrf-guard.test.ts` → passes.

---

### 7. Website blocklist module

- [x] **RED** — Write `tests/security/website-blocklist.test.ts`: import blocklist check function from `src/security/website-blocklist.ts`. Test: exact domain match, wildcard match (`*.example.com` matches `sub.example.com` and `deep.nested.example.com`), non-match, disabled (returns true), case-insensitive. Run → fails (file doesn't exist).

- [x] **ACTION** — Create `src/security/website-blocklist.ts`: export `isDomainBlocked(hostname: string, blocklist: { enabled: boolean; domains: string[] }): boolean`. Implement wildcard matching (convert `*.example.com` to regex `/^.+\.example\.com$/` and also match `example.com`).

- [x] **GREEN** — Run `npx vitest run tests/security/website-blocklist.test.ts` → passes.

---

### 8. Integrate SSRF + blocklist into URL-capable tools

- [x] **RED** — Write `tests/security/url-tool-guards.test.ts`: mock `isUrlSafe` and `isDomainBlocked`. Test `web_search` tool: when SSRF blocks a search result URL, the page fetch for that result returns an SSRF error. When blocklist blocks a URL, same. When both pass, normal result. Test `fetch_url` / `web_fetch` tool: same guards. Run → fails (no integration).

- [x] **ACTION** — In `src/extensions/web-search.ts` (or wherever the URL-fetching logic lives for `web_search`): import `isUrlSafe` and `isDomainBlocked`. Before fetching page content for search results, validate the URL. Return structured error on block. In `src/extensions/...` for `fetch_url`/`web_fetch`: same validation before fetch. Read config for SSRF and blocklist settings.

- [x] **GREEN** — Run `npx vitest run tests/security/url-tool-guards.test.ts` → passes.

---

### 9. MCP credential filtering

- [x] **RED** — Write `tests/mcp-credential-filtering.test.ts`: mock `McpServerPool` and `StdioClientTransport`. Test:
  - Spawned process has only safe env vars + explicitly configured env. Assert `OPENAI_API_KEY` NOT in env, `GITHUB_TOKEN` NOT in env (unless explicitly in serverCfg.env), `PATH` IS in env.
  - `XDG_*` vars are passed through.
  - Call `redactCredentials(errorMessage)` with patterns: `ghp_...`, `sk-...`, `Bearer ...`, `token=...`, `key=...`, `password=...`, `secret=...`. Assert all redacted.
  - Safe text passes through unchanged.
  Run → fails (current MCP manager passes entire process.env, no redaction).

- [x] **ACTION** — In `src/extensions/mcp-manager.ts`:
  - Add `SAFE_ENV_VARS` constant and filter `process.env` before passing to `StdioClientTransport`.
  - Add `XDG_*` passthrough.
  - Add `redactCredentials(text: string): string` function that applies regex replacements for credential patterns.
  - Call `redactCredentials()` on MCP tool call error results before returning to LLM.

- [x] **GREEN** — Run `npx vitest run tests/mcp-credential-filtering.test.ts` → passes.

---

### 10. Supply chain advisory scanner module

- [x] **RED** — Write `tests/security/advisory-scanner.test.ts`: import `scanDependencies` from `src/security/advisory-scanner.ts`. Create temp `package-lock.json` with known-vulnerable package. Create temp `advisories.json` with matching advisory. Assert `scanDependencies()` returns advisory with correct fields. Test: safe package returns no advisory. Test: version outside advisory range returns no advisory. Test: empty lockfile returns empty array. Run → fails (files don't exist).

- [x] **ACTION** — Create `src/security/advisory-scanner.ts`: export `scanDependencies(lockfilePath: string, advisoriesPath: string): Advisory[]`. Read and parse both JSON files. For each advisory, check if the lockfile contains the named package AND the installed version satisfies the semver range. Create `src/security/advisories.json` with initial empty catalog (placeholder — a real entry can be added for an example advisory to verify the mechanism).

- [x] **GREEN** — Run `npx vitest run tests/security/advisory-scanner.test.ts` → passes.

---

### 11. Wire advisory scanning into startup

- [x] **RED** — Write `tests/bootstrap-advisory-scanning.test.ts`: mock `scanDependencies` to return an advisory. Mock `getLogger()`. Call `bootstrapServerJobs()` (or the startup sequence). Assert `getLogger().warn()` was called with advisory info. Assert stdout includes the banner. Test: no advisories → no warn call, no banner. Run → fails (no advisory scanning in bootstrap).

- [x] **ACTION** — In `src/bootstrap.ts`: after DB init and before server jobs registration, call `scanDependencies()` with paths to `package-lock.json` and `advisories.json` in the reeboot package root. On findings: log to `operational_logs` via `getLogger().warn()`, print banner to stdout. Skip if `advisories.json` doesn't exist (graceful degradation in dev).

- [x] **GREEN** — Run `npx vitest run tests/bootstrap-advisory-scanning.test.ts` → passes.

---

### 12. `reeboot doctor` shows advisory details

- [x] **RED** — Check: `reeboot doctor` exists in the codebase. If it does, assert it does NOT show advisory information → write test. If it doesn't exist, this task becomes: check that no advisory output exists in any startup command → assertion fails. Run → advisory info not surfaced.

- [x] **ACTION** — Add advisory display to the doctor command (or equivalent CLI entry point): list all active advisories with ID, package, installed version, description, and remediation steps. Support `--ack <advisory-id>` to add to `config.security.advisories.acked_advisories`. Show `[ACKED]` marker for already-acked advisories.

- [x] **GREEN** — Verify: running the doctor-equivalent command shows advisory details.

---

### 13. Update docs

- [x] **RED** — Check: `docs/security/` does not contain pages for "approval-modes", "ssrf-protection", "supply-chain-scanning". Assert search returns no results.

- [x] **ACTION** — Create or update doc pages:
  - `docs/security/approval-modes.md` — approval modes, YOLO, timeout
  - `docs/security/ssrf-protection.md` — SSRF guard + website blocklist
  - `docs/security/supply-chain.md` — advisory scanner, doctor command
  Update `docs/security/permission-tiers.md` to reference new pages.

- [x] **GREEN** — Verify: all three pages exist and accurately describe the implemented behavior.
