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
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import type { AgentRunner } from './agent-runner/index.js';
import { createRunner } from './agent-runner/index.js';
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
import type { ChannelAdapter } from './channels/interface.js';
import type { Orchestrator } from './orchestrator.js';
import { broadcastToAllChannels } from './utils/broadcast.js';
import type { Scheduler } from './scheduler.js';

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

// Active runners: contextId → AgentRunner
const _activeRunners = new Map<string, AgentRunner>();

// Channel adapters (set during startServer)
let _channelAdapters = new Map<string, ChannelAdapter>();

// Orchestrator (set during startServer)
let _orchestrator: Orchestrator | null = null;

// Scheduler (set during startServer)
let _scheduler: Scheduler | null = null;

// Credential proxy (set during startServer)
let _credProxy: ServerType | null = null;

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

  // ── Static file serving for webchat ──────────────────────────────────────
  const webchatDir = resolve(__dirname, '../webchat');
  try {
    app.use('*', serveStatic({ root: webchatDir, index: 'index.html' }));
  } catch {
    // webchat dir may not exist in test environments — that's OK
  }

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

  // ── Channel & Orchestrator init ─────────────────────────────────────────

  const appConfig = opts.config;
  if (appConfig) {
    try {
      await import('./channels/web.js');
      await import('./channels/whatsapp.js');
      await import('./channels/signal.js');

      const { globalRegistry } = await import('./channels/registry.js');
      const { MessageBus } = await import('./channels/interface.js');
      const { Orchestrator: OrchestratorClass } = await import('./orchestrator.js');

      const bus = new MessageBus();

      _channelAdapters = await globalRegistry.initChannels(appConfig as any, bus);

      const { scanSessionForUnansweredMessage } = await import('./resilience/startup.js');

      const orchestratorRunners = new Map<string, AgentRunner>();
      const contexts = listContexts(db);
      const inactivityMs = (appConfig as any).session?.inactivityTimeout ?? 14_400_000;
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

      _orchestrator = new OrchestratorClass(
        appConfig as any,
        bus,
        _channelAdapters,
        orchestratorRunners,
        db
      );
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
            bus.publish(
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
        console.error('[server] Deferred resilience startup failed:', err);
      }

      // ── Credential proxy init ──────────────────────────────────────────
      if ((appConfig as any).credentialProxy?.enabled) {
        try {
          const { startProxy } = await import('./credential-proxy.js');
          const proxyServer = await startProxy(appConfig as any);
          if (proxyServer) {
            _credProxy = proxyServer;
            console.log('[server] Credential proxy started on 127.0.0.1:3001');
          }
        } catch (err) {
          console.error('[server] Credential proxy init failed:', err);
        }
      }

      // ── Scheduler init ─────────────────────────────────────────────────
      try {
        const { Scheduler } = await import('./scheduler.js');
        const { setGlobalScheduler } = await import('./scheduler-registry.js');

        const schedulerOrchestrator = {
          handleScheduledTask: async (task: any) => {
            const { createIncomingMessage } = await import('./channels/interface.js');
            const { buildScheduledPrompt } = await import('./scheduler.js');
            const enrichedPrompt = buildScheduledPrompt(task);
            bus.publish(
              createIncomingMessage({
                channelType: 'scheduler',
                peerId: 'scheduler',
                content: enrichedPrompt,
                raw: {
                  taskId: task.taskId,
                  origin_channel: task.origin_channel ?? null,
                  origin_peer: task.origin_peer ?? null,
                },
              })
            );
          },
        };

        const schedulerInstance = new Scheduler(db, schedulerOrchestrator);
        await schedulerInstance.start();
        setGlobalScheduler(schedulerInstance);
        _scheduler = schedulerInstance;
        console.log('[server] Scheduler started');

        // ── Heartbeat init ───────────────────────────────────────────
        if (appConfig.heartbeat) {
          startHeartbeat(appConfig.heartbeat, db, bus);
          if (appConfig.heartbeat.enabled) {
            console.log('[server] System heartbeat started');
          }
        }
      } catch (err) {
        console.error('[server] Scheduler init failed:', err);
      }
    } catch (err) {
      console.error('[server] Channel/orchestrator init failed:', err);
    }
  }

  // ── Routes ──────────────────────────────────────────────────────────────

  // GET / — serve WebChat (fallback if serveStatic missed it)
  app.get('/', async (c) => {
    const webchatPath = resolve(__dirname, '../webchat/index.html');
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
    adapter.start().catch((err: any) => console.error(`[channels] login error for ${type}:`, err));
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
      const DRAIN_TIMEOUT_MS = 30_000;
      const drainStart = Date.now();

      if (_orchestrator) {
        _orchestrator.stop();
      }

      while (_activeRunners.size > 0 && Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 100));
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
    const ctx = getContextById(db, c.req.param('id'));
    if (!ctx) {
      return c.json({ error: 'Context not found' }, 404);
    }
    const sessions = await listSessions(c.req.param('id'), reebotDir);
    return c.json(sessions);
  });

  // ── WebSocket: /ws/chat/:contextId ──────────────────────────────────────

  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.get('/ws/chat/:contextId', upgradeWebSocket((c) => {
    const contextId = c.req.param('contextId')!;
    const clientIp = (c.env as any)?.incoming?.socket?.remoteAddress ?? '';

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

        // Validate context exists
        const ctx = getContextById(db, contextId);
        if (!ctx) {
          ws.close(4004, 'Unknown context');
          return;
        }

        // Generate session ID
        const sessionId = nanoid();
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

        if (msg.type === 'cancel') {
          const runner = _activeRunners.get(contextId);
          if (runner) {
            runner.abort();
            _activeRunners.delete(contextId);
            ws.send(JSON.stringify({ type: 'cancelled' }));
          }
          return;
        }

        if (msg.type === 'message') {
          // Check if a turn is already in-flight
          if (_activeRunners.has(contextId)) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Agent is busy. Cancel the current turn first.',
            }));
            return;
          }

          const runId = nanoid();

          // Get or create runner
          let runner: AgentRunner;
          try {
            const { defaultConfig } = await import('./config.js');
            const cfg = opts.config ?? defaultConfig;
            runner = createRunner(
              { id: contextId, workspacePath: join(reebotDir, 'contexts', contextId, 'workspace') },
              cfg
            );
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'error', message: String(err?.message ?? err) }));
            return;
          }

          _activeRunners.set(contextId, runner);

          try {
            await runner.prompt(msg.content ?? '', (event) => {
              ws.send(JSON.stringify(event));
            });
          } catch (err: any) {
            if (err?.name !== 'AbortError') {
              ws.send(JSON.stringify({ type: 'error', message: String(err?.message ?? err) }));
            }
          } finally {
            _activeRunners.delete(contextId);
          }
        }
      },

      onClose(_event, ws) {
        const runner = _activeRunners.get(contextId);
        if (runner) {
          runner.abort();
          _activeRunners.delete(contextId);
        }
      },
    };
  }));

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

  // Abort all active runners before closing
  for (const runner of _activeRunners.values()) {
    try { runner.abort(); } catch { /* ignore */ }
  }
  _activeRunners.clear();

  if (_server) {
    await new Promise<void>((resolve) => {
      _server!.close(() => resolve());
    });
    _server = null;
  }
}
