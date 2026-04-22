/**
 * Orchestrator
 *
 * Subscribes to the MessageBus, applies routing rules, dispatches incoming
 * messages to the correct context's AgentRunner, handles in-chat commands,
 * manages per-context inactivity timers, and queues messages when a context
 * is busy.
 *
 * Routing priority: peer match > channel match > default
 * Queue depth: max 5 messages per context; overflow gets "queue full" reply.
 */

import { statfsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { MessageBus, IncomingMessage, ChannelAdapter } from './channels/interface.js';
import type { AgentRunner } from './agent-runner/index.js';
import { resolveMessageTrust } from './trust.js';
import { TurnJournal } from './resilience/turn-journal.js';
import { broadcastToAllChannels } from './utils/broadcast.js';
import { parseHumanInterval } from './scheduler/parse.js';
import type { Database } from 'better-sqlite3';
import { randomUUID as _randomUUID2 } from 'crypto';

// ─── Config types ─────────────────────────────────────────────────────────────

export interface RoutingRule {
  peer?: string;
  channel?: string;
  context: string;
}

export interface OrchestratorConfig {
  routing: {
    default: string;
    rules: RoutingRule[];
  };
  session?: {
    inactivityTimeout?: number;
  };
  agent?: {
    turnTimeout?: number;
    rateLimitRetries?: number;
  };
  /** Channel trust config — optional; absent means all channels default to 'owner' */
  channels?: Record<string, { trust?: string; trusted_senders?: string[] }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_QUEUE_DEPTH = 5;
const DEFAULT_INACTIVITY_MS = 14_400_000; // 4 hours
const DEFAULT_TURN_TIMEOUT_MS = 300_000;  // 5 min
const DEFAULT_RATE_LIMIT_RETRIES = 3;
const DISK_SPACE_MIN_BYTES = 100 * 1024 * 1024; // 100MB
const BUSY_REPLY = "I'm still working on your last request. Please wait.";
const QUEUE_FULL_REPLY = "Queue full. Please wait for the current messages to be processed.";

// ─── Disk space check ─────────────────────────────────────────────────────────

function checkDiskSpace(): { ok: boolean; message?: string } {
  try {
    const reebotDir = join(homedir(), '.reeboot');
    const stats = statfsSync(reebotDir);
    const freeBytes = stats.bfree * stats.bsize;
    if (freeBytes < DISK_SPACE_MIN_BYTES) {
      const freeMB = Math.floor(freeBytes / (1024 * 1024));
      return {
        ok: false,
        message: `Disk space critically low (${freeMB}MB free). Cannot start new agent turn. Free up space in ~/.reeboot/`,
      };
    }
    return { ok: true };
  } catch {
    // Can't check — allow turn to proceed
    return { ok: true };
  }
}

// ─── Per-context state ────────────────────────────────────────────────────────

interface ContextState {
  busy: boolean;
  queue: IncomingMessage[];
  inactivityTimer: ReturnType<typeof setTimeout> | null;
  /** Per-peer routing override (set by /context command) */
  peerContextOverride: Map<string, string>;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class Orchestrator {
  private _config: OrchestratorConfig;
  private _bus: MessageBus;
  private _adapters: Map<string, ChannelAdapter>;
  private _runners: Map<string, AgentRunner>;
  private _contextState = new Map<string, ContextState>();
  private _unsubscribe: (() => void) | null = null;
  private _journal: TurnJournal | null = null;
  private _db: Database | null = null;
  private _consecutiveFailures = new Map<string, number>();
  private _activeOutage = false;

  constructor(
    config: OrchestratorConfig,
    bus: MessageBus,
    adapters: Map<string, ChannelAdapter>,
    runners: Map<string, AgentRunner>,
    db?: Database
  ) {
    this._config = config;
    this._bus = bus;
    this._adapters = adapters;
    this._runners = runners;
    if (db) {
      this._db = db;
      this._journal = new TurnJournal(db);
    }
  }

  start(): void {
    this._unsubscribe = this._bus.onMessage((msg) => this._handleMessage(msg));
  }

  stop(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    for (const state of this._contextState.values()) {
      if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
    }
  }

  // ── Routing ───────────────────────────────────────────────────────────────

  private _resolveContext(msg: IncomingMessage): string {
    const rules = this._config.routing.rules ?? [];

    // Check per-peer runtime override first
    for (const state of this._contextState.values()) {
      const override = state.peerContextOverride.get(msg.peerId);
      if (override) return override;
    }

    // Peer match
    for (const rule of rules) {
      if (rule.peer && rule.peer === msg.peerId) return rule.context;
    }

    // Channel match
    for (const rule of rules) {
      if (rule.channel && rule.channel === msg.channelType) return rule.context;
    }

    return this._config.routing.default ?? 'main';
  }

  // ── Message handling ──────────────────────────────────────────────────────

  private _handleMessage(msg: IncomingMessage): void {
    // Resolve trust if not already set
    if (this._config.channels && msg.trust === undefined) {
      msg = { ...msg, trust: resolveMessageTrust(msg.channelType, msg.peerId, this._config as any) };
    }

    const contextId = this._resolveContext(msg);
    const state = this._getOrCreateContextState(contextId);

    // Reset inactivity timer
    this._resetInactivityTimer(contextId, state);

    if (state.busy) {
      // Queue or drop
      if (state.queue.length >= MAX_QUEUE_DEPTH) {
        this._reply(msg, QUEUE_FULL_REPLY);
      } else {
        state.queue.push(msg);
        this._reply(msg, BUSY_REPLY);
      }
      return;
    }

    this._dispatch(contextId, msg);
  }

  private _dispatch(contextId: string, msg: IncomingMessage): void {
    const state = this._getOrCreateContextState(contextId);
    state.busy = true;

    // Run async without blocking
    this._runTurn(contextId, msg).finally(() => {
      state.busy = false;
      // Process next queued message if any
      if (state.queue.length > 0) {
        const next = state.queue.shift()!;
        this._dispatch(contextId, next);
      }
    });
  }

  private async _runTurn(contextId: string, msg: IncomingMessage): Promise<void> {
    // Check for in-chat command
    if (msg.content.startsWith('/')) {
      const handled = await this._handleCommand(contextId, msg);
      if (handled) return;
    }

    // Disk space pre-check
    const disk = checkDiskSpace();
    if (!disk.ok) {
      this._reply(msg, disk.message!);
      return;
    }

    const runner = this._runners.get(contextId);
    if (!runner) {
      this._reply(msg, `No runner found for context "${contextId}".`);
      return;
    }

    const turnId = randomUUID();
    const sessionPath = runner?.getSessionPath?.() ?? undefined;
    this._journal?.openTurn(turnId, contextId, msg.content, sessionPath);

    const turnTimeoutMs = this._config.agent?.turnTimeout ?? DEFAULT_TURN_TIMEOUT_MS;
    const maxRetries = this._config.agent?.rateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES;

    let responseText = '';
    let retries = 0;

    while (true) {
      responseText = '';

      // Build a promise that races the turn vs. timeout
      let aborted = false;
      let stepSeq = 0;
      const onEvent = (event: any) => {
        if (event.type === 'text_delta') {
          responseText += event.delta;
        }
        if (event.type === 'tool_call_end' && this._journal) {
          stepSeq++;
          this._journal.appendStep(turnId, {
            seq: stepSeq,
            toolName: event.tool_name ?? event.toolName ?? 'unknown',
            toolInput: typeof event.tool_input === 'string'
              ? event.tool_input
              : JSON.stringify(event.tool_input ?? {}),
            toolOutput: typeof event.tool_output === 'string'
              ? event.tool_output
              : JSON.stringify(event.tool_output ?? null),
            isError: !!(event.is_error ?? event.isError),
          });
        }
      };
      const turnPromise = msg.trust !== undefined
        ? runner.prompt(msg.content, onEvent, { trust: msg.trust })
        : runner.prompt(msg.content, onEvent);

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(() => resolve('timeout'), turnTimeoutMs);
      });

      let result: 'done' | 'timeout' | 'error' = 'done';
      let turnError: any = null;

      try {
        const winner = await Promise.race([
          turnPromise.then(() => 'done' as const),
          timeoutPromise,
        ]);

        if (winner === 'timeout') {
          aborted = true;
          result = 'timeout';
          try { runner.abort(); } catch { /* ignore */ }
        }
      } catch (err: any) {
        result = 'error';
        turnError = err;
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }

      if (result === 'timeout') {
        // Leave journal open — this counts as a crashed turn
        this._reply(msg, 'Your request timed out. The agent took too long to respond.');
        return;
      }

      if (result === 'error') {
        const err = turnError;
        if (err?.name === 'AbortError') return;

        // Check for rate limit (HTTP 429)
        const isRateLimit = err?.status === 429 ||
          (err?.message ?? '').toLowerCase().includes('rate limit');

        if (isRateLimit && retries < maxRetries) {
          retries++;
          // Exponential backoff: base is configurable (default 5s), tests can inject 10ms
          const backoffBase = (this._config.agent as any)?._testBackoffMs ?? 5000;
          const delayMs = Math.pow(2, retries) * backoffBase; // 10s, 20s, 40s (or 20ms, 40ms in tests)
          this._reply(
            msg,
            `Rate limited — retrying in ${Math.round(delayMs / 1000)}s (attempt ${retries}/${maxRetries})...`
          );
          await new Promise(r => setTimeout(r, delayMs));
          continue; // retry
        }

        // Check if this is a provider error (4xx/5xx or network failure)
        const isProviderError =
          (typeof err?.status === 'number' && err.status >= 400) ||
          err?.code === 'ECONNREFUSED' ||
          err?.code === 'ENOTFOUND' ||
          err?.code === 'ETIMEDOUT';

        if (isProviderError && this._db) {
          const count = (this._consecutiveFailures.get(contextId) ?? 0) + 1;
          this._consecutiveFailures.set(contextId, count);
          const threshold = (this._config as any).resilience?.outage_threshold ?? 3;
          if (this._activeOutage) {
            // Record lost job during active outage
            this._recordLostJob(contextId, msg.content);
          } else if (count >= threshold) {
            this._declareOutage(contextId);
          }
        } else if (isProviderError) {
          const count = (this._consecutiveFailures.get(contextId) ?? 0) + 1;
          this._consecutiveFailures.set(contextId, count);
        }

        // Non-retryable error — leave journal open (crash evidence)
        this._reply(msg, `Error: ${err?.message ?? String(err)}`);
        return;
      }

      // Success
      break;
    }

    // Clean turn — delete the journal row and reset failure counter
    this._journal?.closeTurn(turnId);
    this._consecutiveFailures.set(contextId, 0);

    if (responseText) {
      this._reply(msg, responseText);
    }
  }

  // ── In-chat commands ──────────────────────────────────────────────────────

  private async _handleCommand(contextId: string, msg: IncomingMessage): Promise<boolean> {
    const content = msg.content.trim();
    const parts = content.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === '/new') {
      await this.handleNew(contextId, msg);
      return true;
    }

    if (cmd === '/context' && parts[1]) {
      await this.handleContext(contextId, msg, parts[1]);
      return true;
    }

    if (cmd === '/contexts') {
      await this.handleContexts(contextId, msg);
      return true;
    }

    if (cmd === '/status') {
      await this.handleStatus(contextId, msg);
      return true;
    }

    if (cmd === '/compact') {
      await this.handleCompact(contextId, msg);
      return true;
    }

    // Unknown slash command — forward to agent
    return false;
  }

  async handleNew(contextId: string, msg: IncomingMessage): Promise<void> {
    const runner = this._runners.get(contextId);
    if (runner) {
      await runner.dispose();
    }
    this._reply(msg, 'New session started.');
  }

  async handleContext(contextId: string, msg: IncomingMessage, targetContext: string): Promise<void> {
    const state = this._getOrCreateContextState(contextId);
    state.peerContextOverride.set(msg.peerId, targetContext);
    this._reply(msg, `Switched to context: ${targetContext}`);
  }

  async handleContexts(_contextId: string, msg: IncomingMessage): Promise<void> {
    const names = Array.from(this._runners.keys());
    const contextId = this._resolveContext(msg);
    const lines = names.map(n => (n === contextId ? `* ${n}` : `  ${n}`));
    this._reply(msg, lines.join('\n'));
  }

  async handleStatus(contextId: string, msg: IncomingMessage): Promise<void> {
    this._reply(msg, `Context: ${contextId}`);
  }

  async handleCompact(contextId: string, msg: IncomingMessage): Promise<void> {
    // Trigger pi session compaction via runner if supported
    const runner = this._runners.get(contextId) as any;
    if (runner?.compact) {
      await runner.compact();
    }
    this._reply(msg, 'Session compacted.');
  }

  // ── Heartbeat dispatch ───────────────────────────────────────────────────

  /** Dispatch a heartbeat tick to a context, returning the agent's response. */
  async handleHeartbeatTick(params: { contextId: string; prompt: string }): Promise<string> {
    const runner = this._runners.get(params.contextId);
    if (!runner) {
      console.warn(`[Heartbeat] No runner for context "${params.contextId}"`);
      return 'IDLE';
    }
    let response = '';
    try {
      await runner.prompt(params.prompt, (event) => {
        if (event.type === 'text_delta') response += event.delta;
      });
    } catch (err) {
      console.warn(`[Heartbeat] Runner error: ${err}`);
      return 'IDLE';
    }
    return response;
  }

  /** Send a text message to the first available adapter for a context. */
  sendToDefaultChannel(contextId: string, text: string): void {
    // Try each adapter in registration order until one succeeds
    for (const adapter of this._adapters.values()) {
      // Send to contextId as peerId — adapters handle routing
      adapter.send(contextId, { type: 'text', text }).catch(() => {/* ignore */});
      return; // send to first available adapter only
    }
  }

  // ── Inactivity timer ──────────────────────────────────────────────────────

  private _resetInactivityTimer(contextId: string, state: ContextState): void {
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
    }
    const timeoutMs =
      this._config.session?.inactivityTimeout ?? DEFAULT_INACTIVITY_MS;

    state.inactivityTimer = setTimeout(async () => {
      const runner = this._runners.get(contextId);
      if (runner) {
        await runner.dispose();
      }
      this._contextState.delete(contextId);
    }, timeoutMs);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _getOrCreateContextState(contextId: string): ContextState {
    if (!this._contextState.has(contextId)) {
      this._contextState.set(contextId, {
        busy: false,
        queue: [],
        inactivityTimer: null,
        peerContextOverride: new Map(),
      });
    }
    return this._contextState.get(contextId)!;
  }

  private _reply(msg: IncomingMessage, text: string): void {
    const adapter = this._adapters.get(msg.channelType);
    if (!adapter) return;
    adapter.send(msg.peerId, { type: 'text', text }).catch((err) => {
      console.error(`[Orchestrator] Failed to send reply: ${err}`);
    });
  }

  // ── Outage detection ──────────────────────────────────────────────────

  // ── Probe + resolution ────────────────────────────────────────────

  private _probeSuccessCount = 0;

  /**
   * Handle a scheduled task dispatch. Routes probe tasks to the outage probe
   * handler. All other tasks are not handled here (the scheduler calls runners
   * directly).
   */
  async handleScheduledTask(task: { taskId: string; contextId: string; prompt: string }): Promise<void> {
    if (task.contextId === '__outage_probe__') {
      await this._runOutageProbe(task.taskId);
    }
  }

  private async _runOutageProbe(taskId: string): Promise<void> {
    // Determine the provider health endpoint
    const provider = (this._config as any).agent?.model?.provider ?? '';
    let url = 'https://api.anthropic.com';
    if (provider === 'openai' || provider.includes('openai')) {
      url = 'https://api.openai.com';
    }

    let success = false;
    try {
      const res = await fetch(url);
      // Treat any non-5xx response as a sign the provider is reachable
      success = res.status < 500;
    } catch {
      success = false;
    }

    if (success) {
      this._probeSuccessCount++;
      if (this._probeSuccessCount >= 2) {
        await this._resolveOutage(taskId);
      }
    } else {
      this._probeSuccessCount = 0;
      // Advance probe task next_run to next probe interval
      if (this._db) {
        const resConfig = (this._config as any).resilience;
        const probeInterval = resConfig?.probe_interval ?? '1h';
        const intervalMs = parseHumanInterval(probeInterval) ?? 3_600_000;
        const nextRun = new Date(Date.now() + intervalMs).toISOString();
        this._db.prepare('UPDATE tasks SET next_run = ? WHERE id = ?').run(nextRun, taskId);
      }
    }
  }

  private async _resolveOutage(probeTaskId: string): Promise<void> {
    if (!this._db) return;

    // Find the unresolved outage
    const outage = this._db
      .prepare(`SELECT * FROM outage_events WHERE resolved_at IS NULL ORDER BY declared_at DESC LIMIT 1`)
      .get() as { id: string; lost_jobs: string; truncated: number } | undefined;

    if (outage) {
      this._db
        .prepare(`UPDATE outage_events SET resolved_at = datetime('now') WHERE id = ?`)
        .run(outage.id);

      let lostJobs: Array<{ contextId: string; prompt: string }> = [];
      try { lostJobs = JSON.parse(outage.lost_jobs); } catch { /* ignore */ }

      let recoveryMsg =
        `✅ Provider is back online. Outage has been resolved.`;
      if (lostJobs.length > 0) {
        recoveryMsg += `\n\nThe following requests were lost during the outage:`;
        for (const job of lostJobs) {
          recoveryMsg += `\n  • [${job.contextId}] ${job.prompt}`;
        }
        if (outage.truncated) {
          recoveryMsg += `\n  … (list truncated)`;
        }
        recoveryMsg += `\n\nPlease re-send any requests you'd like me to process.`;
      }

      broadcastToAllChannels(this._adapters, recoveryMsg);
    }

    // Delete the probe task
    this._db.prepare('DELETE FROM tasks WHERE id = ?').run(probeTaskId);

    this._activeOutage = false;
    this._probeSuccessCount = 0;
    this._consecutiveFailures.clear();
  }

  private _recordLostJob(contextId: string, prompt: string): void {
    if (!this._db) return;
    const outage = this._db
      .prepare(`SELECT id, lost_jobs, truncated FROM outage_events WHERE resolved_at IS NULL ORDER BY declared_at DESC LIMIT 1`)
      .get() as { id: string; lost_jobs: string; truncated: number } | undefined;
    if (!outage) return;

    let jobs: Array<{ contextId: string; prompt: string }> = [];
    try { jobs = JSON.parse(outage.lost_jobs); } catch { /* ignore */ }

    if (jobs.length >= 20) {
      // Cap at 20; set truncation flag if not already set
      if (!outage.truncated) {
        this._db.prepare(`UPDATE outage_events SET truncated = 1 WHERE id = ?`).run(outage.id);
      }
      return;
    }

    jobs.push({ contextId, prompt });
    this._db
      .prepare(`UPDATE outage_events SET lost_jobs = ? WHERE id = ?`)
      .run(JSON.stringify(jobs), outage.id);
  }

  private _declareOutage(contextId: string): void {
    if (!this._db) return;
    this._activeOutage = true;

    const outageId = _randomUUID2();
    const resConfig = (this._config as any).resilience;
    const provider = this._config.agent?.model?.provider ?? 'unknown';

    this._db
      .prepare(
        `INSERT INTO outage_events (id, provider) VALUES (?, ?)`
      )
      .run(outageId, provider);

    broadcastToAllChannels(
      this._adapters,
      `⚠️ Outage detected: the LLM provider appears to be unavailable ` +
        `(context: ${contextId}). I'll probe for recovery and notify you when it's back.`
    );

    // Create a self-healing probe task
    const probeInterval = resConfig?.probe_interval ?? '1h';
    const intervalMs = parseHumanInterval(probeInterval) ?? 3_600_000;
    const nextRun = new Date(Date.now() + intervalMs).toISOString();
    const probeId = _randomUUID2();

    this._db
      .prepare(
        `INSERT OR IGNORE INTO tasks
           (id, context_id, schedule, schedule_type, schedule_value, normalized_ms, status, prompt, next_run)
         VALUES (?, '__outage_probe__', ?, 'interval', ?, ?, 'active', '__probe__', ?)`
      )
      .run(probeId, probeInterval, probeInterval, intervalMs, nextRun);
  }

  /** Expose runners for reload/restart */
  get runners(): Map<string, AgentRunner> {
    return this._runners;
  }

  /** Expose adapters for restart */
  get adapters(): Map<string, ChannelAdapter> {
    return this._adapters;
  }
}
