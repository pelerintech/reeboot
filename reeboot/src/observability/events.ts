import { nanoid } from 'nanoid';
import { randomBytes } from 'crypto';
import type { Database } from 'better-sqlite3';
import { emitLogRecord } from './sse-emitter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEventInput {
  type: string;
  contextId?: string;
  channel?: string;
  peerId?: string;
  severity: number;          // OTEL: 9=INFO, 13=WARN, 17=ERROR, 21=FATAL
  payload?: Record<string, unknown>;
  traceId?: string;          // propagate from parent turn if available
  spanId?: string;
}

// ─── emitEvent ───────────────────────────────────────────────────────────────

/**
 * Inserts an OTEL-ready audit event into the `events` table.
 * Also broadcasts the record to all SSE subscribers via sseEmitter.
 */
export async function emitEvent(db: Database, event: AuditEventInput): Promise<void> {
  const id = nanoid();
  const traceId = event.traceId ?? randomBytes(16).toString('hex');  // 32-char hex
  const spanId = event.spanId ?? randomBytes(8).toString('hex');     // 16-char hex
  const createdNs = BigInt(Date.now()) * 1_000_000n;                 // ms → ns
  const payloadStr = JSON.stringify(event.payload ?? {});

  db.prepare(
    `INSERT INTO events (id, type, context_id, channel, peer_id, severity, payload, trace_id, span_id, created_ns)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    event.type,
    event.contextId ?? null,
    event.channel ?? null,
    event.peerId ?? null,
    event.severity,
    payloadStr,
    traceId,
    spanId,
    Number(createdNs),
  );

  // Fan out to SSE stream so audit events appear in live log view
  emitLogRecord({
    level: _otelSeverityToPinoLevel(event.severity),
    msg: event.type,
    component: 'audit',
    context_id: event.contextId,
    trace_id: traceId,
    span_id: spanId,
    payload: event.payload,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _otelSeverityToPinoLevel(severity: number): number {
  if (severity >= 21) return 60; // fatal
  if (severity >= 17) return 50; // error
  if (severity >= 13) return 40; // warn
  return 30;                     // info
}
