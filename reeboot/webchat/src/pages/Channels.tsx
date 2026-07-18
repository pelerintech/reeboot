import { useState, useEffect, useCallback } from 'react';

interface Channel { type: string; status: string; connectedAt: string | null; lastSeen?: string | null; error?: string | null; }

const statusOrder: Record<string, number> = { connected: 0, 'connecting': 1, 'reconnecting': 2, disconnected: 3, error: 4 };

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const response = await fetch('/api/channels');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setChannels(await response.json());
    } catch {
      setError('Failed to load channel status');
    } finally { setLoading(false); setRetrying(false); }
  }, []);

  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const action = async (type: string, action: 'reconnect' | 'login' | 'logout') => {
    if (action === 'reconnect') setReconnecting((p) => new Set(p).add(type));
    try {
      const r = await fetch(`/api/channels/${type}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
      if (!r.ok) {
        const msgs: Record<string, string> = { reconnect: `⚠ Failed to reconnect ${type}`, login: `⚠ ${type} login failed`, logout: `⚠ ${type} logout failed` };
        setActionError(msgs[action] || `⚠ Action failed`);
        setTimeout(() => setActionError(null), 3000);
      } else {
        fetchChannels();
      }
    } catch {
      const msgs: Record<string, string> = { reconnect: `⚠ Failed to reconnect ${type}`, login: `⚠ ${type} login failed`, logout: `⚠ ${type} logout failed` };
      setActionError(msgs[action] || `⚠ Action failed`);
      setTimeout(() => setActionError(null), 3000);
    } finally { if (action === 'reconnect') setReconnecting((p) => { const n = new Set(p); n.delete(type); return n; }); }
  };

  const handleRetry = () => setRetrying(true);

  const statusColor = (s: string) => s === 'connected' ? 'bg-emerald-500' : s === 'disconnected' || s === 'error' ? 'bg-red-500' : 'bg-yellow-500';

  const sortedChannels = [...channels].sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

  if (loading && channels.length === 0) return <div className="flex items-center justify-center h-full bg-white"><div className="text-zinc-500">Loading…</div></div>;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="max-w-3xl mx-auto w-full px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900 mb-6">Channels</h2>
        {actionError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm animate-pulse">
            {actionError}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-3">
            <span>⚠ Failed to load channel status</span>
            <button onClick={handleRetry} disabled={retrying} className="ml-auto rounded-lg bg-red-600 text-white px-3 py-1 text-xs hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap">
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {channels.length === 0 ? <p className="text-zinc-500 text-sm">No channels configured.</p> : (
          <div className="space-y-3">
            {sortedChannels.map((ch) => (
              <div key={ch.type}>
                {/* Row */}
                <button onClick={() => setExpandedId(expandedId === ch.type ? null : ch.type)} className="w-full text-left">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-200 hover:border-zinc-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${statusColor(ch.status)}`} />
                      <div>
                        <p className="font-medium text-zinc-900 capitalize">{ch.type}</p>
                        <p className="text-xs text-zinc-500 capitalize">{ch.status}</p>
                      </div>
                    </div>
                    <span className="text-zinc-400 text-xs transition-transform">
                      {expandedId === ch.type ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {/* Expanded details panel */}
                {expandedId === ch.type && (
                  <div className="ml-4 mr-4 mb-3 p-4 rounded-xl bg-zinc-50 border border-zinc-100 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-zinc-500">Channel:</span> <span className="font-medium text-zinc-900 capitalize">{ch.type}</span></div>
                      <div><span className="text-zinc-500">Status:</span> <span className="font-medium text-zinc-900 capitalize">{ch.status}</span></div>
                      <div><span className="text-zinc-500">Last seen:</span> <span className="font-medium text-zinc-900">{ch.lastSeen ? new Date(ch.lastSeen).toLocaleString() : 'N/A'}</span></div>
                      <div><span className="text-zinc-500">Connected at:</span> <span className="font-medium text-zinc-900">{ch.connectedAt ? new Date(ch.connectedAt).toLocaleString() : 'N/A'}</span></div>
                    </div>
                    {ch.error && (
                      <div className="text-red-600 text-sm bg-red-50 rounded-lg p-2 border border-red-200">⚠ {ch.error}</div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {ch.status === 'connected' && (
                        <button onClick={() => action(ch.type, 'logout')} className="rounded-lg bg-zinc-200 text-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-300 transition-colors">Logout</button>
                      )}
                      {ch.status === 'disconnected' && (
                        <>
                          <button onClick={() => action(ch.type, 'login')} className="rounded-lg bg-zinc-200 text-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-300 transition-colors">Login</button>
                          <button onClick={() => action(ch.type, 'reconnect')} disabled={reconnecting.has(ch.type)} className="rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-40 transition-colors">
                            {reconnecting.has(ch.type) ? '…' : 'Reconnect'}
                          </button>
                        </>
                      )}
                      {(ch.status === 'connecting' || ch.status === 'reconnecting') && (
                        <span className="text-xs text-yellow-600 animate-pulse">{ch.status}…</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
