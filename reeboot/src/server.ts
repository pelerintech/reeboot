import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { startHeartbeat } from './scheduler/heartbeat.js';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
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
import type { FastifyInstance as CredProxyInstance } from 'fastify';

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

let _server: FastifyInstance | null = null;

// Active runners: contextId → AgentRunner
const _activeRunners = new Map<string, AgentRunner>();

// Channel adapters (set during startServer)
let _channelAdapters = new Map<string, ChannelAdapter>();

// Orchestrator (set during startServer)
let _orchestrator: Orchestrator | null = null;

// Scheduler (set during startServer)
let _scheduler: Scheduler | null = null;

// Credential proxy (set during startServer)
let _credProxy: CredProxyInstance | null = null;

// ─── Auth helper ─────────────────────────────────────────────────────────────

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function extractToken(req: FastifyRequest): string | undefined {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  const url = new URL(req.url, 'http://localhost');
  return url.searchParams.get('token') ?? undefined;
}

// ─── startServer ─────────────────────────────────────────────────────────────

export async function startServer(opts: ServerOptions = {}): Promise<FastifyInstance> {
  const port = opts.port ?? 3000;
  const host = opts.host ?? '127.0.0.1';
  const logLevel = opts.logLevel ?? 'info';
  const reebotDir = opts.reebotDir ?? join(homedir(), '.reeboot');
  const serverToken = opts.token;

  const isDev = process.env.NODE_ENV !== 'production';
  const logger = logLevel === 'silent'
    ? false
    : {
        level: logLevel,
        ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
      };

  const server = Fastify({ logger });

  // Register WebSocket plugin
  await server.register(fastifyWebsocket);

  // Register static file serving for webchat
  const webchatDir = resolve(__dirname, '../webchat');
  try {
    await server.register(fastifyStatic, {
      root: webchatDir,
      prefix: '/',
      decorateReply: false,
    });
  } catch {
    // webchat dir may not exist in test environments — that's OK
  }

  // Get or set up the DB
  let db: Database.Database;
  if (opts.db) {
    db = opts.db;
    createContextsTable(db);
    // Ensure main context exists
    if (!getContextById(db, 'main')) {
      createContext(db, { id: 'main', name: 'main', modelProvider: '', modelId: '' });
    }
  } else {
    const { openDatabase } = await import('./db/index.js');
    db = openDatabase();
    // Ensure main context exists
    if (!getContextById(db, 'main')) {
      createContext(db, { id: 'main', name: 'main', modelProvider: '', modelId: '' });
    }
  }

  // Ensure context workspace and agent dir (AGENTS.md persona) exist
  await initContexts(db, reebotDir);

  // Migrate legacy config.json packages to ~/.reeboot/agent/settings.json
  const configPath = join(reebotDir, 'config.json');
  const agentDir = join(reebotDir, 'agent');
  await migratePackages(configPath, agentDir);

  // ── Resilience startup — DB-only phase (no adapters needed) ───────────────
  {
    const { runResilienceMigration } = await import('./db/schema.js');
    const { applyScheduledCatchup } = await import('./resilience/startup.js');
    runResilienceMigration(db);
    const resConfig = opts.config ?? {};
    applyScheduledCatchup(db, resConfig as any);
  }

  // ── Channel & Orchestrator init ───────────────────────────────────────────

  const appConfig = opts.config;
  if (appConfig) {
    try {
      // Import built-in adapters so they self-register
      await import('./channels/web.js');
      await import('./channels/whatsapp.js');
      await import('./channels/signal.js');

      const { globalRegistry } = await import('./channels/registry.js');
      const { MessageBus } = await import('./channels/interface.js');
      const { Orchestrator: OrchestratorClass } = await import('./orchestrator.js');

      const bus = new MessageBus();

      // Init channels from config
      _channelAdapters = await globalRegistry.initChannels(
        appConfig as any,
        bus
      );

      // Needed for unanswered-message scan inside the contexts loop below
      const { scanSessionForUnansweredMessage } = await import('./resilience/startup.js');

      // Build runner map for orchestrator (main context)
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
              `⚠️ It looks like I may not have responded to your last message: “${snippet}”. Please re-send if needed.`
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

      // ── Resilience startup — deferred phase (requires channels + bus) ───────
      // notifyRestart and recoverCrashedTurns must run AFTER initChannels so
      // _channelAdapters is the populated Map, not the empty initial one.
      try {
        const { notifyRestart, recoverCrashedTurns } = await import('./resilience/startup.js');
        const { createIncomingMessage } = await import('./channels/interface.js');
        notifyRestart(db, _channelAdapters);
        await recoverCrashedTurns(
          db,
          appConfig as any,
          _channelAdapters,
          (contextId: string, prompt: string) => {
            // Re-queue the crashed prompt into the running orchestrator via the bus.
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

      // ── Scheduler init (after orchestrator) ────────────────────────────
      try {
        const { Scheduler } = await import('./scheduler.js');
        const { setGlobalScheduler } = await import('./scheduler-registry.js');

        const schedulerOrchestrator = {
          handleScheduledTask: async (task: { taskId: string; contextId: string; prompt: string; origin_channel?: string | null; origin_peer?: string | null }) => {
            // Inject scheduled task as a message via the bus
            const { createIncomingMessage } = await import('./channels/interface.js');
            const { buildScheduledPrompt } = await import('./scheduler.js');
            const enrichedPrompt = buildScheduledPrompt(task as any);
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

        // ── Heartbeat init (after scheduler) ───────────────────────────
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

  // ── Routes ────────────────────────────────────────────────────────────────

  // GET / — serve WebChat
  server.get('/', async (req, reply) => {
    const webchatPath = resolve(__dirname, '../webchat/index.html');
    try {
      const html = readFileSync(webchatPath, 'utf-8');
      reply.type('text/html').send(html);
    } catch {
      reply.status(404).send({ error: 'WebChat not found' });
    }
  });

  // GET /api/health
  server.get('/api/health', async (_req, _reply) => {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: getVersion(),
    };
  });

  // GET /api/status
  server.get('/api/status', async (_req, _reply) => {
    return {
      agent: { name: 'Reeboot', model: { provider: '', id: '' } },
      channels: [],
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  // ── Channel REST API ──────────────────────────────────────────────────────

  // GET /api/channels
  server.get('/api/channels', async (_req, _reply) => {
    const result: Array<{ type: string; status: string; connectedAt: string | null }> = [];
    for (const [type, adapter] of _channelAdapters) {
      result.push({ type, status: adapter.status(), connectedAt: adapter.connectedAt() });
    }
    return result;
  });

  // POST /api/channels/:type/login
  server.post<{ Params: { type: string } }>('/api/channels/:type/login', async (req, reply) => {
    const { type } = req.params;
    const adapter = _channelAdapters.get(type);
    if (!adapter) {
      return reply.status(404).send({ error: `Unknown channel type: ${type}` });
    }
    // Start login flow asynchronously (QR appears in terminal)
    adapter.start().catch((err) => console.error(`[channels] login error for ${type}:`, err));
    return reply.status(202).send({ message: 'Login initiated. Check terminal for QR code.' });
  });

  // POST /api/channels/:type/logout
  server.post<{ Params: { type: string } }>('/api/channels/:type/logout', async (req, reply) => {
    const { type } = req.params;
    const adapter = _channelAdapters.get(type);
    if (!adapter) {
      return reply.status(404).send({ error: `Unknown channel type: ${type}` });
    }
    await adapter.stop();
    return reply.status(200).send({ message: `${type} logged out.` });
  });

  // ── Reload & Restart ──────────────────────────────────────────────────────

  // POST /api/reload — hot-reload extensions/skills on all runners
  server.post('/api/reload', async (_req, reply) => {
    if (!_orchestrator) {
      return reply.status(503).send({ error: 'Orchestrator not running' });
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
      return reply.status(500).send({ error: errors.join('; ') });
    }
    return { message: 'Extensions and skills reloaded.' };
  });

  // POST /api/restart — graceful shutdown, process supervisor restarts
  server.post('/api/restart', async (_req, reply) => {
    reply.status(200).send({ message: 'Restarting...' });

    // Drain in-flight turns (timeout 30s)
    const DRAIN_TIMEOUT_MS = 30_000;
    const drainStart = Date.now();

    // Stop orchestrator so no new messages are dispatched
    if (_orchestrator) {
      _orchestrator.stop();
    }

    // Wait for active runners (ws handler uses _activeRunners)
    while (_activeRunners.size > 0 && Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Stop channels and dispose orchestrator runners
    for (const adapter of _channelAdapters.values()) {
      try { await adapter.stop(); } catch { /* ignore */ }
    }

    if (_orchestrator) {
      for (const runner of _orchestrator.runners.values()) {
        try { await runner.dispose(); } catch { /* ignore */ }
      }
      _orchestrator = null;
    }

    // Close server and exit — supervisor restarts
    try { await _server?.close(); } catch { /* ignore */ }
    process.exit(0);
  });

  // ── REST: Task API ────────────────────────────────────────────────────────

  // GET /api/tasks
  server.get('/api/tasks', async (_req, _reply) => {
    const tasks = db
      .prepare('SELECT id, context_id as contextId, schedule, prompt, enabled, last_run as lastRun, created_at as createdAt FROM tasks')
      .all();
    return tasks;
  });

  // POST /api/tasks
  server.post<{
    Body: { contextId?: string; schedule?: string; prompt?: string };
  }>('/api/tasks', async (req, reply) => {
    const { contextId = 'main', schedule, prompt } = req.body ?? {};

    if (!schedule || !prompt) {
      return reply.status(400).send({ error: 'schedule and prompt are required' });
    }

    // Validate schedule string (supports cron, interval, or ISO datetime)
    const { detectScheduleType } = await import('./scheduler/parse.js');
    try {
      detectScheduleType(schedule);
    } catch {
      return reply.status(400).send({ error: 'invalid schedule expression' });
    }

    const { nanoid: nanoId } = await import('nanoid');
    const id = nanoId();

    db.prepare(
      'INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES (?, ?, ?, ?, 1)'
    ).run(id, contextId, schedule, prompt);

    // Register with scheduler if available
    if (_scheduler) {
      _scheduler.registerJob({ id, contextId, schedule, prompt });
    }

    const task = db
      .prepare('SELECT id, context_id as contextId, schedule, prompt, enabled, last_run as lastRun FROM tasks WHERE id = ?')
      .get(id);

    return reply.status(201).send(task);
  });

  // DELETE /api/tasks/:id
  server.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params;
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return reply.status(404).send({ error: `Task not found: ${id}` });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

    if (_scheduler) {
      _scheduler.cancelJob(id);
    }

    return reply.status(204).send();
  });

  // ── REST: Context API ─────────────────────────────────────────────────────

  // GET /api/contexts
  server.get('/api/contexts', async (_req, _reply) => {
    return listContexts(db);
  });

  // POST /api/contexts
  server.post<{
    Body: { name?: string; model_provider?: string; model_id?: string };
  }>('/api/contexts', async (req, reply) => {
    const { name, model_provider, model_id } = req.body ?? {};
    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }
    const ctx = createContext(db, {
      name,
      modelProvider: model_provider ?? '',
      modelId: model_id ?? '',
    });
    await initContextWorkspace(ctx.id, reebotDir);
    return reply.status(201).send(ctx);
  });

  // GET /api/contexts/:id/sessions
  server.get<{ Params: { id: string } }>('/api/contexts/:id/sessions', async (req, reply) => {
    const ctx = getContextById(db, req.params.id);
    if (!ctx) {
      return reply.status(404).send({ error: 'Context not found' });
    }
    const sessions = await listSessions(req.params.id, reebotDir);
    return sessions;
  });

  // ── WebSocket: /ws/chat/:contextId ───────────────────────────────────────

  server.get<{ Params: { contextId: string } }>(
    '/ws/chat/:contextId',
    { websocket: true },
    async (socket, req) => {
      const { contextId } = req.params;

      // Auth check for non-loopback connections
      if (serverToken) {
        const clientIp = req.socket.remoteAddress ?? '';
        if (!isLoopback(clientIp)) {
          const provided = extractToken(req);
          if (provided !== serverToken) {
            socket.close(1008, 'Unauthorized');
            return;
          }
        }
      }

      // Validate context exists
      const ctx = getContextById(db, contextId);
      if (!ctx) {
        socket.close(4004, 'Unknown context');
        return;
      }

      // Generate session ID
      const sessionId = nanoid();

      // Send connected message
      socket.send(JSON.stringify({ type: 'connected', contextId, sessionId }));

      let activeRunId: string | null = null;

      socket.on('message', async (rawData: Buffer | string) => {
        let msg: any;
        try {
          msg = JSON.parse(rawData.toString());
        } catch {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
          return;
        }

        if (msg.type === 'cancel') {
          const runner = _activeRunners.get(contextId);
          if (runner) {
            runner.abort();
            socket.send(JSON.stringify({ type: 'cancelled', runId: activeRunId }));
            _activeRunners.delete(contextId);
            activeRunId = null;
          }
          return;
        }

        if (msg.type === 'message') {
          // Check if a turn is already in-flight
          if (_activeRunners.has(contextId)) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Agent is busy. Cancel the current turn first.',
            }));
            return;
          }

          const runId = nanoid();
          activeRunId = runId;

          // Get or create runner
          let runner: AgentRunner;
          try {
            const { defaultConfig } = await import('./config.js');
            const cfg = opts.config ?? defaultConfig;
            runner = createRunner(
              { id: contextId, workspacePath: join(reebotDir, 'contexts', contextId, 'workspace') },
              cfg
            );
          } catch (err) {
            socket.send(JSON.stringify({ type: 'error', message: String((err as Error).message) }));
            return;
          }

          _activeRunners.set(contextId, runner);

          try {
            await runner.prompt(msg.content ?? '', (event) => {
              socket.send(JSON.stringify(event));
            });
          } catch (err: any) {
            if (err?.name !== 'AbortError') {
              socket.send(JSON.stringify({ type: 'error', message: String(err?.message ?? err) }));
            }
          } finally {
            _activeRunners.delete(contextId);
            activeRunId = null;
          }
        }
      });

      socket.on('close', () => {
        // Abort runner if still active
        const runner = _activeRunners.get(contextId);
        if (runner) {
          runner.abort();
          _activeRunners.delete(contextId);
        }
      });
    }
  );

  // Custom 404 handler
  server.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'Not found' });
  });

  await server.listen({ port, host });

  _server = server;
  return server;
}

// ─── stopServer ──────────────────────────────────────────────────────────────

export async function stopServer(): Promise<void> {
  // Stop credential proxy
  if (_credProxy) {
    try { await _credProxy.close(); } catch { /* ignore */ }
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
    await _server.close();
    _server = null;
  }
}
