# Supply Chain Scanning

Reeboot scans installed npm packages at startup against a curated catalog of known-compromised versions. Results are surfaced in operational logs and via `reeboot doctor`.

## How It Works

1. At startup, reeboot reads `package-lock.json` and extracts installed package versions.
2. Each package is checked against `src/security/advisories.json` — a curated catalog of known-compromised packages.
3. If an installed version matches an advisory range, a warning is logged and a banner is printed to stdout.

## Advisory Catalog

The catalog (`src/security/advisories.json`) contains entries for known supply-chain incidents:

```json
[
  {
    "id": "ADV-2026-001",
    "package": "compromised-lib",
    "version": ">=1.0.0 <2.0.0",
    "description": "This package contains malicious code.",
    "remediation": "Upgrade to 2.0.0 or remove the package.",
    "date": "2026-01-15"
  }
]
```

Each advisory has a stable `id` for acknowledging and tracking.

## Startup Behavior

When advisories match installed packages:

- A `warn`-level log entry is written to `operational_logs`
- A banner is printed to stdout:  
  `⚠ Package 'compromised-lib' v1.2.3 matches advisory ADV-2026-001. Run 'reeboot doctor' for details.`

If `advisories.json` is missing (e.g., in development), the scan gracefully degrades — no crash, no misleading output.

## `reeboot doctor`

`reeboot doctor` shows all active advisories with full details:

```
⚠ Advisories:
ADV-2026-001 — compromised-lib v1.2.3: Malicious code detected.
   Fix: Upgrade to 2.0.0 or remove the package.
   Acknowledge: reeboot doctor --ack ADV-2026-001
```

Acknowledged advisories show a `[ACKED]` marker.

## Acknowledging Advisories

```bash
reeboot doctor --ack ADV-2026-001
```

This adds the advisory ID to `config.security.advisories.acked_advisories`. Acknowledged advisories:

- Do **not** re-alert on restart (no operational_logs warning, no stdout banner)
- Still appear in `reeboot doctor` output (with `[ACKED]` marker)
- Can be tracked for compliance/audit purposes

## Configuration

```json
{
  "security": {
    "advisories": {
      "acked_advisories": ["ADV-2026-001"]
    }
  }
}
```

## Design Decisions

- **Curated catalog, not live API:** No network dependency at startup. The catalog ships with reeboot releases.
- **Critical advisories in patch releases:** High-severity incidents can be added and shipped immediately.
- **No auto-update:** The operator controls when to acknowledge and remediate. This is a visibility tool, not an auto-blocker.