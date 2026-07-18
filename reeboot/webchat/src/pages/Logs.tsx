import { useState, useEffect, useRef, useCallback } from 'react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** An audit event as returned by GET /api/events. */
interface AuditEvent {
  id: string;
  timestamp: string;
  type: string;
  level: LogLevel;
  severity: number;
  contextId: string | null;
  channel: string | null;
  peerId: string | null;
  traceId: string | null;
  turnId: string | null;
  payload: Record<string, unknown>;
}

/** A group of events sharing a traceId (a turn iff it contains a turn_* event). */
interface TurnGroup {
  traceId: string;
  events: AuditEvent[];
  isTurn: boolean;
  status: 'completed' | 'failed' | 'running' | 'system';
  reason?: string;
}

interface LogsProps {
  onIncrementErrorBadge?: () => void;
}

const levelColors: Record<LogLevel, string> = { debug: 'text-zinc-400', info: 'text-zinc-600', warn: 'text-yellow-600', error: 'text-red-600', fatal: 'text-red-700 font-bold' };
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 3000;

/** Group audit events by traceId into turn cards / standalone entries. */
function groupByTrace(events: AuditEvent[]): TurnGroup[] {
  const byTrace = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const key = e.traceId ?? e.id; // standalone events (no traceId) get their own group
    const arr = byTrace.get(key) ?? [];
    arr.push(e);
    byTrace.set(key, arr);
  }
  const groups: TurnGroup[] = [];
  for (const [traceId, evs] of byTrace) {
    // Sort member events chronologically by timestamp (then id for stability)
    evs.sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.id < b.id ? -1 : 1);
    const isTurn = evs.some((e) => e.type.startsWith('turn_'));
    let status: TurnGroup['status'] = 'system';
    let reason: string | undefined;
    if (isTurn) {
      const failed = evs.find((e) => e.type === 'turn_failed');
      const completed = evs.find((e) => e.type === 'turn_completed');
      if (failed) {
        status = 'failed';
        reason = (failed.payload?.reason as string | undefined) ?? undefined;
      } else if (completed) {
        status = 'completed';
      } else {
        status = 'running';
      }
    }
    groups.push({ traceId, events: evs, isTurn, status, reason });
  }
  // Order groups by their earliest event timestamp
  groups.sort((a, b) => {
    const at = a.events[0]?.timestamp ?? '';
    const bt = b.events[0]?.timestamp ?? '';
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
  return groups;
}

const statusBadge: Record<TurnGroup['status'], string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  running: 'bg-yellow-100 text-yellow-700',
  system: 'bg-zinc-100 text-zinc-600',
};

