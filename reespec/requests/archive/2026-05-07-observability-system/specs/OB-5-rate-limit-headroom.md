# OB-5: Rate Limit Headroom

Captures provider rate limit headers per LLM call. Scheduler throttles on retry-after.
Dashboard surfaces headroom.

---

## OB-5-A: after_provider_response captures headers

GIVEN the observability extension is loaded  
WHEN pi fires `after_provider_response` with headers containing `x-ratelimit-remaining-tokens`  
THEN a `rate_limits` row is inserted with `remaining_tokens` parsed from the header  
AND `remaining_requests` is parsed from `x-ratelimit-remaining-requests` if present  
AND `retry_after_ms` is parsed from `retry-after` header if present (converted to ms)  
AND `provider` is the model provider string from config  
AND `recorded_at` is the current timestamp

---

## OB-5-B: Missing headers degrade gracefully

GIVEN the observability extension is loaded  
WHEN pi fires `after_provider_response` with no rate limit headers (e.g. Ollama, local models)  
THEN no `rate_limits` row is inserted  
AND no error is thrown  
AND a `debug` log record notes that no rate limit headers were found

---

## OB-5-C: Warn log when headroom is critically low

GIVEN a `rate_limits` row is inserted  
WHEN `remaining_tokens` is less than 5000 (configurable threshold)  
THEN a `warn` level pino log is emitted: "Rate limit headroom low: N tokens remaining"  
AND an `events` row of type `rate_limit_warning` is inserted with `remaining_tokens` in payload

---

## OB-5-D: Scheduler throttles on retry-after

GIVEN the `rate_limits` table has a recent row with `retry_after_ms` set  
WHEN the scheduler attempts to dispatch a task  
AND `recorded_at + retry_after_ms > now`  
THEN the task is skipped for this tick  
AND a `warn` log record is emitted: "Scheduler task deferred: provider retry-after in effect"  
AND an `events` row of type `scheduler_throttled` is inserted with `task_id` and `retry_after_ms` in payload  
AND the task's `next_run` is updated to `recorded_at + retry_after_ms + buffer`

---

## OB-5-E: Latest rate limit headroom is queryable

GIVEN the `rate_limits` table has rows  
WHEN `getLatestRateLimit(db, provider)` is called  
THEN it returns the most recent row for that provider  
AND returns `null` if no rows exist for that provider
