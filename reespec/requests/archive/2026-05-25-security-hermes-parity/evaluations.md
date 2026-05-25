## Evaluation — 2026-05-25 10:50

### manual-mode-cli-confirm
verdict: ✅ SATISFIED
reason: spec requires `ctx.ui.confirm("Dangerous command: rm -rf ... Allow?")` in manual mode with UI — confirm-destructive.ts calls `(ctx as any).ui.confirm(...)` and tests in approval-modes.test.ts verify user approval proceeds and user denial blocks.

### manual-mode-headless-pending
verdict: ✅ SATISFIED
reason: spec requires pending approval file and block with "Awaiting owner approval" — confirm-destructive.ts writes `.pending_approval.json` and returns block with "awaiting owner approval", tested in approval-modes.test.ts.

### manual-mode-approve-next-turn
verdict: ❌ UNSATISFIED
reason: spec requires `before_agent_start` handler checks for pending approvals and adds approved commands to a "session-scoped allowlist" so "subsequent calls to the same command pattern are auto-approved" — the `before_agent_start` handler in confirm-destructive.ts only handles timeout expiry; no code reads owner "yes"/"no" messages or maintains any allowlist.

### manual-mode-deny-no-response
verdict: ❌ UNSATISFIED
reason: same gap as above — no code processes owner "no" responses to clear a pending approval. The `before_agent_start` handler only checks timeout, not message content.

### smart-mode-auto-approve-low
verdict: ✅ SATISFIED
reason: spec requires smart mode auto-approves low-risk commands — confirm-destructive.ts calls assessRisk, checks risk==='low', returns undefined; tested with injected `_assessRisk` in approval-modes.test.ts.

### smart-mode-auto-deny-high
verdict: ✅ SATISFIED
reason: spec requires smart mode auto-denies high-risk commands — confirm-destructive.ts blocks on risk==='high' with "Command auto-denied by risk assessment"; tested.

### smart-mode-escalate-medium
verdict: ✅ SATISFIED
reason: spec requires medium-risk falls back to manual mode — confirm-destructive.ts falls through to manual after medium assessment; tested in approval-modes.test.ts.

