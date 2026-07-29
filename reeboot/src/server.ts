/**
 * Main server (Hono)
 *
 * HTTP server + WebSocket endpoint for the reeboot agent.
 * Replaces the previous Fastify-based implementation.
 */

import { Hono } from 'hono';
import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import type { ServerType } from '@hono/node-server';
import { startHeartbeat } from './scheduler/heartbeat.js';
import { readFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import type { AgentRunner } from './agent-runner/index.js';
import { createRunner } from './agent-runner/index.js';
import { setDefaultRunnerFactory } from './extensions/delegate.js';
import {
  listContexts,
  createContext,
  getContextById,
  getActiveSessionPath,
  getResumedSessionPath,
  listSessions,
  initContextWorkspace,
  initContexts,
  createContextsTable,
} from './context.js';
import { nanoid } from 'nanoid';
import { migratePackages } from './packages.js';
import { homedir } from 'os';
import type { ChannelAdapter, MessageBus } from './channels/interface.js';
import { isValidConversationId } from './channels/conversation-id.js';
import type { Orchestrator } from './orchestrator.js';
import { broadcastToAllChannels } from './utils/broadcast.js';
import { webAdapter } from './channels/web.js';
import { createIncomingMessage } from './channels/interface.js';
import type { Scheduler } from './scheduler.js';
import { streamSSE } from 'hono/streaming';
import { getLogger, initLogger } from './observability/logger.js';
import { sseEmitter } from './observability/sse-emitter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json
function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const startTime = Date.now();

// ─── Server options ──────────────────────────────────────────────────────────

export interface ServerOptions {
  port?: number;
  host?: string;
  logLevel?: string;
  /** Injected DB for testing (otherwise uses getDb() singleton) */
  db?: Database.Database;
  /** Override ~/.reeboot directory for testing */
  reebotDir?: string;
  /** Auth token (if set, non-loopback WS connections must provide it) */
  token?: string;
  /** App config for runner creation */
  config?: import('./config.js').Config;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _server: ServerType | null = null;

// MessageBus (set during startServer, used by WS handler)
let _bus: MessageBus | null = null;

// Channel adapters (set during startServer)
let _channelAdapters = new Map<string, ChannelAdapter>();

// Orchestrator (set during startServer)
let _orchestrator: Orchestrator | null = null;

// Scheduler (set during startServer)
let _scheduler: Scheduler | null = null;

// Credential proxy (set during startServer)
let _credProxy: ServerType | null = null;

// Periodic retention timer handle
let _retentionTimer: ReturnType<typeof setInterval> | null = null;

// ─── Auth helper ─────────────────────────────────────────────────────────────

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function extractToken(c: any): string | undefined {
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return c.req.query('token') ?? undefined;
}

// ─── startServer ─────────────────────────────────────────────────────────────

export async function startServer(opts: ServerOptions = {}): Promise<{ port: number; host: string }> {
  const port = opts.port ?? 3000;
  const host = opts.host ?? '127.0.0.1';
  const reebotDir = opts.reebotDir ?? join(homedir(), '.reeboot');
  const serverToken = opts.token;

  const app = new Hono();

  // ── Static file serving for webchat SPA (configured after API routes) ──

  // Get or set up the DB
  let db: Database.Database;
  if (opts.db) {
    db = opts.db;
    createContextsTable(db);
    if (!getContextById(db, 'main')) {
      createContext(db, { id: 'main', name: 'main', modelProvider: '', modelId: '' });
    }
  } else {
    const { openDatabase } = await import('./db/index.js');
    db = openDatabase();
    if (!getContextById(db, 'main')) {
      createContext(db, { id: 'main', name: 'main', modelProvider: '', modelId: '' });
    }
  }

  // Ensure context workspace and agent dir exist
  await initContexts(db, reebotDir);

  // Migrate legacy config.json packages
  const configPath = join(reebotDir, 'config.json');
  const agentDir = join(reebotDir, 'agent');
  await migratePackages(configPath, agentDir);

  // ── Resilience startup — DB-only phase ───────────────────────────────────
  {
    const { runResilienceMigration } = await import('./db/schema.js');
    const { applyScheduledCatchup } = await import('./resilience/startup.js');
    runResilienceMigration(db);
    const resConfig = opts.config ?? {};
    applyScheduledCatchup(db, resConfig as any);
  }

  // ── Observability retention pruning ──────────────────────────────────────
  {
    const { pruneObservabilityData, armRetentionTimer } = await import('./observability/retention.js');
    const logging = (opts.config as any)?.logging ?? {};
    const retentionDays = logging.retention_days ?? 30;
    const eventsInfoRetentionDays = logging.events_info_retention_days ?? 7;
    const eventsMaxRowsPerContext = logging.events_max_rows_per_context ?? 8000;
    const pruneOpts = { retentionDays, eventsInfoRetentionDays, eventsMaxRowsPerContext };
    pruneObservabilityData(db, pruneOpts);

    // Arm periodic retention timer (default daily, overridable via env var)
    const intervalMs = parseInt(process.env['REEBOOT_RETENTION_INTERVAL_MS'] ?? String(24 * 60 * 60 * 1000), 10);
    _retentionTimer = armRetentionTimer(db, pruneOpts, intervalMs);
  }

  // ── Re-initialise logger with DB so warn+ records persist to operational_logs ──
  {
    const loggingConfig = (opts.config as any)?.logging ?? {};
    initLogger({ level: loggingConfig.level ?? 'info' }, db);
  }

  // ── Channel & Orchestrator init ─────────────────────────────────────────

  const appConfig = opts.config;
  if (appConfig) {
    // ── Generate models.json for authMode: "own" ──────────────────────
    try {
      const { generateModelsJson } = await import('./models.js');
      const modelsJson = generateModelsJson(appConfig);
      if (modelsJson) {
        const { writeFileSync: wf, mkdirSync: mkd } = await import('fs');
        const modelsDir = join(reebotDir, 'agent');
        mkd(modelsDir, { recursive: true });
        wf(join(modelsDir, 'models.json'), modelsJson, 'utf-8');
        getLogger().info({ component: 'server' }, '[server] models.json generated');
      }
    } catch (err) {
      getLogger().warn({ component: 'server', err }, '[server] models.json generation failed');
    }

    try {
      await import('./channels/web.js');
      await import('./channels/whatsapp.js');
      await import('./channels/signal.js');

      const { globalRegistry } = await import('./channels/registry.js');
      const { MessageBus } = await import('./channels/interface.js');
      const { Orchestrator: OrchestratorClass } = await import('./orchestrator.js');

      _bus = new MessageBus();

      _channelAdapters = await globalRegistry.initChannels(appConfig as any, _bus);

      const { scanSessionForUnansweredMessage } = await import('./resilience/startup.js');

      const orchestratorRunners = new Map<string, AgentRunner>();
      const contexts = listContexts(db);
      const inactivityMs = (appConfig as any).session?.inactivityTimeout ?? 14_400_000;
      const isReeMode = (appConfig as any)?.sdk === 'ree';

      if (isReeMode) {
        // ree mode: dynamic per-conversation runners over the shared ReeRuntime.
        // Do NOT eagerly build per-context runners — the orchestrator lazily
        // creates a runner per conversationId via the factory. All conversations
        // share ONE workspace (the RAG corpus); no per-customer directory.
        const sharedWorkspacePath = join(reebotDir, 'contexts', '__ree__', 'workspace');
        try { mkdirSync(sharedWorkspacePath, { recursive: true }); } catch { /* may already exist */ }
        const factory = (id: string): AgentRunner => createRunner(
          { id, workspacePath: sharedWorkspacePath },
          appConfig
        );
        // Register the runner factory for the delegate tool's same-process sub-agents.
        // Sub-agents get a unique context ID prefixed with __a2a__ (same pattern as
        // the A2A server endpoint) and share the same workspace.
        setDefaultRunnerFactory((_task: string): AgentRunner => createRunner(
          { id: `__a2a__${randomUUID()}`, workspacePath: sharedWorkspacePath },
          appConfig
        ));
        _orchestrator = new OrchestratorClass(
          appConfig as any,
          _bus,
          _channelAdapters,
          orchestratorRunners,
          db,
          { runnerFactory: factory }
        );
      } else {
        // pi mode: eagerly build one runner per registered context.
        for (const ctx of contexts) {
          const sessionsDir = join(reebotDir, 'sessions', ctx.id);
          const sessionPath = getResumedSessionPath(ctx.id, inactivityMs, reebotDir) ?? undefined;
          if (sessionPath) {
            const unanswered = scanSessionForUnansweredMessage(sessionPath);
            if (unanswered) {
              const snippet = unanswered.length > 120
                ? unanswered.substring(0, 120) + '…'
                : unanswered;
              broadcastToAllChannels(
                _channelAdapters,
                `⚠️ It looks like I may not have responded to your last message: "${snippet}". Please re-send if needed.`
              );
            }
          }
          orchestratorRunners.set(
            ctx.id,
            createRunner(
              { id: ctx.id, workspacePath: join(reebotDir, 'contexts', ctx.id, 'workspace'), sessionsDir, sessionPath },
              appConfig
            )
          );
        }
        // Register the runner factory for the delegate tool's same-process sub-agents.
        // Sub-agents get a unique context ID prefixed with __a2a__ (same pattern as
        // the A2A server endpoint and the ree-mode branch) with their own workspace.
        setDefaultRunnerFactory((_task: string): AgentRunner => createRunner(
          { id: `__a2a__${randomUUID()}`, workspacePath: join(reebotDir, 'contexts', '__a2a__', 'workspace') },
          appConfig
        ));
        _orchestrator = new OrchestratorClass(
          appConfig as any,
          _bus,
          _channelAdapters,
          orchestratorRunners,
          db
        );
      }
      _orchestrator.start();

      // ── Deferred resilience phase ───────────────────────────────────────
      try {
        const { notifyRestart, recoverCrashedTurns } = await import('./resilience/startup.js');
        const { createIncomingMessage } = await import('./channels/interface.js');
        notifyRestart(db, _channelAdapters);
        await recoverCrashedTurns(
          db,
          appConfig as any,
          _channelAdapters,
          (contextId: string, prompt: string) => {
            _bus!.publish(
              createIncomingMessage({
                channelType: 'recovery',
                peerId: contextId,
                content: prompt,
                raw: null,
              })
            );
          }
        );
      } catch (err) {
        getLogger().error({ component: 'server', err }, '[server] Deferred resilience startup failed');
      }

      // ── Credential proxy init ──────────────────────────────────────────
      if ((appConfig as any).credentialProxy?.enabled) {
        try {
          const { startProxy } = await import('./credential-proxy.js');
          const proxyServer = await startProxy(appConfig as any);
          if (proxyServer) {
            _credProxy = proxyServer;
            getLogger().info({ component: 'server' }, '[server] Credential proxy started on 127.0.0.1:3001');
          }
        } catch (err) {
          getLogger().error({ component: 'server', err }, '[server] Credential proxy init failed');
        }
      }

      // ── Scheduler init ─────────────────────────────────────────────────
      try {
        const { Scheduler } = await import('./scheduler.js');
        const { setGlobalScheduler } = await import('./scheduler-registry.js');

        const { createSchedulerTaskHandler } = await import('./scheduler-dispatch.js');
        const { createLlmCall } = await import('./llm/one-shot.js');
        const memoryConfig = (appConfig as any)?.memory ?? {};
        const memoriesDir = join(reebotDir, 'memories');
        const memoryCharLimit = memoryConfig.memoryCharLimit ?? 2200;
        const userCharLimit = memoryConfig.userCharLimit ?? 1375;
        const llmCall = createLlmCall(appConfig);

        const schedulerOrchestrator = {
          handleScheduledTask: createSchedulerTaskHandler({
            db,
            bus: _bus!,
            runConsolidation: async (opts) => {
              const { runConsolidation } = await import('./extensions/memory-manager.js');
              return runConsolidation(opts);
            },
            llmCall,
            memoriesDir,
            memoryCharLimit,
            userCharLimit,
          }),
        };

        const schedulerProvider: string = (appConfig as any)?.agent?.model?.provider ?? 'unknown';
        const schedulerInstance = new Scheduler(db, schedulerOrchestrator, { provider: schedulerProvider });
        await schedulerInstance.start();
        setGlobalScheduler(schedulerInstance);
        _scheduler = schedulerInstance;
        getLogger().info({ component: 'server' }, '[server] Scheduler started');

        // ── Bootstrap server jobs ─────────────────────────────────
        const { bootstrapServerJobs } = await import('./bootstrap.js');
        bootstrapServerJobs(db, schedulerInstance, appConfig);

        // ── Heartbeat init ───────────────────────────────────────────
        if (appConfig.heartbeat) {
          startHeartbeat(appConfig.heartbeat, db, _bus);
          if (appConfig.heartbeat.enabled) {
            getLogger().info({ component: 'server' }, '[server] System heartbeat started');
          }
        }
      } catch (err) {
        getLogger().error({ component: 'server', err }, '[server] Scheduler init failed');
      }
    } catch (err) {
      getLogger().error({ component: 'server', err }, '[server] Channel/orchestrator init failed');
    }
  }

  // ── Routes ──────────────────────────────────────────────────────────────

  // GET / — serve WebChat SPA (fallback if static serving missed it)
  app.get('/', async (c) => {
    const webchatPath = resolve(__dirname, '../webchat/dist/index.html');
    try {
      const html = readFileSync(webchatPath, 'utf-8');
      return c.text(html, 200, { 'Content-Type': 'text/html' });
    } catch {
      return c.json({ error: 'WebChat not found' }, 404);
    }
  });

  // GET /api/health
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: getVersion(),
    });
  });

  // GET /api/logs/stream — SSE live log stream
  app.get('/api/logs/stream', (c) => {
    const levelParam = c.req.query('level') ?? 'info';
    const levelNum = _pinoLevelToNumber(levelParam);

    return streamSSE(c, async (stream) => {
      const listener = (record: unknown) => {
        const r = record as any;
        // Apply level filter
        if (typeof r?.level === 'number' && r.level < levelNum) return;
        stream.writeSSE({ data: JSON.stringify(record) }).catch(() => {});
      };

      sseEmitter.on('log', listener);

      // Keep the stream alive until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          sseEmitter.off('log', listener);
          resolve();
        });
      });
    });
  });

  // GET /api/logs — persisted log history
  app.get('/api/logs', (c) => {
    const levelNum = _pinoLevelToNumber(c.req.query('level') ?? 'info');
    const raw = Number(c.req.query('limit') ?? '200');
    const limit = Math.max(1, Math.min(1000, Number.isFinite(raw) ? raw : 200));
    const rows = db.prepare(
      `SELECT level, msg, component, created_at FROM (
         SELECT id, level, msg, component, created_at FROM operational_logs
         WHERE level >= ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`
    ).all(levelNum, limit) as Array<{ level: number; msg: string; component: string | null; created_at: string }>;
    return c.json(rows.map((r) => ({
      timestamp: r.created_at,
      level: _pinoNumberToLevel(r.level),
      component: r.component ?? undefined,
      message: r.msg,
    })));
  });

  // GET /api/events — curated audit events (turn-grouped rollup source)
  app.get('/api/events', (c) => {
    const severityThreshold = _levelToOtelSeverity(c.req.query('level') ?? 'info');
    const contextFilter = c.req.query('context');
    const typeFilter = c.req.query('type');
    const rawLimit = Number(c.req.query('limit') ?? '200');
    const limit = Math.max(1, Math.min(1000, Number.isFinite(rawLimit) ? rawLimit : 200));

    const where: string[] = ['severity >= ?'];
    const params: any[] = [severityThreshold];
    if (contextFilter) { where.push('context_id = ?'); params.push(contextFilter); }
    if (typeFilter) { where.push('type = ?'); params.push(typeFilter); }
    const whereSql = where.join(' AND ');

    const rows = db.prepare(
      `SELECT id, type, severity, context_id, channel, peer_id, created_at, trace_id, payload,
              json_extract(payload, '$.turnId') AS turn_id
       FROM (
         SELECT id, type, severity, context_id, channel, peer_id, created_at, trace_id, payload, created_ns
         FROM events WHERE ${whereSql} ORDER BY created_ns DESC LIMIT ?
       ) ORDER BY created_ns ASC`
    ).all(...params, limit) as Array<any>;

    return c.json(rows.map((r) => ({
      id: r.id,
      timestamp: r.created_at,
      type: r.type,
      level: _otelSeverityToLevelString(r.severity),
      severity: r.severity,
      contextId: r.context_id,
      channel: r.channel,
      peerId: r.peer_id,
      traceId: r.trace_id,
      turnId: r.turn_id ?? null,
      payload: _safeParsePayload(r.payload),
    })));
  });

  // GET /api/status
  app.get('/api/status', (c) => {
    return c.json({
      agent: { name: 'Reeboot', model: { provider: '', id: '' } },
      channels: [],
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  // ── Channel REST API ────────────────────────────────────────────────────

  app.get('/api/channels', (c) => {
    const result: Array<{ type: string; status: string; connectedAt: string | null }> = [];
    for (const [type, adapter] of _channelAdapters) {
      result.push({ type, status: adapter.status(), connectedAt: adapter.connectedAt() });
    }
    return c.json(result);
  });

  app.post('/api/channels/:type/login', async (c) => {
    const type = c.req.param('type');
    const adapter = _channelAdapters.get(type);
    if (!adapter) {
      return c.json({ error: `Unknown channel type: ${type}` }, 404);
    }
    adapter.start().catch((err: any) => getLogger().error({ component: 'server', err }, `[channels] login error for ${type}`));
    return c.json({ message: 'Login initiated. Check terminal for QR code.' }, 202);
  });

  app.post('/api/channels/:type/logout', async (c) => {
    const type = c.req.param('type');
    const adapter = _channelAdapters.get(type);
    if (!adapter) {
      return c.json({ error: `Unknown channel type: ${type}` }, 404);
    }
    await adapter.stop();
    return c.json({ message: `${type} logged out.` }, 200);
  });

  // ── WhatsApp QR / pairing / reset endpoints ────────────────────────────

  app.post('/api/channels/whatsapp/qr', async (c) => {
    const adapter = _channelAdapters.get('whatsapp');
    if (!adapter) {
      return c.json({ error: 'WhatsApp channel not configured' }, 404);
    }

    const authDir = join(reebotDir, 'channels', 'whatsapp', 'auth');

    // Stop adapter and clear auth for a fresh link
    try { await adapter.stop(); } catch { /* may already be stopped */ }
    try {
      const { rmSync, mkdirSync } = await import('fs');
      rmSync(authDir, { recursive: true, force: true });
      mkdirSync(authDir, { recursive: true });
    } catch { /* auth dir may not exist yet */ }

    // Start linking using linkWhatsAppDevice
    const { linkWhatsAppDevice } = await import('./channels/whatsapp.js');
    const { toDataURL } = await import('qrcode');

    return await new Promise<Response>((resolve) => {
      let settled = false;

      linkWhatsAppDevice({
        authDir,
        onQr: async (qr: string) => {
          if (settled) return;
          settled = true;
          try {
            const qrDataUrl = await toDataURL(qr, { width: 280, margin: 2 });
            resolve(c.json({ qrDataUrl }, 200));
          } catch {
            resolve(c.json({ error: 'Failed to render QR code' }, 500));
          }
        },
        onSuccess: async () => {
          try { await adapter.start(); } catch (err: any) {
            getLogger().warn({ component: 'server', err }, '[qr] Failed to restart WhatsApp adapter after link');
          }
        },
        onTimeout: () => {
          if (!settled) {
            settled = true;
            resolve(c.json({ error: 'QR not generated within timeout' }, 408));
          }
        },
        timeoutMs: 120_000,
      }).catch((err: any) => {
        if (!settled) {
          settled = true;
          getLogger().error({ component: 'server', err }, '[qr] linkWhatsAppDevice failed');
          resolve(c.json({ error: 'QR link failed: ' + (err?.message ?? 'unknown') }, 500));
        }
      });
    });
  });

  // ── WhatsApp pairing / reset ────────────────────────────────────────────

  app.post('/api/channels/whatsapp/pair', async (c) => {
    const adapter = _channelAdapters.get('whatsapp');
    if (!adapter) {
      return c.json({ error: 'WhatsApp channel not configured' }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const phone: string = (body?.phone ?? '').trim();
    if (!phone) {
      return c.json({ error: 'phone is required' }, 400);
    }

    const authDir = join(reebotDir, 'channels', 'whatsapp', 'auth');

    // Stop adapter and clear auth for fresh pairing
    try { await adapter.stop(); } catch { /* may already be stopped */ }
    try {
      const { rmSync, mkdirSync } = await import('fs');
      rmSync(authDir, { recursive: true, force: true });
      mkdirSync(authDir, { recursive: true });
    } catch { /* auth dir may not exist yet */ }

    // Create Baileys socket with phone number for pairing
    const {
      makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      Browsers,
      fetchLatestWaWebVersion,
    } = await import('@whiskeysockets/baileys');

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version: [number, number, number];
    try {
      const result = await fetchLatestWaWebVersion({});
      version = result.version;
    } catch {
      version = [2, 3000, 1027934701];
    }

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      pairingCode: true,
      phoneNumber: phone,
      logger: getLogger().child({ component: 'whatsapp-pair' }),
    });

    return await new Promise<Response>((resolve) => {
      let settled = false;
      const PAIR_TIMEOUT_MS = 120_000;

      const timeoutHandle = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { sock.end(undefined); } catch { /* ignore */ }
          resolve(c.json({ error: 'Pairing timed out. Try again.' }, 408));
        }
      }, PAIR_TIMEOUT_MS);

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open' && !settled) {
          settled = true;
          clearTimeout(timeoutHandle);
          // Start the adapter with fresh auth
          adapter.start().catch((err: any) => {
            getLogger().warn({ component: 'server', err }, '[pair] Failed to start adapter after pairing');
          });
          resolve(c.json({ status: 'paired' }, 200));
        }

        if (connection === 'close' && !settled) {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            settled = true;
            clearTimeout(timeoutHandle);
            resolve(c.json({ error: 'Pairing rejected: device was logged out' }, 500));
          }
        }
      });
    });
  });

  app.post('/api/channels/whatsapp/reset', async (c) => {
    const adapter = _channelAdapters.get('whatsapp');
    if (!adapter) {
      return c.json({ error: 'WhatsApp channel not configured' }, 404);
    }

    const authDir = join(reebotDir, 'channels', 'whatsapp', 'auth');

    try { await adapter.stop(); } catch { /* may already be stopped */ }
    try {
      const { rmSync, mkdirSync } = await import('fs');
      rmSync(authDir, { recursive: true, force: true });
      mkdirSync(authDir, { recursive: true });
    } catch { /* auth dir may not exist yet */ }

    return c.json({ status: 'reset' }, 200);
  });

  // ── Reload & Restart ────────────────────────────────────────────────────

  app.post('/api/reload', async (c) => {
    if (!_orchestrator) {
      return c.json({ error: 'Orchestrator not running' }, 503);
    }
    const errors: string[] = [];
    for (const [id, runner] of _orchestrator.runners) {
      try {
        await runner.reload();
      } catch (err: any) {
        errors.push(`${id}: ${err.message}`);
      }
    }
    if (errors.length > 0) {
      return c.json({ error: errors.join('; ') }, 500);
    }
    return c.json({ message: 'Extensions and skills reloaded.' }, 200);
  });

  app.post('/api/restart', async (c) => {
    // Note: we can't block on async cleanup in a Hono handler easily,
    // but the original used reply.send() then process.exit(0).
    // We'll return the response and schedule the shutdown.
    const response = c.json({ message: 'Restarting...' }, 200);

    // Schedule shutdown after response is sent
    setTimeout(async () => {
      if (_orchestrator) {
        _orchestrator.stop();
      }

      for (const adapter of _channelAdapters.values()) {
        try { await adapter.stop(); } catch { /* ignore */ }
      }

      if (_orchestrator) {
        for (const runner of _orchestrator.runners.values()) {
          try { await runner.dispose(); } catch { /* ignore */ }
        }
        _orchestrator = null;
      }

      try { await _server?.close(() => {}); } catch { /* ignore */ }
      process.exit(0);
    }, 100);

    return response;
  });

  // ── REST: Task API ──────────────────────────────────────────────────────

  app.get('/api/tasks', (c) => {
    // Ree mode doesn't use the scheduler — return empty array
    if ((opts.config as any)?.sdk === 'ree') {
      return c.json([]);
    }
    const tasks = db
      .prepare('SELECT id, context_id as contextId, schedule, prompt, enabled, last_run as lastRun, created_at as createdAt FROM tasks')
      .all();
    return c.json(tasks);
  });

  app.post('/api/tasks', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { contextId = 'main', schedule, prompt } = body ?? {};

    if (!schedule || !prompt) {
      return c.json({ error: 'schedule and prompt are required' }, 400);
    }

    const { detectScheduleType } = await import('./scheduler/parse.js');
    try {
      detectScheduleType(schedule);
    } catch {
      return c.json({ error: 'invalid schedule expression' }, 400);
    }

    const { nanoid: nanoId } = await import('nanoid');
    const id = nanoId();

    db.prepare(
      'INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES (?, ?, ?, ?, 1)'
    ).run(id, contextId, schedule, prompt);

    if (_scheduler) {
      _scheduler.registerJob({ id, contextId, schedule, prompt });
    }

    const task = db
      .prepare('SELECT id, context_id as contextId, schedule, prompt, enabled, last_run as lastRun FROM tasks WHERE id = ?')
      .get(id);

    return c.json(task, 201);
  });

  app.delete('/api/tasks/:id', async (c) => {
    const id = c.req.param('id');
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return c.json({ error: `Task not found: ${id}` }, 404);
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

    if (_scheduler) {
      _scheduler.cancelJob(id);
    }

    return c.body(null, 204);
  });

  // ── REST: Context API ───────────────────────────────────────────────────

  app.get('/api/contexts', (c) => {
    // Ree mode uses chats table, not contexts — return empty array
    if ((opts.config as any)?.sdk === 'ree') {
      return c.json([]);
    }
    return c.json(listContexts(db));
  });

  app.post('/api/contexts', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { name, model_provider, model_id } = body ?? {};
    if (!name) {
      return c.json({ error: 'name is required' }, 400);
    }
    const ctx = createContext(db, {
      name,
      modelProvider: model_provider ?? '',
      modelId: model_id ?? '',
    });
    await initContextWorkspace(ctx.id, reebotDir);
    return c.json(ctx, 201);
  });

  app.get('/api/contexts/:id/sessions', async (c) => {
    // Ree mode doesn't have pi-style sessions — return empty array
    if ((opts.config as any)?.sdk === 'ree') {
      return c.json([]);
    }
    const ctx = getContextById(db, c.req.param('id'));
    if (!ctx) {
      return c.json({ error: 'Context not found' }, 404);
    }
    const sessions = await listSessions(c.req.param('id'), reebotDir);
    return c.json(sessions);
  });

  app.get('/api/contexts/:id/messages', (c) => {
    const id = c.req.param('id');
    const ctx = getContextById(db, id);
    if (!ctx) return c.json({ error: 'Context not found' }, 404);
    const raw = Number(c.req.query('limit') ?? '200');
    const limit = Math.max(1, Math.min(1000, Number.isFinite(raw) ? raw : 200));
    const rows = db.prepare(
      `SELECT role, content, created_at FROM (
         SELECT rowid, role, content, created_at FROM messages
         WHERE context_id = ? ORDER BY rowid DESC LIMIT ?
       ) ORDER BY rowid ASC`
    ).all(id, limit);
    return c.json(rows);
  });

  // ── REST: Budget settings ─────────────────────────────────────────────────

  // Mutable config reference for budget settings (updated by PUT)
  let _mutableConfig = appConfig ? { ...(appConfig as any) } : {} as any;

  app.get('/api/settings/budget', (c) => {
    const budget = _mutableConfig.budget ?? {};

    // Query today's spend and session spend from usage table.
    // Session spend = rows created since server start (not just today).
    const sessionStartTs = new Date(startTime).toISOString().replace('T', ' ').slice(0, 19);
    let spend = { today_cost_usd: 0, today_tokens: 0, session_cost_usd: 0, session_tokens: 0 };
    try {
      const todayRow = db.prepare(`
        SELECT
          COALESCE(SUM(cost_usd), 0) as cost,
          COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
        FROM usage
        WHERE created_at >= date('now', 'start of day')
      `).get() as { cost: number; tokens: number };
      spend.today_cost_usd = todayRow.cost;
      spend.today_tokens = todayRow.tokens;

      // Session = rows created since server start
      const sessionRow = db.prepare(`
        SELECT
          COALESCE(SUM(cost_usd), 0) as cost,
          COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
        FROM usage
        WHERE created_at >= ?
      `).get(sessionStartTs) as { cost: number; tokens: number };
      spend.session_cost_usd = sessionRow.cost;
      spend.session_tokens = sessionRow.tokens;
    } catch { /* table may not have cost_usd column yet */ }

    return c.json({ limits: budget, spend });
  });

  app.put('/api/settings/budget', async (c) => {
    const body = await c.req.json().catch(() => ({}));

    // Merge partial budget config into mutable config
    _mutableConfig = {
      ..._mutableConfig,
      budget: { ...(_mutableConfig.budget ?? {}), ...body },
    };

    // Persist to config.json
    try {
      const { loadConfig, saveConfig } = await import('./config.js');
      const saved = loadConfig(configPath);
      (saved as any).budget = { ...((saved as any).budget ?? {}), ...body };
      saveConfig(saved, configPath);
    } catch { /* non-fatal if config file doesn't exist */ }

    // Update the live orchestrator's BudgetGuard so new limits take effect immediately
    if (_orchestrator && typeof (_orchestrator as any).updateBudgetConfig === 'function') {
      (_orchestrator as any).updateBudgetConfig(body);
    }

    return c.json({ ok: true, budget: _mutableConfig.budget });
  });

  // ── WebSocket: /ws/chat/:contextId ──────────────────────────────────────

  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.get('/ws/chat/:contextId', upgradeWebSocket((c) => {
    const contextId = c.req.param('contextId')!;
    const clientIp = (c.env as any)?.incoming?.socket?.remoteAddress ?? '';

    const sessionId = nanoid();
    // ree mode: the path segment is the conversationId (isolation axis). It is
    // NOT a pre-registered context — runners are created dynamically. The
    // nanoid sessionId stays the per-connection reply-routing token (peerId).
    const isReeMode = (opts.config as any)?.sdk === 'ree';

    return {
      onOpen(_event, ws) {
        // Auth check for non-loopback connections
        if (serverToken) {
          if (!isLoopback(clientIp)) {
            const provided = extractToken(c);
            if (provided !== serverToken) {
              ws.close(1008, 'Unauthorized');
              return;
            }
          }
        }

        // pi mode: validate context exists (static runner map).
        // ree mode: dynamic conversation ids are never in `contexts` — skip the
        // gate. Per-customer isolation comes from conversationId → chat. Invalid /
        // reserved ids are rejected at message time (before dispatch).
        if (!isReeMode) {
          const ctx = getContextById(db, contextId);
          if (!ctx) {
            ws.close(4004, 'Unknown context');
            return;
          }
        }

        // Register peer with WebAdapter for reply routing
        // wsSend is a no-op — streaming events deliver everything via sendEvent
        const wsSend = async () => {};
        const wsEvent = (event: any) => {
          try { ws.send(JSON.stringify(event)); } catch { /* connection may be closed */ }
        };
        webAdapter.registerPeer(sessionId, wsSend, wsEvent);

        // Send connected event with unique sessionId
        ws.send(JSON.stringify({ type: 'connected', contextId, sessionId }));
      },

      onMessage: async (event, ws) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
          return;
        }

        // ree mode: validate the conversation id before any dispatch. Reject
        // reserved/invalid ids with an error frame and do not publish.
        if (isReeMode && !isValidConversationId(contextId)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Invalid or reserved conversation id: "${contextId}"`,
          }));
          return;
        }

        if (msg.type === 'cancel') {
          // Publish a cancellation signal to the bus.
          // The orchestrator detects action: 'cancel' and calls runner.abort().
          if (_bus) {
            _bus.publish(createIncomingMessage({
              channelType: 'web',
              peerId: sessionId,
              conversationId: isReeMode ? contextId : undefined,
              content: '',
              raw: null,
              action: 'cancel',
            }));
          }
          ws.send(JSON.stringify({ type: 'cancelled' }));
          return;
        }

        if (msg.type === 'action') {
          if (!_bus) {
            ws.send(JSON.stringify({ type: 'error', message: 'Server not fully initialized' }));
            return;
          }

          // Build structured content from the action message
          let actionContent: string;
          if (msg.action === 'confirm') {
            actionContent = `[User confirmed: ${msg.value ?? false}]`;
          } else if (msg.action === 'form_submit') {
            actionContent = `[Form Response: ${JSON.stringify(msg.fields ?? {})}]`;
          } else {
            actionContent = `[Action: ${JSON.stringify(msg)}]`;
          }

          _bus.publish(createIncomingMessage({
            channelType: 'web',
            peerId: sessionId,
            conversationId: isReeMode ? contextId : undefined,
            content: actionContent,
            raw: null,
          }));
          return;
        }

        if (msg.type === 'message') {
          if (!_bus) {
            ws.send(JSON.stringify({ type: 'error', message: 'Server not fully initialized' }));
            return;
          }
          _bus.publish(createIncomingMessage({
            channelType: 'web',
            peerId: sessionId,
            conversationId: isReeMode ? contextId : undefined,
            content: msg.content ?? '',
            raw: null,
          }));
        }
      },

      onClose(_event, ws) {
        webAdapter.unregisterPeer(sessionId);
      },
    };
  }));

  // ── A2A: Agent-to-Agent protocol ─────────────────────────────────────────
  // Peer discovery — returns server metadata
  app.get('/a2a/capabilities', async (c) => {
    // API key check (optional)
    const a2aConfig = (opts.config as any)?.a2a ?? {};
    const serverKey = a2aConfig.server?.apiKey;
    if (serverKey) {
      const auth = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
      if (auth !== serverKey) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

    // Collect tool names from the first available runner
    const toolNames: string[] = [];
    if (_orchestrator) {
      for (const runner of _orchestrator.runners.values()) {
        try {
          const tools = await (runner as any).getAllTools?.() ?? [];
          toolNames.push(...tools.map((t: any) => t.name));
        } catch { /* skip */ }
      }
    }

    return c.json({
      name: 'reeboot',
      version: '2.6.0',
      tools: [...new Set(toolNames)],
      protocols: ['a2a-v1'],
    });
  });

  // Task invocation — receives a task, runs it, returns the result
  app.post('/a2a/invoke', async (c) => {
    // API key check (optional)
    const a2aConfig = (opts.config as any)?.a2a ?? {};
    const serverKey = a2aConfig.server?.apiKey;
    if (serverKey) {
      const auth = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
      if (auth !== serverKey) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const task: string = body.task ?? '';
    if (!task.trim()) {
      return c.json({ error: 'Missing required field: task' }, 400);
    }

    const timeoutMs = (body.timeout ?? 60) * 1000;
    const id = `a2a-${randomUUID()}`;

    try {
      const workspacePath = join(reebotDir, 'contexts', '__a2a__', id, 'workspace');
      mkdirSync(workspacePath, { recursive: true });

      const runner = createRunner(
        { id, workspacePath },
        { ...(opts.config as any), sdk: (opts.config as any)?.sdk ?? 'pi' }
      );

      if (!runner) {
        return c.json({ error: 'Failed to create runner' }, 500);
      }

      const completionPromise = new Promise<string>((resolve, reject) => {
        const segments: string[] = [];
        const timer = setTimeout(() => {
          runner.abort();
          reject(new Error('Timed out'));
        }, timeoutMs);

        runner.prompt(task, (event) => {
          if (event.type === 'text_delta') {
            segments.push(event.delta);
          } else if (event.type === 'message_end') {
            clearTimeout(timer);
            resolve(segments.join(''));
          } else if (event.type === 'error') {
            clearTimeout(timer);
            reject(new Error(event.message));
          }
        }).catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const result = await completionPromise;

      // Cleanup
      runner.dispose().catch(() => {});

      return c.json({ status: 'completed', id, result });
    } catch (err: any) {
      return c.json({
        status: 'failed',
        id,
        error: err?.message ?? String(err),
      }, 500);
    }
  });

  // ── Serve built WebChat SPA (catches all non-API routes) ────────────────
  try {
    const webchatDist = resolve(__dirname, '../webchat/dist');
    app.use('*', serveStatic({ root: webchatDist, index: 'index.html' }));
  } catch {
    // webchat/dist may not exist in test environments — that's OK
  }

  // Custom 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  // ── Start HTTP server ───────────────────────────────────────────────────

  const server = createAdaptorServer({ fetch: app.fetch });
  injectWebSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;

  _server = server;
  return { port: boundPort, host };
}

// ─── stopServer ──────────────────────────────────────────────────────────────

export async function stopServer(): Promise<void> {
  // Clear retention timer
  if (_retentionTimer) {
    clearInterval(_retentionTimer);
    _retentionTimer = null;
  }

  // Stop credential proxy
  if (_credProxy) {
    try { await new Promise<void>((r) => _credProxy!.close(() => r())); } catch { /* ignore */ }
    _credProxy = null;
  }

  // Stop heartbeat
  const { stopHeartbeat } = await import('./scheduler/heartbeat.js');
  stopHeartbeat();

  // Stop scheduler
  if (_scheduler) {
    _scheduler.stop();
    _scheduler = null;
  }

  // Stop orchestrator
  if (_orchestrator) {
    _orchestrator.stop();
    _orchestrator = null;
  }

  // Stop channel adapters
  for (const adapter of _channelAdapters.values()) {
    try { await adapter.stop(); } catch { /* ignore */ }
  }
  _channelAdapters.clear();

  if (_server) {
    await new Promise<void>((resolve) => {
      _server!.close(() => resolve());
    });
    _server = null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function _pinoLevelToNumber(level: string): number {
  switch (level.toLowerCase()) {
    case 'trace': return 10;
    case 'debug': return 20;
    case 'info':  return 30;
    case 'warn':  return 40;
    case 'error': return 50;
    case 'fatal': return 60;
    default:      return 30; // default to info
  }
}

function _pinoNumberToLevel(n: number): string {
  if (n >= 60) return 'fatal';
  if (n >= 50) return 'error';
  if (n >= 40) return 'warn';
  if (n >= 30) return 'info';
  return 'debug';
}

/** Map a UI level string to the OTEL severity threshold (9/13/17/21). */
function _levelToOtelSeverity(level: string): number {
  switch (level.toLowerCase()) {
    case 'warn':   return 13;
    case 'error':  return 17;
    case 'fatal':  return 21;
    case 'info':
    default:       return 9;
  }
}

/** Map an OTEL severity number to a UI level string. */
function _otelSeverityToLevelString(severity: number): string {
  if (severity >= 21) return 'fatal';
  if (severity >= 17) return 'error';
  if (severity >= 13) return 'warn';
  return 'info';
}

/** Parse a JSON payload column defensively (null/empty → {}). */
function _safeParsePayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}
