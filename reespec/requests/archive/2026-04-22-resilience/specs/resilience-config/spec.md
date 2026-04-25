# Spec: resilience-config

## Capability

A `resilience` section in `config.json` controls all resilience behaviours. It is validated by Zod on load and has safe defaults so existing deployments are unaffected.

---

## Scenarios

### Default config parses without resilience section

GIVEN a `config.json` with no `resilience` key  
WHEN `loadConfig()` is called  
THEN the returned config has `resilience.recovery.mode === 'safe_only'`  
AND `resilience.recovery.side_effect_tools` is `[]`  
AND `resilience.scheduler.catchup_window === '1h'`  
AND `resilience.outage_threshold === 3`  
AND `resilience.probe_interval === '1h'`

---

### Full resilience config round-trips cleanly

GIVEN a `config.json` with:
```json
{
  "resilience": {
    "recovery": { "mode": "never", "side_effect_tools": ["send_email"] },
    "scheduler": { "catchup_window": "2h" },
    "outage_threshold": 5,
    "probe_interval": "30m"
  }
}
```
WHEN `loadConfig()` is called  
THEN `resilience.recovery.mode === 'never'`  
AND `resilience.recovery.side_effect_tools` contains `'send_email'`  
AND `resilience.scheduler.catchup_window === '2h'`  
AND `resilience.outage_threshold === 5`  
AND `resilience.probe_interval === '30m'`

---

### Invalid recovery mode is rejected

GIVEN a `config.json` with `resilience.recovery.mode === 'maybe'`  
WHEN `loadConfig()` is called  
THEN a `ZodError` is thrown
