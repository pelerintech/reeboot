import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Logs from '../Logs';

let esInstances: MockEventSource[] = [];

class MockEventSource {
  url: string;
  onopen: any;
  onmessage: any;
  onerror: any;
  constructor(url: string) { this.url = url; esInstances.push(this); }
  close() {}
}

beforeEach(() => {
  esInstances = [];
  (globalThis as any).EventSource = MockEventSource as any;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).EventSource;
});

// A minimal audit event shape returned by GET /api/events
function ev(opts: {
  id: string; type: string; traceId: string; severity?: number; level?: string;
  contextId?: string; turnId?: string | null; payload?: any; timestamp?: string;
}) {
  return {
    id: opts.id,
    timestamp: opts.timestamp ?? '2026-07-17 09:00:00',
    type: opts.type,
    level: opts.level ?? 'info',
    severity: opts.severity ?? 9,
    contextId: opts.contextId ?? 'main',
    channel: null,
    peerId: null,
    traceId: opts.traceId,
    turnId: opts.turnId ?? null,
    payload: opts.payload ?? {},
  };
}

describe('Activity page — turn rollup (S1–S5)', () => {
  it('S1 — seeds from /api/events on mount and renders a turn entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [ev({ id: 'e1', type: 'turn_started', traceId: 'TR1', turnId: 'T1' })],
    });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/events?level=info'));
    // Not /api/logs
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).startsWith('/api/logs?'))).toBe(true);
    // A turn entry for the seeded event is rendered (turn card shows the type)
    await waitFor(() => expect(screen.getByText(/turn_started/i)).toBeInTheDocument());
  });

  it('S2 — two events same traceId group into one turn with status "completed"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        ev({ id: 'e1', type: 'turn_started', traceId: 'TR1', turnId: 'T1' }),
        ev({ id: 'e2', type: 'turn_completed', traceId: 'TR1', turnId: 'T1', level: 'info', severity: 9 }),
      ],
    });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    await waitFor(() => expect(screen.getAllByText(/completed/i).length).toBeGreaterThanOrEqual(1));
    // Exactly one turn card (grouped), not two separate top-level rows
    expect(screen.getAllByText(/Turn /i).length).toBe(1);
  });

  it('S3 — a failed turn shows the failure reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        ev({ id: 'e1', type: 'turn_started', traceId: 'TR2', turnId: 'T2' }),
        ev({
          id: 'e2', type: 'turn_failed', traceId: 'TR2', turnId: 'T2',
          level: 'error', severity: 17, payload: { reason: 'provider timeout' },
        }),
      ],
    });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    await waitFor(() => expect(screen.getAllByText(/failed/i).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText(/provider timeout/i)).toBeInTheDocument();
  });

  it('S4 — a non-turn event renders as a standalone system entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        ev({ id: 'bw1', type: 'budget_warning', traceId: 'TR3', turnId: null, level: 'warn', severity: 13 }),
      ],
    });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    // Standalone entry shows the event type
    await waitFor(() => expect(screen.getAllByText(/budget_warning/i).length).toBeGreaterThanOrEqual(1));
    // No turn card header and no turn status badge
    expect(screen.queryByText(/Turn /i)).not.toBeInTheDocument();
    expect(screen.queryByText('completed')).not.toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
    expect(screen.queryByText('running')).not.toBeInTheDocument();
  });

  it('S5 — changing the level filter refetches /api/events?level=error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/events?level=info'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'error' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/events?level=error'));
  });
});

describe('Activity page — live SSE tail (S6–S7)', () => {
  it('S6 — a live audit turn_completed merges into the seeded turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [ev({ id: 'e1', type: 'turn_started', traceId: 'TR1', turnId: 'T1' })],
    });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    // Seeded turn is "running" (only turn_started) — no completed badge yet
    await waitFor(() => expect(screen.getAllByText(/Turn /i).length).toBe(1));
    expect(screen.queryByText('completed')).not.toBeInTheDocument();
    // Simulate a live audit record arriving over the EventSource
    esInstances[0]?.onmessage?.({
      data: JSON.stringify({
        component: 'audit', msg: 'turn_completed', trace_id: 'TR1', level: 30,
        time: Date.now(), payload: { turnId: 'T1' },
      }),
    });
    // The TR1 turn updates to status "completed"
    await waitFor(() => expect(screen.queryByText('completed')).not.toBeNull());
  });

  it('S7 — a non-audit live record is ignored by the Activity view', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [ev({ id: 'e1', type: 'turn_started', traceId: 'TR1', turnId: 'T1' })],
    });
    globalThis.fetch = fetchMock as any;
    render(<Logs />);
    await waitFor(() => expect(screen.getAllByText(/Turn /i).length).toBe(1));
    const beforeCount = screen.getAllByText(/turn_started/i).length;
    // Simulate a non-audit (raw pino) record arriving over the EventSource
    esInstances[0]?.onmessage?.({
      data: JSON.stringify({
        component: 'scheduler', msg: 'poll fired', level: 30, time: Date.now(),
      }),
    });
    // Allow any async state to settle
    await new Promise((r) => setTimeout(r, 50));
    // The scheduler record is NOT rendered as a turn or entry
    expect(screen.queryByText(/poll fired/i)).not.toBeInTheDocument();
    // turn_started count unchanged (no new entry added)
    expect(screen.getAllByText(/turn_started/i).length).toBe(beforeCount);
  });
});
