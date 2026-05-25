# Design — security-hermes-parity

## Seven capabilities built on Phase 1

Phase 2 layers Hermes-parity features on top of Phase 1's foundational dangerous command detection and injection scanning. Each capability is independent in implementation but they form a cohesive defense-in-depth model together.

---

## Capability 1: Approval Modes + YOLO

### Current state (post-Phase 1)

`confirm-destructive` detects dangerous bash commands and blocks them outright. No approval path exists — legitimately dangerous commands (database migrations, system updates) can't be run even by the owner.

### Design

**Config:** New field `security.dangerous_commands` in config schema:

```json
{
  "security": {
    "dangerous_commands": {
      "mode": "deny",
      "yolo": false,
      "timeout": 60
    }
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `"deny"` \| `"manual"` \| `"smart"` \| `"off"` | `"deny"` | Approval strategy for dangerous commands |
| `yolo` | boolean | `false` | Auto-approve all non-hardline dangerous commands |
| `timeout` | number | `60` | Seconds to wait for approval response |

**Modes:**

```
deny (Phase 1 default, unchanged)
  └── Block all dangerous commands. No approval path.

manual
  ├── CLI (hasUI): ctx.ui.confirm("Dangerous command: rm -rf ... Allow?")
  └── Messaging (headless): block the command, send approval
      request to user via channel, agent reports "awaiting approval"
      → On next turn, if user replied "yes"/"approve", command
      is auto-approved for this session

smart
  └── Quick LLM call assessing risk:
      Low risk  → auto-approve (e.g., "rm -rf ./node_modules")
      Medium    → escalate to manual
      High risk → auto-deny (e.g., "rm -rf / --no-preserve-root")

off
  └── Log dangerous commands but never block. Only hardline
      blocklist still applies.
