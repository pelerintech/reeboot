## Evaluation — 2026-05-25 14:00

### protected-paths
verdict:  ✅ SATISFIED
reason:   All 8 spec scenarios are covered — blocks writes to `~/.ssh`, `~/.aws`, `~/.gnupg`, and system
          dirs (`/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/boot/`, `/System/`), retains original 4 paths
          (`.env`, `.git/`, `node_modules/`, `config.json`), allows safe paths, resolves relative paths
          against `cwd()`, ignores non-write/edit tools. Source: `reeboot/src/extensions/protected-paths.ts`,
          19 tests pass.

### dangerous-commands
verdict:  ✅ SATISFIED
reason:   All 13 spec scenarios are covered — blocks `rm -rf`, `rm` in root paths, `chmod
          777/666/o+w/a+w`, `curl|sh` and `wget|bash` pipes, fork bombs, `dd`, `mkfs`, `>/etc/` redirects,
          `systemctl stop/restart/disable/mask`, `kill -9`, SQL DROP/DELETE/TRUNCATE. Session switch/fork
          handlers retained. Only bash tool calls checked. Source: `reeboot/src/extensions/confirm-destructive.ts`,
          39 tests pass.

### trust-enforcer
verdict:  ✅ SATISFIED
reason:   All 8 spec scenarios covered — blocks disallowed tools when trust is `end-user` and whitelist
          is configured, allows whitelisted tools, allows all when no whitelist or `owner` trust, logs
          violations via `getLogger().warn()` with component `trust-enforcer` and fields
          `{event:'trust_violation', toolName, trust:'end-user'}`, respects `permissions.violations.log:
          false`, reads trust from `~/.reeboot/contexts/<contextId>/workspace/.reeboot_turn_meta.json`,
          defaults to `owner` when absent. Bundled extension loaded in `reeboot/src/extensions/loader.ts`
          line 164-167. Source: `reeboot/src/extensions/trust-enforcer.ts`, 8 tests pass.

### injection-scanner
verdict:  ✅ SATISFIED
reason:   All 14 spec scenarios covered across three domains: (a) scanner module
          (`reeboot/src/security/injection-scanner.ts`) detects ignore_prior, override_mission,
          hidden_html, credential_exfil, zero_width, bidi_override, exfil_url patterns; returns unflagged
          for safe content; includes snippet + location; (b) injection-guard extension scans AGENTS.md at
          `before_agent_start` and prepends `[WARNING]` on flagged content, is a no-op when
          `injection_guard.enabled: false`; (c) pi-runner (`reeboot/src/agent-runner/pi-runner.ts` line
          136-141) scans `external_source_tools` tool output: warns owner (prepend), blocks end-user
          (replace entirely), passes clean content unchanged. `<external_content_policy>` system prompt
          block retained as Layer 2. 24 scanner tests + 4 injection-guard tests + 4 pi-runner scanning
          tests all pass.

## Triage

✅ All capabilities satisfied — no action required.

---

## Evaluation — 2026-05-25 13:04

### dangerous-commands

verdict:  ✅ SATISFIED
reason:   All 13 spec scenarios covered — `confirm-destructive.ts` has 24 DANGEROUS_PATTERNS covering rm
          (recursive, root path), chmod (777/666/o+w/a+w), chown -R, curl/wget pipe to shell, fork bomb,
          dd, mkfs, systemctl stop/restart/disable/mask, kill -9, DROP TABLE, DELETE FROM, TRUNCATE,
          find -exec rm/-delete, sed -i on /etc, and credential overwrite. Session handlers (switch/fork)
          retained. 39 tests in `dangerous-commands.test.ts` — all pass.

### protected-paths

verdict:  ⚠️ PARTIAL
reason:   All 8 spec scenarios covered in source and tests — `protected-paths.ts` blocks writes to `.ssh`,
          `.aws`, `.gnupg`, `/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/boot/`, `/System/`, plus original 4 paths,
          with `resolve()` for traversal attacks. 18 tests pass. However, `docs/security/permission-tiers.md`
          lists `~/.reeboot/config.json` as a protected path; it is covered only by a broad `config.json`
          substring match, not by an explicit `.reeboot` or `~/.reeboot/` entry in the protectedPaths array.
          No dedicated test verifies that `~/.reeboot/config.json` is blocked — the existing `config.json`
          test uses a bare filename.

### trust-enforcer

verdict:  ⚠️ PARTIAL
reason:   Code correctly implements all 8 spec scenarios — reads trust from `.reeboot_turn_meta.json`,
          applies whitelist, returns proper block reason ("not available in this context"), logs via
          `getLogger().warn()` when violations enabled, skips logging when disabled, and defaults to owner.
          6 tests pass. However, spec scenario 5 (log violation to operational_logs) and scenario 6
          (no log when disabled) have NO test coverage — no mock/spy on `getLogger().warn()` exists in
          `trust-enforcer.test.ts` to verify logging behavior.

### injection-scanner

verdict:  ⚠️ PARTIAL
reason:   Scanner module (`scanContent`) correctly detects all 7 pattern types (ignore_prior,
          override_mission, hidden_html, credential_exfil, zero_width, bidi_override, exfil_url) with
          snippet/location tracking — 24 unit tests pass in `injection-scanner.test.ts`. Injection-guard
          extension (AGENTS.md scanning + policy block) — 4 tests pass in `injection-guard-scanning.test.ts`.
          However, pi-runner tool output scanning tests in `pi-runner-tool-scanning.test.ts` (spec scenarios
          12–14) have non-assertions: the "warns owner" test only asserts `capturedEvents.length >= 0`
          (always true), the "blocks end-user" test declares `blockedResult` but never asserts it, and the
          "passes through clean" test declares `receivedEvent` but never asserts it. Source code logic IS
          correct, but these tests do not verify the behavior they claim to test.
focus:    `reeboot/tests/agent-runner/pi-runner-tool-scanning.test.ts` — three tests need meaningful
          assertions (verify WARNING prefix for owner, BLOCKED replacement for end-user, unchanged
          pass-through for clean output)

## Triage

✅ Safe to skip:   dangerous-commands
⚠️  Worth a look:  protected-paths — `~/.reeboot/config.json` only implicitly covered via `config.json`
                   substring; no explicit test for this documented path
                   trust-enforcer — missing test coverage for violation logging behavior (scenarios 5 & 6)
                   injection-scanner — pi-runner tool-scanning tests are effectively non-tests (no real
                   assertions); code is correct but tests don't verify behavior
❓  Human call:    (none — all capabilities are clearly specified)

---
