# Design — security-hardening

## Four capabilities, one request

Each capability addresses a specific doc/code mismatch found during discovery. All four are independent — they touch different code paths and can be built in parallel (though tasks are sequenced for TDD discipline).

---

## Capability 1: Protected Paths Expansion

### Current state

`src/extensions/protected-paths.ts` blocks writes to 4 paths:
```
.env, .git/, node_modules/, config.json
```

Docs claim it also protects `~/.ssh/`, `~/.aws/`, and system directories.

### Design

Expand the array in-place. The extension already hooks `tool_call` for `write` and `edit` tools and returns `{ block: true, reason }`. The only change is the list of paths.

```ts
const protectedPaths = [
  '.env',
  '.git/',
  'node_modules/',
  'config.json',
  // Documented but previously missing:
  '.ssh',
  '.aws',
  '.gnupg',
  // System dirs (prevent writes anywhere under these):
  '/etc/',
  '/usr/',
  '/bin/',
  '/sbin/',
  '/boot/',
  '/System/',
];
```

The existing `path.includes(p)` check is coarse (matches any substring). Expand it to check absolute paths properly by resolving the candidate path against `process.cwd()` first. Keep the existing `includes` approach for relative matches and add an absolute-path check.

**Why not a regex-based check?** The `includes` substring match is simpler, catches both relative and absolute references, and is acceptable for a coarse-grained guard. The sandbox provides finer-grained OS-level enforcement.

### No config changes needed. `extensions.core.protected_paths` already exists.

---

## Capability 2: Dangerous Command Approval

### Current state

`src/extensions/confirm-destructive.ts` hooks `session_before_switch` and `session_before_fork` pi events. These confirm session operations (clear, switch, fork) — not dangerous commands. The docs say it confirms operations like `rm -rf` and file overwrites.

### Design

