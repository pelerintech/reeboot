# Brief — security-hermes-parity

## Problem

Phase 1 (security-hardening) fixed doc/code mismatches and built foundational dangerous command detection and injection scanning. But reeboot's security model still lags behind Hermes in several areas discovered during the comparative audit.

Hermes has 7 security layers that reeboot lacks:

1. **No approval flow for dangerous commands.** Phase 1 blocks dangerous commands outright. Hermes has three approval modes (manual prompt, smart LLM-assessment, off) plus a YOLO toggle. Users who need to run a dangerous command legitimately have no path to approval.

2. **No hardline blocklist.** Hermes has commands so catastrophic that they're blocked regardless of mode or YOLO toggle (`rm -rf /`, `dd if=/dev/zero of=/dev/sd*`, fork bombs on the host). Phase 1's pattern list is a single flat tier — everything is equally blockable. There's no "floor" that even the owner can't override.

3. **No SSRF protection.** Hermes blocks requests to private IPs (RFC 1918), loopback, link-local, CGNAT, and cloud metadata endpoints. Reeboot's `web_search`, `web_fetch`, and `fetch_url` tools can be directed to internal services by a malicious external page or prompt injection.

4. **No website blocklist.** Hermes lets operators restrict which domains the agent can access. Reeboot has no domain-level access control.

5. **No MCP credential filtering.** Hermes passes only safe env vars (`PATH`, `HOME`, etc.) to MCP subprocesses and redacts credentials from error messages. Reeboot passes the entire `process.env` to MCP processes.

6. **No supply chain scanning.** Hermes scans for known-compromised Python packages. Reeboot has no equivalent for npm — a poisoned package in `node_modules` goes undetected.

7. **No approval timeout.** Hermes has a configurable timeout for dangerous command approval prompts. If the user doesn't respond, the command is denied (fail-closed). Phase 1's block-only approach doesn't need this, but once approval modes are added, a timeout is essential for unattended operation.

## Vision

Reeboot's security model matches or exceeds Hermes's defense-in-depth posture. The agent can be trusted by operators who need the flexibility to approve dangerous commands, and by users who need protection from SSRF, credential leaks, and supply chain attacks.

## Goals

- **Approval modes:** `confirm_destructive` supports three modes — `manual` (prompt user), `smart` (LLM-assess risk, auto-approve safe, escalate uncertain), and `off` (dangerous commands are logged but not blocked). YOLO mode is a per-session toggle via slash command or env var.
- **Hardline blocklist:** A curated list of catastrophic commands that are blocked regardless of approval mode or YOLO — no override. These patterns are the floor below YOLO.
- **SSRF protection:** All URL-capable tools validate destination IPs against private/loopback/link-local/CGNAT/cloud-metadata ranges before fetching. Redirect chains are re-validated at each hop.
- **Website blocklist:** Configurable domain blocklist enforced across all URL-capable tools. Supports wildcards (`*.internal.company.com`).
- **MCP credential filtering:** MCP subprocesses receive only safe env vars (`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL`, `TMPDIR`, `XDG_*`) plus explicitly configured `env` entries. Credential patterns in MCP error messages are redacted before being returned to the LLM.
- **Supply chain scanning:** A startup check that reads `package-lock.json` and flags known-compromised npm package versions against a curated advisory catalog. Results go to `operational_logs` and appear in `reeboot doctor`.
- **Approval timeout:** Dangerous command approval prompts have a configurable timeout. No response = denied (fail-closed).

## Non-Goals

- Docker/container sandboxing — reeboot uses sandbox-exec/bwrap. This stays Phase 2 out-of-scope.
- Tirith-style pre-exec binary scanning — the hardline blocklist + approval modes provide equivalent coverage.
- Context file injection scanning — already covered in Phase 1.
- Permanently allow-listed commands (Hermes's "always" button in CLI) — nice-to-have, deferred.

## Impact

- Operators can run legitimate dangerous commands (deployments, database migrations) by approving them rather than being blocked outright.
- Smart mode reduces approval fatigue by auto-approving low-risk commands and auto-denying genuinely dangerous ones.
- SSRF protection prevents the agent from being used as a proxy to scan internal networks or access cloud metadata.
- MCP servers can't leak host credentials through `process.env` or error messages.
- Supply chain advisories give operators visibility into poisoned dependencies without manual auditing.