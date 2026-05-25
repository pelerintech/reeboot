# Brief — security-hardening

## Problem

Reeboot's security documentation claims protections that don't exist in the code. Four concrete gaps were found during discovery:

1. **`protected-paths` only guards 4 paths** (`.env`, `.git/`, `node_modules/`, `config.json`) but docs claim `~/.ssh`, `~/.aws`, and system directories are also protected.

2. **`confirm-destructive` only handles session operations** (switch, fork, clear) but docs say it confirms dangerous commands like `rm -rf` and file overwrites before execution.

3. **`trust-enforcer` extension doesn't exist.** `pi-runner.ts` has a comment saying "Production enforcement is provided by the trust-enforcer bundled extension" — but that extension was never written. The tool whitelist for `end-user` trust only works in tests, not production.

4. **`injection-guard` only injects a system prompt instruction.** Docs say it "scans returned content for patterns" and "flags" injection attempts. The actual code has no content scanner — it relies entirely on the model to follow the prompt instruction.

These gaps mean the agent is less protected than what users reasonably expect from reading the docs.

## Vision

Every security feature documented in `docs/security/` is backed by working code. The trust-enforcer actually enforces tool restrictions for end-users. The injection guard actually scans content. Protected paths actually cover what the docs say. Dangerous commands actually require approval.

The model for dangerous command approval is Hermes's pattern-matching approach (Phase 1 scope: basic pattern matching, no approval modes or YOLO — those come in Phase 2). The model for injection scanning is Hermes's context file scanner, adapted to also scan tool output from `external_source_tools`.

## Goals

- **protected-paths** blocks writes to `~/.ssh`, `~/.aws`, system directories, and the originally protected paths — matching the documented list.
- **confirm-destructive** (renamed/replaced) checks bash commands against a curated list of dangerous patterns before execution and requires approval. The old session-operation UI confirmations are retained or moved.
- **trust-enforcer** is a real bundled extension that hooks `tool_call` events and blocks disallowed tools for `end-user` trust sessions, enforcing the per-context tool whitelist.
- **injection-guard** scans content returned from `external_source_tools` for injection patterns (ignore-prior-instructions, hidden HTML, zero-width characters, credential exfiltration, invisible Unicode) and flags or blocks it. The existing system prompt `<external_content_policy>` block is retained as a complementary Layer 2.
- All unit tests for the four capabilities pass. Integration tests verify end-to-end: end-user messages get tool restrictions, injection content gets scanned and flagged, dangerous commands get blocked.

## Non-Goals

- Approval modes (smart, YOLO) — Phase 2.
- Hardline blocklist (commands that even YOLO can't bypass) — Phase 2.
- SSRF protection — Phase 2.
- Website blocklist — Phase 2.
- MCP credential filtering — Phase 2.
- Supply chain scanning — Phase 2.
- Approval timeout — Phase 2.
- Changing the sandbox implementation (it already works as documented).

## Impact

- Users who configured `trust: "end-user"` on channels now get actual tool restriction enforcement, not just a test mock.
- The injection guard provides real defense-in-depth: content scanning catches known patterns, the system prompt instruction catches novel ones.
- Protected paths actually protect the paths users expect.
- Dangerous commands require approval before execution.
