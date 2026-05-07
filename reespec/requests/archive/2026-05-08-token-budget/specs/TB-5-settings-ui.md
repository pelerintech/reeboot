# TB-5: Settings Tab UI

Minimal Settings tab in the webchat for configuring and viewing global budget limits.

---

## TB-5-A: Settings tab exists in the webchat

GIVEN the webchat is open  
WHEN the user clicks the "Settings" tab  
THEN a settings view is shown  
AND it contains a "Budget" section with fields for:
  daily limit (tokens and/or USD), session limit, turn limit, warn threshold

---

## TB-5-B: Current spend is shown alongside limits

GIVEN `config.budget.daily_cost_usd = 10.0`  
AND today's `usage` table shows $2.84 spent  
WHEN the Settings tab Budget section is visible  
THEN it shows "Daily: $2.84 / $10.00" with a progress bar or indicator  
AND updates when the page is loaded (not real-time)

---

## TB-5-C: Saving budget limits updates config and takes effect

GIVEN the user changes "Daily cost limit" to $15.00 and clicks Save  
WHEN `PUT /api/settings/budget` is called with `{ daily_cost_usd: 15.0 }`  
THEN the server merges the value into `config.json` and saves  
AND the in-memory `BudgetGuard` config is updated immediately  
AND the Settings tab confirms "Budget settings saved"  
AND the next `BudgetGuard.check()` uses the new limit

---

## TB-5-D: GET /api/settings/budget returns current config and spend

GIVEN the server is running  
WHEN `GET /api/settings/budget` is called  
THEN it returns:
```json
{
  "limits": { "daily_cost_usd": 10.0, "warn_threshold": 0.8, ... },
  "spend": {
    "today_cost_usd": 2.84,
    "today_tokens": 188000,
    "session_cost_usd": 1.20,
    "session_tokens": 65000
  }
}
```
