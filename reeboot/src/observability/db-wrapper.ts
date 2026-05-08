import type { Database, Statement } from 'better-sqlite3';
import { getLogger } from './logger.js';

// ─── patchDb ──────────────────────────────────────────────────────────────────

/**
 * Monkey-patches a better-sqlite3 Database instance in-place so that every
 * `prepare()` call returns a statement that logs `{ sql, params, durationMs }`
 * at debug level on each run/get/all, and error level on throw.
 *
 * Returns the same database object (type is unchanged — safe for callers
 * that hold a Database.Database reference).
 */
export function patchDb(db: Database): Database {
  const originalPrepare = db.prepare.bind(db);

  (db as any).prepare = function (sql: string) {
    const stmt = originalPrepare(sql);
    return _wrapStatement(stmt, sql);
  };

  return db;
}

function _wrapStatement(stmt: Statement, sql: string): Statement {
  const wrap = Object.create(Object.getPrototypeOf(stmt));

  // Copy all own properties from the original statement
  Object.assign(wrap, stmt);

  wrap.get = (...params: unknown[]) => {
    const start = performance.now();
    try {
      const result = stmt.get(...params);
      getLogger().debug({ component: 'db', sql, params, durationMs: performance.now() - start }, 'db.get');
      return result;
    } catch (err) {
      getLogger().error({ component: 'db', sql, params, durationMs: performance.now() - start, err }, 'db.get error');
      throw err;
    }
  };

  wrap.all = (...params: unknown[]) => {
    const start = performance.now();
    try {
      const result = stmt.all(...params);
      getLogger().debug({ component: 'db', sql, params, durationMs: performance.now() - start }, 'db.all');
      return result;
    } catch (err) {
      getLogger().error({ component: 'db', sql, params, durationMs: performance.now() - start, err }, 'db.all error');
      throw err;
    }
  };

  wrap.run = (...params: unknown[]) => {
    const start = performance.now();
    try {
      const result = stmt.run(...params);
      getLogger().debug({ component: 'db', sql, params, durationMs: performance.now() - start }, 'db.run');
      return result;
    } catch (err) {
      getLogger().error({ component: 'db', sql, params, durationMs: performance.now() - start, err }, 'db.run error');
      throw err;
    }
  };

  return wrap as unknown as Statement;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WrappedDatabase {
  prepare(sql: string): WrappedStatement;
}

export interface WrappedStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): import('better-sqlite3').RunResult;
}

// ─── wrapDb ───────────────────────────────────────────────────────────────────

/**
 * Returns a thin debug-logging proxy around a better-sqlite3 Database.
 * Every prepare().get/all/run call emits a debug log with { sql, params, durationMs }.
 * Errors are logged at the error level. Query results are unchanged.
 */
export function wrapDb(db: Database): WrappedDatabase {
  return {
    prepare(sql: string): WrappedStatement {
      return {
        get(...params: unknown[]): unknown {
          const start = performance.now();
          try {
            const result = db.prepare(sql).get(...params);
            const durationMs = performance.now() - start;
            getLogger().debug({ component: 'db', sql, params, durationMs }, 'db.get');
            return result;
          } catch (err) {
            const durationMs = performance.now() - start;
            getLogger().error({ component: 'db', sql, params, durationMs, err }, 'db.get error');
            throw err;
          }
        },

        all(...params: unknown[]): unknown[] {
          const start = performance.now();
          try {
            const result = db.prepare(sql).all(...params);
            const durationMs = performance.now() - start;
            getLogger().debug({ component: 'db', sql, params, durationMs }, 'db.all');
            return result;
          } catch (err) {
            const durationMs = performance.now() - start;
            getLogger().error({ component: 'db', sql, params, durationMs, err }, 'db.all error');
            throw err;
          }
        },

        run(...params: unknown[]): import('better-sqlite3').RunResult {
          const start = performance.now();
          try {
            const result = db.prepare(sql).run(...params);
            const durationMs = performance.now() - start;
            getLogger().debug({ component: 'db', sql, params, durationMs }, 'db.run');
            return result;
          } catch (err) {
            const durationMs = performance.now() - start;
            getLogger().error({ component: 'db', sql, params, durationMs, err }, 'db.run error');
            throw err;
          }
        },
      };
    },
  };
}
