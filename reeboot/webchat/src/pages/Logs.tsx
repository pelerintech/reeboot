import { useState, useEffect, useRef, useCallback } from 'react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
interface LogRecord { timestamp: string; level: LogLevel; component?: string; message: string; }

interface LogsProps {
  onIncrementErrorBadge?: () => void;
}

const levelColors: Record<LogLevel, string> = { debug: 'text-zinc-400', info: 'text-zinc-600', warn: 'text-yellow-600', error: 'text-red-600', fatal: 'text-red-700 font-bold' };
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 3000;

export default function Logs({ onIncrementErrorBadge }: LogsProps) {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('info');
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scroll = useCallback(() => { if (autoScrollRef.current && containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight; }, []);
  useEffect(() => { scroll(); }, [logs, scroll]);
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
          const record: LogRecord = JSON.parse(e.data);
          if (record.level === 'error' || record.level === 'fatal') {
            onIncrementErrorBadge?.();
          }
          if (!paused) {
            setLogs((p) => [...p.slice(-500), record]);
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
        try { setLogs((p) => [...p.slice(-500), JSON.parse(e.data)]); } catch {}
      }
    };
    es.onerror = () => setStatus('reconnecting');
  }, [filterLevel, paused]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Logs</h2>
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
          <span>⚠ Failed to connect to logs stream</span>
          <button onClick={handleRetry} className="ml-auto rounded-lg bg-red-600 text-white px-3 py-1 text-xs hover:bg-red-700 transition-colors whitespace-nowrap">Retry</button>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? <div className="flex items-center justify-center h-full"><p className="text-zinc-400">Waiting for logs…</p></div> : (
          <div className="py-1">{logs.map((l, i) => (
            <div key={i} className="px-4 py-0.5 border-b border-zinc-100">
              <span className="text-zinc-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
              <span className={`mx-2 uppercase text-[10px] font-bold ${levelColors[l.level as LogLevel] || 'text-zinc-500'}`}>[{(l.level as LogLevel) || 'info'}]</span>
              {l.component && <span className="text-zinc-400">[{l.component}]</span>}
              <span className={`ml-2 ${levelColors[l.level as LogLevel] || 'text-zinc-600'}`}>{typeof l.message === 'string' ? l.message : JSON.stringify(l.message)}</span>
            </div>
          ))}</div>
        )}
      </div>
      <div className="px-4 py-1 border-t border-zinc-200 text-xs text-zinc-400">{logs.length} entries</div>
    </div>
  );
}
