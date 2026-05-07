import { EventEmitter } from 'events';

// ─── SseEmitter class ─────────────────────────────────────────────────────────

/**
 * A thin EventEmitter wrapper for broadcasting log records to SSE subscribers.
 * Emits 'log' events for every record passed to emitLogRecord().
 */
export class SseEmitter extends EventEmitter {
  constructor() {
    super();
    // Allow many SSE client connections without Node.js warning
    this.setMaxListeners(100);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const sseEmitter = new SseEmitter();

// ─── emitLogRecord ────────────────────────────────────────────────────────────

/**
 * Broadcasts a log record to all SSE subscribers.
 * Called by the pino transport hook and by emitEvent().
 */
export function emitLogRecord(record: unknown): void {
  sseEmitter.emit('log', record);
}
