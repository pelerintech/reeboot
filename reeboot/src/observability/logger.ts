import pino from 'pino';
import { Writable } from 'stream';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import type { Database } from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoggerConfig {
  level?: string;
  retention_days?: number;
}

// ─── Singleton state ──────────────────────────────────────────────────────────

let _logger: pino.Logger | null = null;

// ─── SSE stream factory ───────────────────────────────────────────────────────

/**
 * Creates a writable stream that parses pino NDJSON output and forwards
 * each log record to sseEmitter. We import sseEmitter lazily to avoid
 * circular-dependency issues at module load time.
 */
function createSseStream(): Writable {
  let buffer = '';
  return new Writable({
    write(chunk: Buffer | string, _encoding: string, callback: () => void) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed);
          // Lazy import to avoid circular dependency
          import('./sse-emitter.js').then(({ emitLogRecord }) => {
            emitLogRecord(record);
          }).catch(() => {});
        } catch {
          // Not valid JSON — ignore
        }
      }
      callback();
    },
  });
}

// ─── DB persist stream factory ────────────────────────────────────────────────

/**
 * Creates a writable stream that parses pino NDJSON output and persists
 * warn+ records (level >= 40) to the operational_logs SQLite table.
 * Records below warn are silently discarded.
 */
function createDbStream(db: Database): Writable {
  // Prepare statement once — safe because the stream lifecycle matches the logger
  let _stmt: ReturnType<typeof db.prepare> | null = null;
  function getStmt() {
    if (!_stmt) {
      try {
        _stmt = db.prepare(
          `INSERT INTO operational_logs (level, msg, component, context_id, payload)
           VALUES (?, ?, ?, ?, ?)`
        );
      } catch {
        // Table may not exist in test environments that skip the migration
        return null;
      }
    }
    return _stmt;
  }

  let buffer = '';
  return new Writable({
    write(chunk: Buffer | string, _encoding: string, callback: () => void) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as any;
          const level = typeof record.level === 'number' ? record.level : 0;
          // Only persist warn (40) and above
          if (level < 40) continue;
          const stmt = getStmt();
          if (!stmt) continue;
          const msg = record.msg ?? '';
          const component = record.component ?? null;
          const contextId = record.context_id ?? record.contextId ?? null;
          // Collect remaining fields as payload JSON (excluding common top-level fields)
          const { level: _l, msg: _m, time: _t, pid: _p, hostname: _h,
                  component: _c, context_id: _ci, contextId: _ciA, ...rest } = record;
          const payload = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (stmt as any).run(level, msg, component, contextId, payload);
          } catch {
            // Ignore individual write errors — don't crash the logger
          }
        } catch {
          // Not valid JSON — ignore
        }
      }
      callback();
    },
  });
}

// ─── createLogger ─────────────────────────────────────────────────────────────

/**
 * Creates a pino logger with:
 *  - stdout NDJSON transport (all levels)
 *  - file transport (warn+ to ~/.reeboot/logs/reeboot-YYYY-MM-DD.log)
 *  - in-process SSE stream transport (all levels → sseEmitter)
 *  - optional DB persist stream transport (warn+ → operational_logs table)
 */
export function createLogger(config: LoggerConfig = {}, db?: Database): pino.Logger {
  const level = config.level ?? 'info';

  const logDir = join(homedir(), '.reeboot', 'logs');
  mkdirSync(logDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logFile = join(logDir, `reeboot-${date}.log`);

  const sseStream = createSseStream();

  const streams: pino.StreamEntry[] = [
    { stream: pino.destination(1), level: level as pino.Level },             // stdout (all levels)
    { stream: pino.destination(logFile), level: 'warn' as pino.Level }, // file (warn+)
    { stream: sseStream, level: level as pino.Level },                       // SSE fan-out (all levels)
  ];

  // Add DB persist stream when a database is provided
  if (db) {
    streams.push({ stream: createDbStream(db), level: 'warn' });
  }

  const logger = pino(
    { level },
    pino.multistream(streams)
  );

  return logger;
}

// ─── Singleton helpers ────────────────────────────────────────────────────────

/**
 * Initialises the global logger singleton with the given config.
 * Subsequent calls to getLogger() will return this instance.
 */
export function initLogger(config: LoggerConfig = {}, db?: Database): pino.Logger {
  _logger = createLogger(config, db);
  return _logger;
}

/**
 * Returns the global logger singleton.
 * Falls back to a default logger if initLogger() has not been called.
 */
export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}

// Default export — satisfies spec requirement
export default getLogger;
