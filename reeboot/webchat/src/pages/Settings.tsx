import { useState, useEffect, useCallback } from 'react';

interface BudgetLimits { daily_cost_usd?: number | null; daily_tokens?: number | null; session_cost_usd?: number | null; session_tokens?: number | null; per_turn_cost_usd?: number | null; per_turn_tokens?: number | null; warn_threshold?: number | null; }
interface BudgetSpend { today_cost_usd: number; today_tokens: number; session_cost_usd: number; session_tokens?: number; }
interface BudgetData { limits: BudgetLimits; spend: BudgetSpend; }

const fields: { key: keyof BudgetLimits; label: string; placeholder: string; step?: string; min?: string; max?: string }[] = [
  { key: 'daily_cost_usd', label: 'Daily cost limit (USD)', placeholder: 'e.g. 10.00', step: '0.01', min: '0' },
  { key: 'daily_tokens', label: 'Daily token limit', placeholder: 'e.g. 500000', step: '1', min: '0' },
  { key: 'session_cost_usd', label: 'Session cost limit (USD)', placeholder: 'e.g. 5.00', step: '0.01', min: '0' },
  { key: 'session_tokens', label: 'Session token limit', placeholder: 'e.g. 250000', step: '1', min: '0' },
  { key: 'per_turn_cost_usd', label: 'Per-turn cost limit (USD)', placeholder: 'e.g. 1.00', step: '0.01', min: '0' },
  { key: 'per_turn_tokens', label: 'Per-turn token limit', placeholder: 'e.g. 50000', step: '1', min: '0' },
  { key: 'warn_threshold', label: 'Warn threshold (0.0 – 1.0)', placeholder: 'e.g. 0.8', step: '0.01', min: '0', max: '1' },
];

function validateLimits(limits: BudgetLimits): Record<keyof BudgetLimits, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const val = limits[field.key];
    if (val === null || val === undefined) continue;
    if (isNaN(val)) {
      errors[field.key] = 'Must be a valid number';
      continue;
    }
    if (val < 0) {
      errors[field.key] = 'Must be >= 0';
    } else if (field.key === 'warn_threshold') {
      if (val > 1.0) errors[field.key] = 'Must be between 0.0 and 1.0';
      if (val < 0.0) errors[field.key] = 'Must be between 0.0 and 1.0';
    }
  }
  return errors as Record<keyof BudgetLimits, string>;
}

export default function Settings() {
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [limits, setLimits] = useState<BudgetLimits>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState(false);

  const fetchBudget = useCallback(async () => {
    try {
      setLoading(true); setError(null); setRetrying(false);
      const r = await fetch('/api/settings/budget');
      if (!r.ok) throw new Error('fail');
      const d: BudgetData = await r.json();
      setBudgetData(d);
      setLimits(d.limits);
    } catch {
      setError('Unable to load budget data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);

  const handleChange = (key: keyof BudgetLimits, value: string) => {
    setLimits((p) => ({ ...p, [key]: value === '' ? null : parseFloat(value) }));
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleRetry = useCallback(() => {
    setRetrying(true);
    fetchBudget();
  }, [fetchBudget]);

  const handleSave = async () => {
    const validationErrors = validateLimits(limits);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    setFieldErrors({});
    setSaving(true); setError(null); setSuccess(null);
    try {
      const r = await fetch('/api/settings/budget', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(limits) });
      if (!r.ok) throw new Error('fail');
      setSuccess('Budget settings saved');
      setTimeout(() => setSuccess(null), 3000);
      fetchBudget();
    } catch {
      setError('Failed to save budget settings');
    } finally {
      setSaving(false);
    }
  };

  const isValid = Object.keys(validateLimits(limits)).length === 0;

  const dailyLimit = limits.daily_cost_usd ?? 0;
  const dailySpend = budgetData?.spend.today_cost_usd ?? 0;
  const pct = dailyLimit > 0 ? Math.min((dailySpend / dailyLimit) * 100, 100) : 0;
  const remaining = dailyLimit > 0 ? Math.max(dailyLimit - dailySpend, 0) : 0;
  const overThreshold = pct >= (limits.warn_threshold ?? 0.8) * 100;

  if (loading) return <div className="flex items-center justify-center h-full bg-white"><div className="text-zinc-500">Loading…</div></div>;

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900 mb-6">Settings</h2>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-3">
            <span>{error}</span>
            <button onClick={handleRetry} disabled={retrying} className="ml-auto rounded-lg bg-red-600 text-white px-3 py-1 text-xs hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap">
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {success && <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-sm">{success}</div>}

        {dailyLimit > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <h3 className="text-sm font-medium text-zinc-900 mb-3">Daily Spend</h3>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-zinc-500 mb-1"><span>${dailySpend.toFixed(2)} / ${dailyLimit.toFixed(2)}</span><span>{pct.toFixed(0)}%</span></div>
              <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${overThreshold ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <p className="text-xs text-zinc-500">${remaining.toFixed(2)} of ${dailyLimit.toFixed(2)} remaining ({(100 - pct).toFixed(0)}%)</p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-900">Budget Limits</h3>
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
              <input type="number" step={f.step} min={f.min} max={f.max} placeholder={f.placeholder} value={limits[f.key] ?? ''} onChange={(e) => handleChange(f.key, e.target.value)}
                className={`w-full rounded-lg bg-zinc-50 text-zinc-900 placeholder-zinc-400 px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:border-zinc-300 ${fieldErrors[f.key] ? 'border-red-300 bg-red-50' : 'border-zinc-200'}`} />
              {fieldErrors[f.key] && <p className="text-red-500 text-xs mt-1">{fieldErrors[f.key]}</p>}
            </div>
          ))}
          <button onClick={handleSave} disabled={saving || !isValid} className="w-full rounded-xl bg-zinc-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-4">
            {saving ? 'Saving…' : 'Save Budget Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