**Rename:** The extension conceptually becomes "dangerous command guard." The file name stays `confirm-destructive.ts` (it's wired in the loader under that name) but the content changes.

**Two concerns in one extension:**

1. **Session operations** (existing, retained): confirm before switch/fork. These remain as `session_before_switch` / `session_before_fork` handlers.

2. **Dangerous command detection** (new): hook `tool_call` for the `bash` tool. Before the command executes, scan it against a curated pattern list. If matched, block execution with an explanatory message.

**Pattern list** — Phase 1 scope (basic, no approval flow or YOLO):

```
Pattern                          Why
──────────────────────────────────────────────────────
rm -r / --recursive              Recursive delete
rm ... /                         Delete in root path
chmod 777 / 666 / o+w / a+w      World/other-writable
chown -R / --recursive           Recursive chown
mkfs                             Format filesystem
dd if=                           Disk copy
> /dev/sd                        Write to block device
DROP TABLE / DATABASE            SQL DROP
DELETE FROM  (without WHERE)     SQL DELETE no WHERE
TRUNCATE TABLE                   SQL TRUNCATE
> /etc/                          Overwrite system config
systemctl stop/restart/disable   System service control
kill -9                          Force kill
fork bomb  :(){ :|:& };:        Bash fork bomb
curl ... | sh / bash             Pipe remote to shell
wget ... | sh / bash             Pipe remote to shell
bash <(curl ...)                 Process substitution
find ... -exec rm / -delete      Find with destructive
sed -i / --in-place on /etc/     In-place edit system config
> ~/.ssh/                         Overwrite SSH
> ~/.aws/                         Overwrite AWS creds
```

**Behavior:** Always block — no approval flow in Phase 1. In Phase 2, this gets upgraded to approval modes (manual/smart/off) and a hardline blocklist.

**Why block-only in Phase 1?** Approval flow requires UI integration (messaging platform replies, timeouts, session-scoped approvals) that crosses several system boundaries. Phase 1 establishes the detection engine; Phase 2 adds the approval UI on top.

**Edge case:** Commands inside a sandboxed Docker container should still be checked — the container is reeboot's own escape boundary and reeboot doesn't use Docker for sandboxing (it uses sandbox-exec/bwrap).

### Config: no new schema fields. Uses existing `extensions.core.confirm_destructive`.

---

## Capability 3: Trust-Enforcer Extension

### Current state

The `trust-enforcer` is referenced in a code comment in `pi-runner.ts` but the extension file doesn't exist. The tool whitelist for `end-user` trust only works in tests (where the mock session exposes `.on()`). In production, end-users have unrestricted tool access.

### Design

**New bundled extension:** `src/extensions/trust-enforcer.ts`. Registered in the loader alongside the other bundled extensions.

**How it knows the trust level:** The orchestrator already writes `operationType` to a workspace meta file (`~/.reeboot/contexts/<id>/workspace/.reeboot_turn_meta.json`) before each prompt (pattern from `token-budget`). Extend this file with a `trust` field:

```json
{ "operationType": "user_message", "trust": "end-user", "turnId": "abc123" }
```

The trust-enforcer reads this file on every `tool_call` event.

**Hook:** `pi.on('tool_call', ...)`. When trust is `end-user`:
- Read the context's tool whitelist from config (`config.contexts[].tools.whitelist`)
- If whitelist is empty → all tools allowed (no restriction configured)
- If whitelist is non-empty → check `event.toolName` against whitelist
- If not in whitelist → `return { block: true, reason: 'Tool "X" is not available in this context' }`

**Violation logging:** When a tool is blocked, emit a violation event to `operational_logs` (via `getLogger().warn()` with component `trust-enforcer`) if `permissions.violations.log` is `true` (default).

**The tool whitelist for `end-user` sessions:** The existing `_toolCallGuard` in `pi-runner.ts` can be removed — the trust-enforcer extension now owns this responsibility. Remove the guard method and the `_toolCallHookRegistered` flag. The `(session as any).on?.('tool_call', ...)` line is removed. The comment about the trust-enforcer is updated to point to the actual extension.

**Config:** Uses existing `config.contexts[].tools.whitelist` and `config.permissions.violations.log`. No new schema fields.

---

## Capability 4: Injection Content Scanner

### Current state

`src/extensions/injection-guard.ts` hooks `before_agent_start` and injects an `<external_content_policy>` block into the system prompt. There is no content scanning — it relies entirely on the LLM following the policy instruction.

Docs say it "scans returned content for patterns" and "flags" injection attempts.

### Design

**Two-layer defense, same as Hermes conceptually but adapted to reeboot:**

```
Layer 1: Content Scanner (NEW)
  ├── Context file scanning at session_start (AGENTS.md, skills, etc.)
  └── Tool output scanning at tool_execution_end (external_source_tools)

Layer 2: External Content Policy (EXISTING, RETAINED)
  └── System prompt instruction via before_agent_start
```

**Shared scanner module:** `src/security/injection-scanner.ts` — a pure function module with no pi dependencies. Both the injection-guard extension and the pi-runner import it.

```ts
export interface ScanResult {
  flagged: boolean;
  patterns: PatternMatch[];
}

export interface PatternMatch {
  pattern: string;       // e.g. 'ignore_prior_instructions'
  location: string;       // line/offset hint
  snippet: string;        // the matched text (truncated)
}

export function scanContent(text: string, trust: MessageTrust): ScanResult;
```

**Detection patterns** (Phase 1 scope, Derived from Hermes's context file scanner):

| Pattern | Detection |
|---|---|
| `ignore_prior` | "ignore (all )?(prior\|previous\|above) instructions", "disregard (all )?(prior\|previous\|above) instructions" |
| `override_mission` | "your (new\|real\|actual) (task\|mission\|goal\|purpose) is", "you are now", "from now on you" |
| `hidden_html` | HTML comments (`<!-- ... -->`) containing "ignore", "instruction", "system", "prompt", "override" |
| `credential_exfil` | "curl" + (".env"\|"credentials"\|".netrc"\|"token"\|"api.key") |
| `zero_width` | `\u200B`, `\u200C`, `\u200D`, `\uFEFF` (zero-width space/non-joiner/joiner/BOM) |
| `bidi_override` | `\u202E` (RIGHT-TO-LEFT OVERRIDE), `\u202D` (LEFT-TO-RIGHT OVERRIDE) |
| `exfil_url` | "curl\|wget" + "POST\|PUT" + ("http://"\|"https://") — attempts to exfiltrate data |

**Scanning locations:**

1. **Context files** (`before_agent_start` in injection-guard extension): scan the content of AGENTS.md, SKILL.md files, and any other context files that are about to be included in the system prompt. If flagged, log a warning and optionally redact the flagged content.

2. **Tool output** (`tool_execution_end` in pi-runner): when a tool listed in `external_source_tools` returns output, scan the result. If flagged:
   - **`trust: "owner"`**: prepend a `[WARNING: Potential prompt injection detected]` banner to the output
   - **`trust: "end-user"`**: replace output with `[BLOCKED: Content from <tool> contained potential prompt injection]` and log a violation

**Why scanning in the runner for tool output?** Pi extensions don't have a post-execution hook for tool calls (`tool_call` fires before execution). The runner already subscribes to `tool_execution_end` events and has access to tool results. Adding a scan call there is minimal.

**Config:** Uses existing `security.injection_guard.external_source_tools` list. The `enabled` flag gates both the scanner and the policy block. No new schema fields.

---

## File Change Map

| File | Change |
|---|---|
| `src/extensions/protected-paths.ts` | Expand path array; resolve absolute paths |
| `src/extensions/confirm-destructive.ts` | Add dangerous command pattern list and `tool_call` handler for bash; keep session event handlers |
| `src/extensions/trust-enforcer.ts` | **New file.** Hook `tool_call`, read trust from workspace meta, enforce whitelist |
| `src/security/injection-scanner.ts` | **New file.** Pure scanContent() function with pattern list |
| `src/extensions/injection-guard.ts` | Import scanner; scan context files in `before_agent_start`; keep existing policy block |
| `src/agent-runner/pi-runner.ts` | Remove `_toolCallGuard`, `_toolCallHookRegistered`, import scanner; scan tool output in `tool_execution_end` handler |
| `src/extensions/loader.ts` | Add trust-enforcer factory (always on, no feature flag needed — it's a no-op when trust is `owner`) |
| `src/orchestrator.ts` | Write `trust` field into workspace meta file alongside `operationType` |
| `docs/security/permission-tiers.md` | Update confirm_destructive description to match actual behavior |
| `tests/extensions/protected-paths.test.ts` | Expand tests for new protected paths |
| `tests/extensions/confirm-destructive.test.ts` | Add dangerous command pattern tests |
| `tests/extensions/trust-enforcer.test.ts` | **New file.** Test tool blocking, whitelist, violation logging |
| `tests/security/injection-scanner.test.ts` | **New file.** Test all patterns, trust tiers |
| `tests/extensions/injection-guard.test.ts` | Add content scanning tests |
| `tests/agent-runner/pi-runner-lifecycle.test.ts` | Add tool output scanning tests |

## Risks

**Injection scanner false positives.** The pattern list is derived from Hermes's proven patterns plus common injection vectors. Risk: legitimate content (e.g. a security blog post about injection) triggers a false positive. Mitigation: `trust: "owner"` gets a warning banner, not a block — the owner can see the content and judge. `trust: "end-user"` gets a block (fail-closed), which is the right posture for untrusted content.

**Dangerous command patterns incomplete.** Phase 1's pattern list covers the most common destructive commands but won't catch everything. Phase 2 (hardline blocklist + tirith-style scanning) fills this gap. Risk: a novel destructive command evades detection. Mitigation: the sandbox provides a second layer of defense (filesystem/network restrictions).

**Trust-enforcer reads workspace meta on every tool_call.** The meta file is read from disk on every tool call. This is fine — file reads of a tiny JSON file are negligible. Alternative (in-memory state with session affinity) would be more complex and harder to test.

**Removing _toolCallGuard from pi-runner breaks tests.** The test mock uses `session.on('tool_call', ...)` to register the guard. After removal, tests that verify tool blocking must use the trust-enforcer extension path.