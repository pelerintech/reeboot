/**
 * Webchat Logs Tab — OB-7
 * Connects to /api/logs/stream via EventSource, renders records as colored rows.
 */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────────

  let paused = false;
  let errorBadgeCount = 0;
  let eventSource = null;

  const LEVEL_NAMES = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
  const LEVEL_NUMBERS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

  // ── DOM refs ─────────────────────────────────────────────────────────────────

  const tabNav       = document.getElementById('tab-nav');
  const tabChat      = document.getElementById('tab-chat');
  const tabLogsPanel = document.getElementById('tab-logs-panel');
  const chatFooter   = document.getElementById('chat-footer');
  const logsTable    = document.getElementById('logs-table');
  const levelFilter  = document.getElementById('logs-level-filter');
  const pauseBtn     = document.getElementById('logs-pause-btn');
  const logsStatus   = document.getElementById('logs-status');
  const badgeEl      = document.getElementById('logs-error-badge');
  const logsTabBtn   = document.getElementById('logs-tab-btn');

  // ── Tab switching ─────────────────────────────────────────────────────────────

  tabNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (tab === 'chat') {
      tabChat.style.display = 'flex';
      chatFooter.style.display = '';
      tabLogsPanel.classList.remove('active');
    } else if (tab === 'logs') {
      tabChat.style.display = 'none';
      chatFooter.style.display = 'none';
      tabLogsPanel.classList.add('active');
      // Reset badge when Logs tab is focused
      errorBadgeCount = 0;
      badgeEl.hidden = true;
      badgeEl.textContent = '0';
    }
  });

  // ── SSE connection ────────────────────────────────────────────────────────────

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/api/logs/stream');
    logsStatus.textContent = 'Connecting…';

    eventSource.onopen = () => {
      logsStatus.textContent = 'Connected';
    };

    eventSource.onerror = () => {
      logsStatus.textContent = 'Reconnecting…';
    };

    eventSource.onmessage = (e) => {
      if (paused) return;
      try {
        const record = JSON.parse(e.data);
        renderRecord(record);
      } catch {
        // Ignore malformed records
      }
    };
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────

  function renderRecord(record) {
    const selectedLevel = LEVEL_NUMBERS[levelFilter.value] ?? 30;
    const recordLevel = record.level ?? 30;

    // Client-side level filter
    if (recordLevel < selectedLevel) return;

    const levelName = LEVEL_NAMES[recordLevel] ?? 'info';
    const time = record.time ? new Date(record.time).toISOString().replace('T', ' ').slice(0, 19) : '';
    const component = record.component ? `[${record.component}] ` : '';
    const msg = record.msg ?? '';

    const row = document.createElement('div');
    row.className = `log-row level-${levelName}`;
    row.textContent = `${time} ${levelName.toUpperCase().padEnd(5)} ${component}${msg}`;
    logsTable.appendChild(row);

    // Auto-scroll to bottom
    logsTable.scrollTop = logsTable.scrollHeight;

    // Increment error badge for error/fatal records
    if (recordLevel >= 50) {
      // Check if Logs tab is currently active
      const logsTabActive = logsTabBtn.classList.contains('active');
      if (!logsTabActive) {
        errorBadgeCount++;
        badgeEl.textContent = String(errorBadgeCount);
        badgeEl.hidden = false;
      }
    }
  }

  // ── Level filter ──────────────────────────────────────────────────────────────

  levelFilter.addEventListener('change', () => {
    // Re-render is not needed; filter applied on next incoming records
  });

  // ── Pause / Resume ────────────────────────────────────────────────────────────

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  });

  // ── Init ──────────────────────────────────────────────────────────────────────

  connect();

})();
