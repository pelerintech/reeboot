/**
 * Webchat Settings Tab
 * Loads and saves budget limits via GET/PUT /api/settings/budget
 */
(function () {
  'use strict';

  // ── DOM refs ─────────────────────────────────────────────────────────────────

  const spendSummary  = document.getElementById('budget-spend-summary');
  const budgetForm    = document.getElementById('budget-form');
  const dailyCostEl   = document.getElementById('budget-daily-cost');
  const dailyTokensEl = document.getElementById('budget-daily-tokens');
  const sessionCostEl    = document.getElementById('budget-session-cost');
  const sessionTokensEl  = document.getElementById('budget-session-tokens');
  const turnCostEl       = document.getElementById('budget-turn-cost');
  const turnTokensEl     = document.getElementById('budget-turn-tokens');
  const warnThreshEl  = document.getElementById('budget-warn-threshold');
  const saveMsg       = document.getElementById('budget-save-msg');
  const progressWrap  = document.getElementById('budget-progress-wrap');
  const progressBar   = document.getElementById('budget-progress-bar');
  const progressLabel = document.getElementById('budget-progress-label');

  // ── Load budget settings from server ─────────────────────────────────────────

  async function load() {
    try {
      const res = await fetch('/api/settings/budget');
      if (!res.ok) return;
      const data = await res.json();

      const limits = data.limits ?? {};
      const spend  = data.spend  ?? {};

      // Fill in form inputs (show empty string for null to let placeholder show)
      dailyCostEl.value   = limits.daily_cost_usd   != null ? limits.daily_cost_usd   : '';
      dailyTokensEl.value = limits.daily_tokens      != null ? limits.daily_tokens      : '';
      sessionCostEl.value   = limits.session_cost_usd != null ? limits.session_cost_usd : '';
      sessionTokensEl.value = limits.session_tokens   != null ? limits.session_tokens   : '';
      turnCostEl.value      = limits.turn_cost_usd    != null ? limits.turn_cost_usd    : '';
      turnTokensEl.value    = limits.turn_tokens      != null ? limits.turn_tokens      : '';
      warnThreshEl.value  = limits.warn_threshold    != null ? limits.warn_threshold    : 0.8;

      // ── Progress bar for daily cost spend ──────────────────────────────────
      if (limits.daily_cost_usd && progressWrap && progressBar && progressLabel) {
        const todayCost = spend.today_cost_usd || 0;
        const limit     = limits.daily_cost_usd;
        const pct       = Math.min(100, Math.round((todayCost / limit) * 100));

        progressBar.value = pct;
        progressBar.max   = 100;
        progressLabel.textContent = `$${todayCost.toFixed(2)} / $${limit.toFixed(2)} (${pct}%)`;

        // Tint bar red when near/over threshold
        const warnPct = Math.round((limits.warn_threshold ?? 0.8) * 100);
        progressBar.style.accentColor = pct >= warnPct ? '#e05252' : 'var(--accent)';
        progressWrap.style.display = 'block';
      } else if (progressWrap) {
        progressWrap.style.display = 'none';
      }

      // ── Spend text summary ─────────────────────────────────────────────────
      const todayCost   = (spend.today_cost_usd  || 0).toFixed(2);
      const todayTokens = (spend.today_tokens     || 0).toLocaleString();
      let summary = `Today: $${todayCost} spent (${todayTokens} tokens)`;
      if (limits.daily_cost_usd) {
        const pct = Math.round(((spend.today_cost_usd || 0) / limits.daily_cost_usd) * 100);
        const remaining = Math.max(0, limits.daily_cost_usd - (spend.today_cost_usd || 0)).toFixed(2);
        summary += ` — $${remaining} of $${limits.daily_cost_usd.toFixed(2)} remaining (${pct}%)`;
      }
      if (spendSummary) spendSummary.textContent = summary;

    } catch {
      if (spendSummary) spendSummary.textContent = 'Unable to load budget data.';
    }
  }

  // ── Save budget settings ──────────────────────────────────────────────────────

  if (budgetForm) {
    budgetForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {};
      if (dailyCostEl.value !== '')   payload.daily_cost_usd   = parseFloat(dailyCostEl.value);
      if (dailyTokensEl.value !== '') payload.daily_tokens      = parseInt(dailyTokensEl.value, 10);
      if (sessionCostEl.value !== '')   payload.session_cost_usd = parseFloat(sessionCostEl.value);
      if (sessionTokensEl.value !== '') payload.session_tokens   = parseInt(sessionTokensEl.value, 10);
      if (turnCostEl.value !== '')      payload.turn_cost_usd    = parseFloat(turnCostEl.value);
      if (turnTokensEl.value !== '')    payload.turn_tokens      = parseInt(turnTokensEl.value, 10);
      if (warnThreshEl.value !== '')  payload.warn_threshold    = parseFloat(warnThreshEl.value);

      // Set empty fields to null explicitly
      if (dailyCostEl.value === '')   payload.daily_cost_usd   = null;
      if (dailyTokensEl.value === '') payload.daily_tokens      = null;
      if (sessionCostEl.value === '')   payload.session_cost_usd = null;
      if (sessionTokensEl.value === '') payload.session_tokens   = null;
      if (turnCostEl.value === '')      payload.turn_cost_usd    = null;
      if (turnTokensEl.value === '')    payload.turn_tokens      = null;

      try {
        const res = await fetch('/api/settings/budget', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          if (saveMsg) {
            saveMsg.style.display = 'block';
            setTimeout(() => { saveMsg.style.display = 'none'; }, 3000);
          }
          await load(); // Reload to reflect saved state
        }
      } catch {
        // Silent — save msg won't show
      }
    });
  }

  // ── Expose to tab switcher ────────────────────────────────────────────────────

  window._reebotSettings = { load };

})();
