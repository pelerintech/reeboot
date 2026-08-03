/**
 * Spec: events-history-api
 * `GET /api/events` returns curated audit events from the `events` table, mapped
 * to a stable shape with the turn-correlation id extracted.
 * (Socket-free via buildApp + app.request)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, type TestAppHost } from './helpers/test-app.js';

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp();
});

beforeEach(() => {
  // Isolate each test from events inserted by previous tests.
  host.db.exec('DELETE FROM events');
});

afterAll(async () => {
  await host.stop();
  host.cleanup();
});

async function api(path: string, init?: any): Promise<Response> {
  return host.app.request(`http://localhost${path}`, init);
}

function insertEvent(opts: {
  id: string; type: string; severity: number; contextId?: string; channel?: string;
  peerId?: string; payload?: object; traceId?: string; createdNs: number;
}) {
  host.db.prepare(
    `INSERT INTO events (id, type, context_id, channel, peer_id, severity, payload, trace_id, span_id, created_ns)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.id,
    opts.type,
    opts.contextId ?? 'main',
    opts.channel ?? null,
    opts.peerId ?? null,
    opts.severity,
    JSON.stringify(opts.payload ?? {}),
    opts.traceId ?? opts.id.padEnd(32, '0').slice(0, 32),
    opts.id.padEnd(16, '0').slice(0, 16),
    opts.createdNs,
  );
}

describe('GET /api/events', () => {
  it('S1 — returns audit events in chronological order with core fields', async () => {
    insertEvent({ id: 'e1', type: 'turn_started', severity: 9, createdNs: 1, traceId: 'TR1' });
    insertEvent({ id: 'e2', type: 'turn_completed', severity: 9, createdNs: 2, traceId: 'TR1' });
    insertEvent({ id: 'e3', type: 'budget_warning', severity: 13, createdNs: 3, traceId: 'TR2' });

    const res = await api('/api/events');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(body.map((r: any) => r.id)).toEqual(['e1', 'e2', 'e3']);
    const first = body[0];
    expect(first).toHaveProperty('timestamp');
    expect(first).toHaveProperty('type', 'turn_started');
    expect(first).toHaveProperty('level');
    expect(first).toHaveProperty('severity', 9);
    expect(first).toHaveProperty('contextId', 'main');
    expect(first).toHaveProperty('traceId', 'TR1');
  });

  it('S2 — ?level=error excludes lower severities', async () => {
    insertEvent({ id: 'info-evt', type: 'turn_started', severity: 9, createdNs: 100 });
    insertEvent({ id: 'err-evt', type: 'turn_failed', severity: 17, createdNs: 200 });

    const res = await api('/api/events?level=error');
    const body = await res.json();
    expect(body.map((r: any) => r.id)).toEqual(['err-evt']);
  });

  it('S3 — traceId from column, turnId from payload, payload parsed to object', async () => {
    insertEvent({
      id: 't1', type: 'turn_started', severity: 9, createdNs: 300,
      traceId: 'abc123def456abc123def456abc123de',
      payload: { turnId: 'T-123', peerId: 'p1' },
    });

    const res = await api('/api/events');
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].traceId).toBe('abc123def456abc123def456abc123de');
    expect(body[0].turnId).toBe('T-123');
    expect(typeof body[0].payload).toBe('object');
    expect(body[0].payload).toEqual({ turnId: 'T-123', peerId: 'p1' });
  });

  it('S4 — no turn payload → turnId null, traceId present', async () => {
    insertEvent({
      id: 'bw1', type: 'budget_warning', severity: 13, createdNs: 400,
      traceId: 'f0e1d2c3b4a5f0e1d2c3b4a5f0e1d2c3',
      payload: { remaining: 500 },
    });

    const res = await api('/api/events');
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].turnId).toBeNull();
    expect(body[0].traceId).toBe('f0e1d2c3b4a5f0e1d2c3b4a5f0e1d2c3');
  });

  it('S5 — ?context=main isolates by context', async () => {
    insertEvent({ id: 'm1', type: 'turn_started', severity: 9, createdNs: 500, contextId: 'main' });
    insertEvent({ id: 'w1', type: 'turn_started', severity: 9, createdNs: 600, contextId: 'work' });

    const res = await api('/api/events?context=main');
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].contextId).toBe('main');
  });

  it('S6 — ?limit=2 returns most recent N in ascending order', async () => {
    for (let i = 1; i <= 5; i++) {
      insertEvent({ id: `e${i}`, type: 'turn_started', severity: 9, createdNs: 700 + i });
    }

    const res = await api('/api/events?limit=2');
    const body = await res.json();
    expect(body.map((r: any) => r.id)).toEqual(['e4', 'e5']);
  });

  it('S7 — empty table returns []', async () => {
    const res = await api('/api/events?context=zzz-empty-none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