### smart-mode-cache
verdict: ✅ SATISFIED
reason: spec requires cached results per session — confirm-destructive.ts maintains `smartCache` Map and reuses results for identical commands; tested (second call doesn't trigger LLM).

### off-mode-logs
verdict: ⚠️ PARTIAL
reason: spec requires off mode writes to `operational_logs` with `{ component: 'dangerous-commands', event: 'command_allowed_off_mode', command: '<cmd>' }` — confirm-destructive.ts returns `undefined` (allows command) but never imports getLogger and never writes any log entry.

### yolo-auto-approve-indicator
verdict: ⚠️ PARTIAL
reason: spec requires "status bar / channel reply includes ⚡ YOLO indicator" and "auto-approved with a log entry" — confirm-destructive.ts auto-approves (returns undefined) via env var / config, but there is no `⚡ YOLO` indicator and no operational_logs entry. Also: spec says toggle via "slash command or env var" — only the env var (`REEBOOT_YOLO_MODE=1`) and config field are implemented; no `/yolo` slash command exists anywhere in the codebase.

### yolo-hardline-override
verdict: ✅ SATISFIED
reason: spec requires YOLO does not override hardline blocklist — hardline check runs before YOLO in confirm-destructive.ts; tested in yolo-mode.test.ts.

### hardline-rm-rf-root
verdict: ✅ SATISFIED
reason: spec requires `rm -rf /` and `rm -rf --no-preserve-root /` blocked as hardline — pattern in HARDLINE_PATTERNS tested in hardline-blocklist.test.ts.

### hardline-fork-bomb
verdict: ✅ SATISFIED
reason: spec requires `:(){ :|:& };:` blocked — pattern in HARDLINE_PATTERNS tested in hardline-blocklist.test.ts.

### hardline-disk-zeroing
verdict: ✅ SATISFIED
reason: spec requires `dd if=/dev/zero of=/dev/sda` blocked — pattern in HARDLINE_PATTERNS tested in hardline-blocklist.test.ts.

### hardline-mkfs
verdict: ✅ SATISFIED
reason: spec requires `mkfs.ext4 /dev/sda1` blocked — pattern `/\bmkfs/` in HARDLINE_PATTERNS; blocked in dangerous-commands.test.ts.

### hardline-etc-passwd
verdict: ✅ SATISFIED
reason: spec requires overwriting /etc/passwd blocked — pattern `/>\s*\/etc\/passwd\b/` in HARDLINE_PATTERNS tested in hardline-blocklist.test.ts.

### hardline-checked-first
verdict: ✅ SATISFIED
reason: spec requires hardline checked before dangerous patterns with no approval prompt — code checks HARDLINE_PATTERNS first and returns immediately; tested in approval-modes.test.ts (confirmFn not called for hardline commands in manual mode).

### ssrf-private-rfc1918
verdict: ✅ SATISFIED
reason: spec requires blocking private IPs (RFC 1918) — ssrf-guard.ts has BLOCKED_RANGES for 10.x, 172.16-31.x, 192.168.x; tested in ssrf-guard.test.ts.

### ssrf-loopback
verdict: ✅ SATISFIED
reason: spec requires blocking loopback (127.x, ::1) — BLOCKED_RANGES includes loopback checks; tested.

### ssrf-cloud-metadata-ip
verdict: ✅ SATISFIED
reason: spec requires blocking 169.254.169.254 — covered by link-local range in BLOCKED_RANGES; tested.

### ssrf-cloud-metadata-hostname
verdict: ✅ SATISFIED
reason: spec requires blocking metadata.google.internal — CLOUD_METADATA_HOSTNAMES array in ssrf-guard.ts; tested.

### ssrf-allow-public
verdict: ✅ SATISFIED
reason: spec requires allowing public URLs — isUrlSafe resolves public IP and returns { safe: true }; tested.

### ssrf-allow-private-optin
verdict: ✅ SATISFIED
reason: spec requires `allowPrivate` option bypasses IP checks — ssrf-guard.ts skips BLOCKED_RANGES when `opts?.allowPrivate`; tested.

### ssrf-redirect-revalidation
verdict: ❌ UNSATISFIED
reason: spec requires "redirect chains are re-validated at each hop" — fetchAndExtract in web-search.ts calls isUrlSafe once before fetch, but uses standard `fetch()` which transparently follows redirects; final redirect destination (which could be a private IP) is never validated. No redirect-chain re-validation code exists.

### ssrf-cgnat
verdict: ✅ SATISFIED
reason: spec requires blocking CGNAT (100.64-127.x.x) — BLOCKED_RANGES includes CGNAT range; tested.

### ssrf-fail-closed
verdict: ✅ SATISFIED
reason: spec requires blocking on DNS failure — isUrlSafe catches dns.lookup errors and returns { safe: false }; tested.

### blocklist-exact-match
verdict: ✅ SATISFIED
reason: spec requires blocking exact domain — isDomainBlocked in website-blocklist.ts handles exact matches; tested with "evil.com" vs "evil.com".

### blocklist-wildcard
verdict: ✅ SATISFIED
reason: spec requires wildcard `*.internal.company.com` blocks subdomains — isDomainBlocked handles `*.` prefix with suffix matching; tested.

### blocklist-deep-wildcard
verdict: ✅ SATISFIED
reason: spec requires `*.company.com` blocks deep.nested.sub.company.com — suffix matching in isDomainBlocked handles arbitrary depth; tested.

### blocklist-allow-nonmatching
verdict: ✅ SATISFIED
reason: spec requires allowing non-matching domains — isDomainBlocked returns false when no match; tested.

### blocklist-disabled
verdict: ✅ SATISFIED
reason: spec requires no-op when `enabled: false` — isDomainBlocked returns false immediately; tested.

### blocklist-before-ssrf
verdict: ✅ SATISFIED
reason: spec requires blocklist check before SSRF — fetchAndExtract in web-search.ts runs isDomainBlocked before isUrlSafe; tested in url-tool-guards.test.ts.

### blocklist-case-insensitive
verdict: ✅ SATISFIED
reason: spec requires case-insensitive matching — isDomainBlocked lowercases both hostname and entry; tested.

### mcp-safe-env-pass
verdict: ✅ SATISFIED
reason: spec requires MCP subprocess does NOT receive OPENAI_API_KEY or GITHUB_TOKEN but DOES receive PATH, HOME, USER, etc. — filterEnv in mcp-manager.ts passes only SAFE_ENV_VARS; tested.

### mcp-explicit-env
verdict: ✅ SATISFIED
reason: spec requires explicitly configured `env` entries passed — filterEnv accepts explicitEnv parameter that overrides/adds; tested with `{ GITHUB_TOKEN: "ghp_configured" }`.

### mcp-xdg-vars
verdict: ✅ SATISFIED
reason: spec requires XDG variables passed through — filterEnv includes `key.startsWith('XDG_')`; tested with XDG_CONFIG_HOME and XDG_DATA_HOME.

### mcp-redact-github-pat
verdict: ✅ SATISFIED
reason: spec requires `ghp_abc...` replaced with `[REDACTED-GITHUB-TOKEN]` in error messages — redactCredentials has `/ghp_[A-Za-z0-9]{36,}/g` pattern; tested.

### mcp-redact-openai-key
verdict: ✅ SATISFIED
reason: spec requires `sk-proj-abc...` replaced with `[REDACTED-OPENAI-KEY]` — redactCredentials has `/sk-[A-Za-z0-9_-]{20,}/g` pattern; tested.

### mcp-redact-bearer
verdict: ✅ SATISFIED
reason: spec requires Bearer token replaced with `Bearer [REDACTED]` — redactCredentials has `/Bearer\s+[A-Za-z0-9._\-]+/g` pattern; tested.

### mcp-redact-keyvalue
verdict: ✅ SATISFIED
reason: spec requires `api_key=sk-live-12345` value redacted — redactCredentials has `/API_KEY=[^&\s]{8,}/gi` pattern; tested.

### mcp-no-redact-safe-text
verdict: ✅ SATISFIED
reason: spec requires safe text unchanged — redactCredentials only modifies when patterns match; tested with "File not found: /tmp/missing.txt".

### supply-chain-flag-advisory
verdict: ✅ SATISFIED
reason: spec requires scanDependencies returns advisory with id, package, version, description, remediation, date — advisory-scanner.ts returns Advisory objects with all fields; tested.

### supply-chain-log-warning
verdict: ✅ SATISFIED
reason: spec requires `getLogger().warn()` with `{ component: 'advisory-scanner', advisoryId, package, version }` — bootstrap.ts iterates advisories and calls `log.warn(...)` with those fields; tested.

### supply-chain-banner
verdict: ✅ SATISFIED
reason: spec requires stdout banner "⚠ Package 'X' vY matches advisory Z. Run 'reeboot doctor' for details." — bootstrap.ts calls `console.warn(...)` matching this format; tested.

### supply-chain-skip-safe
verdict: ✅ SATISFIED
reason: spec requires no advisory for safe packages — scanDependencies returns empty array when no match; tested.

### supply-chain-outside-range
verdict: ✅ SATISFIED
reason: spec requires no advisory when version outside range — satisfiesVersion checks semver range; tested with `compromised-lib@2.0.0` outside `>=1.0.0 <2.0.0`.

### supply-chain-doctor
verdict: ✅ SATISFIED
reason: spec requires `reeboot doctor` shows advisory ID, package, version, description, remediation — doctor.ts's checkAdvisories formats all these fields; tested in doctor.test.ts.

### supply-chain-ack-suppress
verdict: ❌ UNSATISFIED
reason: spec requires acked advisories suppress `operational_logs` warnings and stdout banners at startup — bootstrap.ts's `bootstrapServerJobs` runs `scanDependencies` and unconditionally logs/prints all results without checking `config.security.advisories.acked_advisories`. The ack check only exists in doctor.ts, not in the startup scan path.

### supply-chain-ack-doctor
verdict: ✅ SATISFIED
reason: spec requires acked advisory still listed in doctor with `[ACKED]` marker — doctor.ts's checkAdvisories adds `[ACKED]` when id is in acked_advisories; tested.

### timeout-cli-deny
verdict: ❓ UNCLEAR
reason: spec says "the confirm dialog appears and 30 seconds pass with no response → command is denied" — confirm-destructive.ts calls `ctx.ui.confirm(...)` which returns a Promise; there is no `AbortSignal`, `Promise.race`, or timeout mechanism wrapping the confirm call in the tool_call handler. The CLI timeout behavior depends entirely on whether the UI layer's `confirm` implementation has its own timeout, which is outside this codebase's control. The spec is ambiguous about where the timeout is enforced.

### timeout-headless-deny
verdict: ✅ SATISFIED
reason: spec requires pending approval denied when owner message arrives after timeout — before_agent_start handler checks `age > timeoutSec * 1000` and deletes file; tested.

### timeout-headless-accept
verdict: ✅ SATISFIED
reason: spec requires owner reply "yes" within timeout grants approval — before_agent_start handler only deletes expired files; file within timeout survives; tested.

### timeout-clear-file
verdict: ✅ SATISFIED
reason: spec requires pending approval file deleted on timeout deny — unlinkSync called after timeout check; tested.

### timeout-configurable
verdict: ✅ SATISFIED
reason: spec requires timeout value read from `security.dangerous_commands.timeout` — confirm-destructive.ts reads `config?.security?.dangerous_commands?.timeout ?? 60`; tested with custom 120s.

## Triage

✅ Safe to skip: manual-mode-cli-confirm, manual-mode-headless-pending, smart-mode-auto-approve-low, smart-mode-auto-deny-high, smart-mode-escalate-medium, smart-mode-cache, yolo-hardline-override, hardline-rm-rf-root, hardline-fork-bomb, hardline-disk-zeroing, hardline-mkfs, hardline-etc-passwd, hardline-checked-first, ssrf-private-rfc1918, ssrf-loopback, ssrf-cloud-metadata-ip, ssrf-cloud-metadata-hostname, ssrf-allow-public, ssrf-allow-private-optin, ssrf-cgnat, ssrf-fail-closed, blocklist-exact-match, blocklist-wildcard, blocklist-deep-wildcard, blocklist-allow-nonmatching, blocklist-disabled, blocklist-before-ssrf, blocklist-case-insensitive, mcp-safe-env-pass, mcp-explicit-env, mcp-xdg-vars, mcp-redact-github-pat, mcp-redact-openai-key, mcp-redact-bearer, mcp-redact-keyvalue, mcp-no-redact-safe-text, supply-chain-flag-advisory, supply-chain-log-warning, supply-chain-banner, supply-chain-skip-safe, supply-chain-outside-range, supply-chain-doctor, supply-chain-ack-doctor, timeout-headless-deny, timeout-headless-accept, timeout-clear-file, timeout-configurable

⚠️  Worth a look:
- **manual-mode-approve-next-turn** ❌ — no code processes owner "yes"/"no" responses; no session-scoped allowlist; `before_agent_start` only handles timeout, not approval flow
- **manual-mode-deny-no-response** ❌ — same gap; no "no" response processing
- **off-mode-logs** ⚠️ — command allows in off mode but no operational_logs entry written; getLogger never imported
- **yolo-auto-approve-indicator** ⚠️ — no ⚡ YOLO indicator in status bar; no `/yolo` slash command; no log entry
- **ssrf-redirect-revalidation** ❌ — fetch URL validated once before fetch; redirect chains not re-validated at each hop
- **supply-chain-ack-suppress** ❌ — acked advisories still produce startup warnings and banners; ack check only in doctor, not in bootstrap startup scan

❓  Human call:
- **timeout-cli-deny** — spec requires 30s timeout on CLI confirm dialog, but code delegates entirely to UI layer's confirm() without any timeout wrapper; unclear whether the UI is expected to provide timeout or the extension should enforce it

---