```

**YOLO mode:** A per-session toggle. When active, all dangerous commands auto-approved EXCEPT hardline blocklist.
- CLI: `/yolo` slash command toggles on/off
- Messaging: user sends "yolo" message
- Env: `REBOOT_YOLO_MODE=1` pre-activates for the session
- Status bar shows `⚡ YOLO` indicator when active

**Smart mode LLM call:** A lightweight structured output call:
- Prompt: "Assess the risk of this command: <cmd>. Categories: low (safe, no harm), medium (potentially destructive but contextually reasonable), high (catastrophic or clearly malicious). Respond with ONLY the category and a one-sentence reason."
- Uses the same provider/model as the agent (or a cheaper model if configured)
- Timeout: 5s (fallback to manual on timeout)
- Results are cached per command pattern for the session

### Implementation approach

Extend `confirm-destructive.ts`:
- Replace `DANGEROUS_PATTERNS` with a two-tier system: `HARDLINE_PATTERNS` (checked first, no override) and `DANGEROUS_PATTERNS` (approvable)
- Add mode-specific behavior after pattern match
- Manual mode: block with reason + wait for approval via a state file (`~/.reeboot/contexts/<id>/workspace/.pending_approval.json`)
- Smart mode: call `assessRisk(command)` function
- YOLO: skip pattern check (except hardline), log "YOLO: auto-approved"

---

## Capability 2: Hardline Blocklist

### Design

A separate pattern list checked BEFORE the dangerous command patterns and BEFORE the approval mode. If a hardline pattern matches, the command is blocked with no override.

**Hardline patterns** (derived from Hermes):

```
Pattern                          Why irreversible
────────────────────────────────────────────────────
rm -rf /                         Wipes filesystem root
rm -rf --no-preserve-root /      Explicit root wipe
:(){ :|:& };:                    Bash fork bomb
mkfs.* on mounted root           Formats live system
dd if=/dev/zero of=/dev/sd*      Zeroes physical disk
> /dev/sd[a-z]                   Direct block device write
chmod 000 /                      Removes all permissions from root
> /etc/passwd                     Overwrites user database
iptables -F && iptables -P       Flushes firewall + denies all
```

The hardline list is stored separately and checked first in the `tool_call` handler. When matched, the response is always `{ block: true, reason: "This command is permanently blocked (hardline)" }` — no approval path, no YOLO override.

---

## Capability 3: SSRF Protection

### Design

**New module:** `src/security/ssrf-guard.ts`

```ts
export async function isUrlSafe(url: string): Promise<{ safe: boolean; reason?: string }>;
```

**Blocked destinations:**
- Private networks (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Loopback: `127.0.0.0/8`, `::1`
- Link-local: `169.254.0.0/16` (includes cloud metadata `169.254.169.254`)
- CGNAT / shared address space (RFC 6598): `100.64.0.0/10`
- Cloud metadata hostnames: `metadata.google.internal`, `metadata.goog`
- Reserved, multicast, unspecified addresses

**Resolution:** Resolve hostname via `dns.lookup()` (uses system resolver). Check resolved IPs against blocked ranges. Fail-closed: if DNS fails, block the URL.

**Redirect re-validation:** If the HTTP client follows redirects, each redirect target is re-checked.

**Config:** `security.allow_private_urls: boolean` (default `false`). When `true`, SSRF checks are disabled (deliberate trust boundary expansion for home-network setups, local Ollama endpoints, etc.).

**Integration points:**
- `web_search` tool: validate search result URLs before fetching page content
- `web_fetch` / `fetch_url` tool: validate target URL before fetch
- `browser_navigate` (if present): validate URL before navigation

The integration is done by wrapping the existing fetch/URL-resolution logic in each tool with a call to `isUrlSafe()`. Tools return `{ error: "URL blocked by SSRF policy: <reason>" }` when a URL fails validation.

---

## Capability 4: Website Blocklist

### Design

**Config:** `security.website_blocklist`

```json
{
  "security": {
    "website_blocklist": {
      "enabled": false,
      "domains": ["*.internal.company.com", "admin.example.com"]
    }
  }
}
```

**Matching:** Simple glob matching. `*.example.com` matches `sub.example.com` and `deep.sub.example.com`. `example.com` matches exactly `example.com`.

**Integration:** Checked in the same places as SSRF. Both SSRF and blocklist must pass for a URL to be fetchable. Blocklist is checked first (cheaper — no DNS resolution).

**Error message:** `"URL blocked by website policy: domain 'admin.example.com' is in the blocklist"`

---

## Capability 5: MCP Credential Filtering

### Design

**Two changes to `mcp-manager.ts`:**

**A) Environment variable filtering:**
Currently passes `{ ...process.env, ...serverCfg.env }` to MCP subprocesses. Change to:

```ts
const SAFE_ENV_VARS = [
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'SHELL', 'TMPDIR',
];
// Plus any XDG_* vars
const safeEnv: Record<string, string> = {};
for (const [key, val] of Object.entries(process.env)) {
  if (SAFE_ENV_VARS.includes(key) || key.startsWith('XDG_')) {
    safeEnv[key] = val!;
  }
}
// Plus explicitly configured env from MCP server config
const env = { ...safeEnv, ...serverCfg.env };
```

**B) Credential redaction in error messages:**

Before returning MCP tool call results to the LLM, scan error text for credential patterns and replace matches with `[REDACTED]`:

```
Pattern                          Replacement
────────────────────────────────────────────────────
ghp_[A-Za-z0-9]{36}            [REDACTED-GITHUB-TOKEN]
sk-[A-Za-z0-9]{32,}            [REDACTED-OPENAI-KEY]
Bearer [A-Za-z0-9._\-]+        Bearer [REDACTED]
token=[^&\s]{8,}               token=[REDACTED]
key=[^&\s]{8,}                 key=[REDACTED]
API_KEY=[^&\s]{8,}            API_KEY=[REDACTED]
password=[^&\s]+               password=[REDACTED]
secret=[^&\s]+                 secret=[REDACTED]
```

This happens in the `mcp` proxy tool's `execute()` method, AFTER the MCP call and BEFORE returning the result to the agent.

---

## Capability 6: Supply Chain Scanning

### Design

**New module:** `src/security/advisory-scanner.ts`

```ts
export interface Advisory {
  id: string;           // stable advisory ID
  package: string;      // npm package name
  version: string;      // affected version range (semver)
  description: string;  // what happened
  remediation: string;  // how to fix (2-4 steps)
  date: string;         // when discovered
}