export default function Logs({ onIncrementErrorBadge }: LogsProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('info');
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scroll = useCallback(() => { if (autoScrollRef.current && containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight; }, []);
  useEffect(() => { scroll(); }, [events, scroll]);
  useEffect(() => {
    const c = containerRef.current; if (!c) return;
    const h = () => { autoScrollRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 50; };
    c.addEventListener('scroll', h); return () => c.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    retryCountRef.current = 0;
    setFailed(false);
    let es: EventSource | null = null;
    let closed = false;

    // Seed audit history from /api/events (not /api/logs)
    fetch(`/api/events?level=${filterLevel}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AuditEvent[]) => { if (!closed) setEvents(rows); })
      .catch(() => { /* ignore */ });

    const connect = () => {
      if (closed) return;
      es?.close();
      es = new EventSource(`/api/logs/stream?level=${filterLevel}`);

      es.onopen = () => {
        if (closed) return;
        setStatus('connected');
        setFailed(false);
        retryCountRef.current = 0;
      };

      es.onmessage = (e: MessageEvent) => {
        if (closed) return;
        try {
          const record: any = JSON.parse(e.data);
          // Activity view only shows audit events; ignore non-audit pino records
          if (record.component !== 'audit') return;
          const auditEvent: AuditEvent = {
            id: record.id ?? `${record.trace_id ?? ''}-${record.msg ?? ''}-${Date.now()}`,
            timestamp: record.time ? new Date(record.time).toISOString().replace('T', ' ').slice(0, 19) : new Date().toISOString().replace('T', ' ').slice(0, 19),
            type: record.msg ?? 'event',
            level: (record.level >= 50 ? 'error' : record.level >= 40 ? 'warn' : 'info') as LogLevel,
            severity: record.severity ?? (record.level >= 50 ? 17 : record.level >= 40 ? 13 : 9),
            contextId: record.context_id ?? record.contextId ?? null,
            channel: record.channel ?? null,
            peerId: record.peer_id ?? record.peerId ?? null,
            traceId: record.trace_id ?? record.traceId ?? null,
            turnId: record.payload?.turnId ?? null,
            payload: record.payload ?? {},
          };
          if (auditEvent.level === 'error' || auditEvent.level === 'fatal') {
            onIncrementErrorBadge?.();
          }
          if (!paused) {
            setEvents((p) => [...p.slice(-500), auditEvent]);
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        if (closed) return;
        if (retryCountRef.current >= MAX_RETRIES) {
          setStatus('disconnected');
          setFailed(true);
          if (es) es.close();
        } else {
          setStatus('reconnecting');
          retryCountRef.current++;
          if (es) es.close();
          retryTimerRef.current = setTimeout(connect, RETRY_INTERVAL);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      es?.close();
    };
  }, [filterLevel, paused, onIncrementErrorBadge]);

  const handleRetry = useCallback(() => {
    retryCountRef.current = 0;
    setFailed(false);
    const es = new EventSource(`/api/logs/stream?level=${filterLevel}`);
    es.onopen = () => setStatus('connected');
    es.onmessage = (e: MessageEvent) => {
      if (!paused) {
        try {
          const record: any = JSON.parse(e.data);
          if (record.component !== 'audit') return;
          setEvents((p) => [...p.slice(-500), {
            id: record.id ?? `${record.trace_id ?? ''}-${record.msg ?? ''}-${Date.now()}`,
            timestamp: record.time ? new Date(record.time).toISOString().replace('T', ' ').slice(0, 19) : new Date().toISOString().replace('T', ' ').slice(0, 19),
            type: record.msg ?? 'event',
            level: (record.level >= 50 ? 'error' : record.level >= 40 ? 'warn' : 'info') as LogLevel,
            severity: record.severity ?? (record.level >= 50 ? 17 : record.level >= 40 ? 13 : 9),
            contextId: record.context_id ?? record.contextId ?? null,
            channel: record.channel ?? null,
            peerId: record.peer_id ?? record.peerId ?? null,
            traceId: record.trace_id ?? record.traceId ?? null,
            turnId: record.payload?.turnId ?? null,
            payload: record.payload ?? {},
          }]);
        } catch {}
      }
    };
    es.onerror = () => setStatus('reconnecting');
  }, [filterLevel, paused]);

  const groups = groupByTrace(events);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${status === 'connected' ? 'bg-emerald-100 text-emerald-700' : status === 'reconnecting' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            {status === 'connected' ? 'Connected' : status === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value as LogLevel)} className="bg-zinc-50 text-zinc-700 text-xs rounded-lg px-2 py-1 border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300">
            <option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option><option value="fatal">Fatal</option>
          </select>
          <button onClick={() => setPaused((p) => !p)} className={`text-xs px-3 py-1 rounded-lg transition-colors ${paused ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'}`}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
      {failed && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-3">
          <span>⚠ Failed to connect to audit stream</span>
          <button onClick={handleRetry} className="ml-auto rounded-lg bg-red-600 text-white px-3 py-1 text-xs hover:bg-red-700 transition-colors whitespace-nowrap">Retry</button>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto font-mono text-xs">
        {groups.length === 0 ? <div className="flex items-center justify-center h-full"><p className="text-zinc-400">Waiting for activity…</p></div> : (
          <div className="py-1">
            {groups.map((g) => (
              <div key={g.traceId} className="px-4 py-2 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">{g.events[0] ? new Date(g.events[0].timestamp.replace(' ', 'T') + 'Z').toLocaleTimeString() : ''}</span>
                  {g.isTurn && (
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${statusBadge[g.status]}`}>{g.status}</span>
                  )}
                  <span className={`font-semibold ${g.isTurn ? 'text-zinc-800' : 'text-zinc-500'}`}>{g.isTurn ? `Turn ${g.traceId.slice(0, 8)}` : g.events[0]?.type}</span>
                  {g.isTurn && g.events[0]?.contextId && <span className="text-zinc-400">[{g.events[0].contextId}]</span>}
                </div>
                {g.isTurn && g.status === 'failed' && g.reason && (
                  <div className="mt-1 ml-6 text-red-600">reason: {g.reason}</div>
                )}
                <div className="mt-1 ml-4">
                  {g.events.map((e) => (
                    <div key={e.id} className="py-0.5 flex items-center gap-2">
                      <span className="text-zinc-400">{new Date(e.timestamp.replace(' ', 'T') + 'Z').toLocaleTimeString()}</span>
                      <span className={`uppercase text-[10px] font-bold ${levelColors[e.level] || 'text-zinc-500'}`}>[{e.level}]</span>
                      <span className={` ${levelColors[e.level] || 'text-zinc-600'}`}>{e.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 py-1 border-t border-zinc-200 text-xs text-zinc-400">{events.length} events · {groups.length} {groups.length === 1 ? 'entry' : 'entries'}</div>
    </div>
  );
}
