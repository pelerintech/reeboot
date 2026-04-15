import { watch, readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join, extname } from 'path';
import type Database from 'better-sqlite3';
import type { FSWatcher } from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

// ─── Binary detection ─────────────────────────────────────────────────────────

function isBinaryFile(filePath: string): boolean {
  try {
    const buf = readFileSync(filePath);
    return buf.indexOf(0) !== -1;
  } catch {
    return true; // If we can't read it, treat as binary/skip
  }
}

// ─── Hash helpers ─────────────────────────────────────────────────────────────

function hashFilePath(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function isAlreadyIngested(db: Database.Database, filePath: string, currentHash: string): boolean {
  const row = db
    .prepare('SELECT hash, status FROM knowledge_sources WHERE path = ?')
    .get(filePath) as { hash: string; status: string } | undefined;

  return !!(row && row.hash === currentHash && row.status === 'ingested');
}

// ─── KnowledgeWatcher ─────────────────────────────────────────────────────────

/**
 * Watches a `raw/` directory for new or modified files.
 * Deduplicates by hash against the `knowledge_sources` table.
 * Supports pause (stop) / resume (start) lifecycle.
 */
export class KnowledgeWatcher {
  private _db: Database.Database;
  private _watcher: FSWatcher | null = null;
  private _pendingFiles: Set<string> = new Set();
  private _debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _running = false;
  private _lastRawDir: string | null = null;
  private _pausedRawDir: string | null = null;

  constructor(db: Database.Database) {
    this._db = db;
  }

  /**
   * Starts watching the given rawDir recursively.
   */
  start(rawDir: string): void {
    if (this._running) return;
    this._running = true;
    this._lastRawDir = rawDir;
    this._pausedRawDir = null;

    this._watcher = watch(rawDir, { recursive: true }, (eventType, filename) => {
      if (!this._running) return;
      if (!filename) return;

      // Resolve full path
      const fullPath = join(rawDir, filename);

      // Skip directories and non-existent paths
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) return;
      } catch {
        return; // File doesn't exist (delete event) — skip
      }

      // Skip hidden files and paths inside ignored directories
      if (filename.startsWith('.') || filename.includes('/.')) return;

      // Debounce: reset timer for this path
      const existing = this._debounceTimers.get(fullPath);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this._debounceTimers.delete(fullPath);
        this._processFile(fullPath);
      }, DEBOUNCE_MS);

      this._debounceTimers.set(fullPath, timer);
    });
  }

  /**
   * Pauses the watcher (stops watching but preserves pending files).
   * Call resume() to restart watching from the same rawDir.
   */
  pause(): void {
    if (!this._running) return;
    this._running = false;

    // Clear debounce timers but PRESERVE pending files
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();

    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }

    // Store rawDir so resume() can restart
    this._pausedRawDir = this._lastRawDir;
  }

  /**
   * Resumes watching after a pause. Uses the same rawDir as the last start().
   */
  resume(): void {
    if (this._running) return;
    if (this._pausedRawDir) {
      this.start(this._pausedRawDir);
    }
  }

  /**
   * Stops the watcher and clears all pending state.
   */
  stop(): void {
    this._running = false;

    // Clear all debounce timers
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();

    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }

    // Clear pending on stop
    this._pendingFiles.clear();
    this._pausedRawDir = null;
  }

  /**
   * Returns the list of files waiting to be ingested.
   */
  getPendingFiles(): string[] {
    return Array.from(this._pendingFiles);
  }

  /**
   * Clears the pending file queue.
   */
  clearPending(): void {
    this._pendingFiles.clear();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _processFile(filePath: string): void {
    if (!this._running) return;

    // Binary check
    if (isBinaryFile(filePath)) return;

    // Hash check against knowledge_sources
    try {
      const hash = hashFilePath(filePath);
      if (isAlreadyIngested(this._db, filePath, hash)) return;

      this._pendingFiles.add(filePath);
    } catch {
      // If we can't hash the file, skip it
    }
  }
}