export function scanDependencies(lockfilePath: string): Advisory[];
```

**Catalog:** A curated JSON file `src/security/advisories.json` shipped with reeboot. Contains entries for known-compromised npm packages (supply chain worms, poisoned releases, typosquats with malicious code).

**Startup check:** Called in `bootstrap.ts` after DB init. Reads `package-lock.json` from the reeboot package root. If any advisory matches an installed version:
- Logs to `operational_logs` at `warn` level
- Prints a one-line banner to stdout: `⚠ Package 'foo' v1.2.3 matches advisory FOO-2026-001. Run 'reeboot doctor' for details.`

**`reeboot doctor` command:** Surfaces all active advisories with full descriptions and remediation steps. Tags each advisory with a stable ID. Once acknowledged:

```
reeboot doctor --ack FOO-2026-001
```

The ack is persisted to `config.security.acked_advisories` (string array). Acknowledged advisories don't re-alert on restart but are still listed in doctor output.

**Why a curated catalog and not live API?** No network dependency at startup. The catalog is maintained as part of reeboot releases. Critical advisories can be shipped in patch releases.

---

## Capability 7: Approval Timeout

### Design

Configured via `security.dangerous_commands.timeout` (seconds, default 60).

**Manual mode (CLI):** The `ctx.ui.confirm()` call passes a timeout option. If the user doesn't respond within the timeout, the command is denied.

**Manual mode (messaging):** The approval request sent to the user's channel includes a timeout. If no reply ("yes"/"no"/"approve"/"deny") is received within the timeout window, the pending approval is cleared and the command is denied. The agent reports "Approval timed out" on the next turn.

**Implementation:** The pending approval state file (`.pending_approval.json`) includes a `created_at` timestamp. When the user's next message arrives, the approval handler checks if the approval is still within the timeout window. If expired, it's treated as a denial.

---

## Config Schema Changes

```ts
// New top-level config sections
const DangerousCommandsSchema = z.object({
  mode: z.enum(['deny', 'manual', 'smart', 'off']).default('deny'),
  yolo: z.boolean().default(false),
  timeout: z.number().int().min(5).max(3600).default(60),
});

const WebsiteBlocklistSchema = z.object({
  enabled: z.boolean().default(false),
  domains: z.array(z.string()).default([]),
});

const AdvisoryConfigSchema = z.object({
  acked_advisories: z.array(z.string()).default([]),
});

// Extended SecurityConfigSchema
const SecurityConfigSchema = z.object({
  injection_guard: InjectionGuardConfigSchema.default({}),
  dangerous_commands: DangerousCommandsSchema.default({}),
  website_blocklist: WebsiteBlocklistSchema.default({}),
  allow_private_urls: z.boolean().default(false),
  advisories: AdvisoryConfigSchema.default({}),
});
```

## File Change Map

| File | Change |
|---|---|
| `src/extensions/confirm-destructive.ts` | Add hardline patterns, approval modes, YOLO toggle, smart mode LLM call, approval state file |
| `src/security/ssrf-guard.ts` | **New file.** `isUrlSafe()` with IP range checks |
| `src/extensions/web-search.ts` | Add SSRF + blocklist check before fetch |
| `src/extensions/...` (URL-capable tools) | Add SSRF + blocklist check |
| `src/extensions/mcp-manager.ts` | Filter env vars, redact credentials in errors |
| `src/security/advisory-scanner.ts` | **New file.** `scanDependencies()` |
| `src/security/advisories.json` | **New file.** Curated npm advisory catalog |
| `src/bootstrap.ts` | Call `scanDependencies()` at startup |
| `src/config.ts` | Add new config schema sections |
| `src/doctor.ts` (or equivalent) | Show advisory details, support `--ack` |
| `docs/security/` | New pages or updated pages for approval modes, SSRF, blocklist, supply chain |

## Risks

**Smart mode LLM call adds latency.** Every dangerous command triggers a 2-5s LLM call. Mitigation: cache results per command pattern within the session. Common patterns (e.g., `rm -rf ./node_modules`) only assessed once.

**SSRF protection breaks legitimate internal tool use.** Users with local Ollama endpoints or internal wikis would have their URLs blocked. Mitigation: `security.allow_private_urls: true` provides an explicit opt-out with a clear warning.

**MCP credential filtering breaks servers that need non-standard env vars.** Some MCP servers expect `GITHUB_TOKEN`, `NPM_TOKEN`, etc. Mitigation: operators configure these explicitly in the MCP server's `env` config — they're always passed through.

**Supply chain catalog maintenance burden.** Requires updating advisories.json for new npm incidents. Mitigation: the catalog is small (major incidents only), lives in the repo, and ships with releases. Critical advisories can be added in patch releases.