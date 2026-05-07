import { nanoid } from 'nanoid';
import type { Database } from 'better-sqlite3';
import { getOpenJournals } from '../resilience/turn-journal.js';
import { getLogger } from '../observability/logger.js';
import { emitEvent } from '../observability/events.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionShutdownEvent {
  reason: string;
  contextId?: string;
  targetSessionFile?: string;
  [key: string]: unknown;
}

interface AfterProviderResponseEvent {
  headers?: Record<string, string>;
  contextId?: string;
  provider?: string;
  [key: string]: unknown;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface ObservabilityOptions {
  /** Remaining tokens below which a rate_limit_warning event is emitted. Default: 5000. */
  rateLimitWarnThreshold?: number;
  /** Model provider string from config (e.g. 'anthropic'). Used as the provider field
   * in rate_limits rows so the scheduler can match by the same key. Default: 'unknown'. */
  configProvider?: string;
}

// ─── makeObservabilityExtension ───────────────────────────────────────────────

/**
 * Observability bundled extension.
 * Registers session_shutdown and after_provider_response hooks.
 * Always-on (no feature flag).
 */
export function makeObservabilityExtension(pi: any, db: Database, opts: ObservabilityOptions = {}): void {
  // ── session_shutdown hook ─────────────────────────────────────────────────

  pi.on('session_shutdown', (event: SessionShutdownEvent) => {
    try {
      const contextId = event.contextId ?? 'unknown';
      const sessionPath = event.targetSessionFile ?? null;

      // Check for open turn journal rows (crash evidence)
      const openJournals = getOpenJournals(db);
      const hasOpenTurn = openJournals.length > 0;
      const linkedTurnId = hasOpenTurn ? openJournals[0].turn_id : null;

      // If a turn was open at shutdown, override reason to 'crash'
      const reason = hasOpenTurn ? 'crash' : event.reason;

      const id = nanoid();
      db.prepare(
        `INSERT INTO session_events (id, context_id, reason, session_path, linked_turn_id)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, contextId, reason, sessionPath, linkedTurnId);

      if (hasOpenTurn) {
        getLogger().warn(
          { component: 'observability', contextId, linkedTurnId },
          `[observability] Session shutdown with open turn — crash detected (turn: ${linkedTurnId})`
        );
      } else {
        getLogger().info(
          { component: 'observability', contextId, reason },
          `[observability] Session shutdown: ${reason}`
        );
      }
    } catch (err) {
      getLogger().error({ component: 'observability', err }, '[observability] Failed to record session_shutdown');
    }
  });

  // ── after_provider_response hook ──────────────────────────────────────────

  pi.on('after_provider_response', (event: AfterProviderResponseEvent) => {
    try {
      const headers = event.headers ?? {};
      const remainingTokens = headers['x-ratelimit-remaining-tokens']
        ? parseInt(headers['x-ratelimit-remaining-tokens'], 10)
        : null;
      const remainingRequests = headers['x-ratelimit-remaining-requests']
        ? parseInt(headers['x-ratelimit-remaining-requests'], 10)
        : null;
      const retryAfterRaw = headers['retry-after'];
      const retryAfterMs = retryAfterRaw ? parseRetryAfter(retryAfterRaw) : null;

      // Only insert if at least one rate limit header was found
      if (remainingTokens === null && remainingRequests === null && retryAfterMs === null) {
        getLogger().debug({ component: 'observability' }, '[observability] No rate limit headers found in provider response');
        return;
      }

      const id = nanoid();
      const contextId = event.contextId ?? 'unknown';
      // Use the provider from config (passed via opts), not from the event field.
      // The scheduler queries rate_limits using the same config provider string,
      // so both sides must agree on the key.
      const provider = opts.configProvider ?? 'unknown';

      db.prepare(
        `INSERT INTO rate_limits (id, context_id, provider, remaining_tokens, remaining_requests, retry_after_ms)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, contextId, provider, remainingTokens, remainingRequests, retryAfterMs);

      // Warn when headroom is critically low
      const LOW_TOKENS_THRESHOLD = opts.rateLimitWarnThreshold ?? 5000;
      if (remainingTokens !== null && remainingTokens < LOW_TOKENS_THRESHOLD) {
        getLogger().warn(
          { component: 'observability', remaining_tokens: remainingTokens, provider },
          `Rate limit headroom low: ${remainingTokens} tokens remaining`
        );
        // Also emit an audit event so it appears in the events table
        emitEvent(db, {
          type: 'rate_limit_warning',
          contextId,
          severity: 13, // WARN
          payload: { remaining_tokens: remainingTokens, provider },
        }).catch(() => {});
      }
    } catch (err) {
      getLogger().error({ component: 'observability', err }, '[observability] Failed to record rate limit');
    }
  });
}

// ─── getLatestRateLimit ───────────────────────────────────────────────────────

export interface RateLimitRow {
  id: string;
  context_id: string;
  provider: string;
  remaining_tokens: number | null;
  remaining_requests: number | null;
  retry_after_ms: number | null;
  recorded_at: string;
}

/**
 * Returns the most recent rate_limits row for the given provider, or null.
 * Returns null gracefully if the rate_limits table does not exist yet.
 */
export function getLatestRateLimit(db: Database, provider: string): RateLimitRow | null {
  try {
    return (
      db.prepare(
        `SELECT * FROM rate_limits WHERE provider = ? ORDER BY recorded_at DESC LIMIT 1`
      ).get(provider) as RateLimitRow | undefined
    ) ?? null;
  } catch {
    // Table may not exist if observability migration hasn't run yet
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse retry-after header to milliseconds.
 * Accepts either a delay-seconds integer or an HTTP-date string.
 */
function parseRetryAfter(value: string): number {
  const secs = parseFloat(value);
  if (!isNaN(secs)) {
    return Math.round(secs * 1000);
  }
  // HTTP-date format
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return 0;
}
