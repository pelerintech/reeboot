// @ts-nocheck
/**
 * Scheduler Tool Extension
 *
 * Registers schedule_task, list_tasks, cancel_task, pause_task, resume_task,
 * update_task tools backed by SQLite, plus the /tasks slash command.
 * Uses getDb() for DB access and integrates with the Scheduler singleton.
 *
 * Also registers:
 * - timer: one-shot non-blocking wait (fires pi.sendMessage triggerTurn)
 * - heartbeat: periodic non-blocking wake-up (start/stop/status)
 * - bash pre-hook: sleep interceptor (blocks sleep when sole/last command)
 * - session_shutdown: cleans up all in-session timers and heartbeat
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

// ─── isSleepOnlyOrLast ────────────────────────────────────────────────────────

/**
 * Returns true if sleep is the sole command or the last command in a chain.
 * Splits on && and single | (not || which is OR-fallback).
 */
export function isSleepOnlyOrLast(command: string): boolean {
  // Split on && and | (pipe) — but not || (double pipe for fallback)
  const parts = command.trim().split(/&&|(?<!\|)\|(?!\|)/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const last = parts[parts.length - 1];
  return last.startsWith('sleep ') || last === 'sleep';
}

// ─── TimerManager ─────────────────────────────────────────────────────────────

export class TimerManager {
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _heartbeat: {
    interval: ReturnType<typeof setInterval>;
    tickCount: number;
    message: string;
    intervalSeconds: number;
    startedAt: Date;
  } | null = null;

  // ── Timer ──────────────────────────────────────────────────────────────────

  setTimer(pi: ExtensionAPI, seconds: number, message: string, id: string): void {
    if (seconds < 1 || seconds > 3600) {
      throw new Error('seconds must be between 1 and 3600');
    }

    // Cancel existing timer with same id
    const existing = this._timers.get(id);
    if (existing) clearTimeout(existing);

    const handle = setTimeout(() => {
      this._timers.delete(id);
      pi.sendMessage(
        { content: `⏰ Timer ${id} fired: ${message}`, display: true },
        { triggerTurn: true }
      );
    }, seconds * 1000);

    this._timers.set(id, handle);
  }

  cancelTimer(id: string): void {
    const handle = this._timers.get(id);
    if (handle) {
      clearTimeout(handle);
      this._timers.delete(id);
    }
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  startHeartbeat(pi: ExtensionAPI, intervalSeconds: number, message: string): void {
    if (intervalSeconds < 10 || intervalSeconds > 3600) {
      throw new Error('interval_seconds must be between 10 and 3600');
    }

    // Stop any existing heartbeat
    this.stopHeartbeat();

    let tickCount = 0;
    const startedAt = new Date();

    const handle = setInterval(() => {
      tickCount++;
      if (this._heartbeat) this._heartbeat.tickCount = tickCount;
      pi.sendMessage(
        { content: `💓 Heartbeat tick ${tickCount}: ${message}`, display: true },
        { triggerTurn: true }
      );
    }, intervalSeconds * 1000);

    this._heartbeat = {
      interval: handle,
      tickCount: 0,
      message,
      intervalSeconds,
      startedAt,
    };
  }

  stopHeartbeat(): void {
    if (this._heartbeat) {
      clearInterval(this._heartbeat.interval);
      this._heartbeat = null;
    }
  }

  getHeartbeatStatus(): string {
    if (!this._heartbeat) return 'No active heartbeat.';
    const elapsed = Math.round((Date.now() - this._heartbeat.startedAt.getTime()) / 1000);
    return `Active heartbeat: every ${this._heartbeat.intervalSeconds}s, message="${this._heartbeat.message}", ticks=${this._heartbeat.tickCount}, running for ${elapsed}s`;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  clearAll(): void {
    for (const h of this._timers.values()) clearTimeout(h);
    this._timers.clear();
    this.stopHeartbeat();
  }
}

// ─── Extension default export ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Lazily resolve DB and scheduler to avoid circular imports
  function getTools() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDb } = require('../db/index.js') as typeof import('../db/index.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSchedulerTools } = require('../scheduler.js') as typeof import('../scheduler.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { globalScheduler } = require('../scheduler-registry.js') as typeof import('../scheduler-registry.js');

    const db = getDb();
    return createSchedulerTools(db, globalScheduler);
  }

  // ─── In-session timer manager ──────────────────────────────────────────────

  const manager = new TimerManager();

  // ─── session_shutdown cleanup ──────────────────────────────────────────────

  pi.on('session_shutdown', (event: any) => {
    if (event.reason === 'reload') return;
    manager.clearAll();
  });

  // ─── Sleep interceptor (bash pre-hook) ────────────────────────────────────

  pi.on('user_bash', (event): any => {
    if (process.env.REEBOOT_SLEEP_INTERCEPTOR === '0') return;
    if (isSleepOnlyOrLast(event.command)) {
      return {
        result: {
          content: [
            {
              type: 'text',
              text: 'Blocking sleep command. Use timer(seconds, message) for non-blocking waits.',
            },
          ],
          details: {},
          isError: true,
        },
      };
    }
  });

  // ─── timer tool ───────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'timer',
    label: 'Timer',
    description:
      'Set a one-shot non-blocking timer. Returns immediately. After the specified delay, fires a new agent turn with the given message. Use instead of sleep.',
    promptSnippet: 'Set a one-shot non-blocking delay that fires a new agent turn',
    parameters: Type.Object({
      seconds: Type.Number({ description: 'Delay in seconds (1–3600)' }),
      message: Type.String({ description: 'Message to include when the timer fires' }),
      id: Type.Optional(Type.String({ description: 'Timer id (optional). Same id cancels previous timer.' })),
    }),
    execute: async (_callId, params) => {
      const id = params.id ?? `timer-${Date.now()}`;
      try {
        manager.setTimer(pi, params.seconds, params.message, id);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Timer "${id}" set for ${params.seconds}s: "${params.message}"`,
            },
          ],
          details: { id, seconds: params.seconds, message: params.message },
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: err.message }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ─── heartbeat tool ───────────────────────────────────────────────────────

  pi.registerTool({
    name: 'heartbeat',
    label: 'Heartbeat',
    description:
      'Manage a periodic non-blocking heartbeat. Actions: start (requires interval_seconds 10–3600 and message), stop, status. Only one heartbeat active at a time.',
    promptSnippet: 'Manage a recurring periodic turn trigger',
    parameters: Type.Object({
      action: Type.Union([Type.Literal('start'), Type.Literal('stop'), Type.Literal('status')], {
        description: 'Action to perform',
      }),
      interval_seconds: Type.Optional(
        Type.Number({ description: 'Interval in seconds (10–3600). Required for start.' })
      ),
      message: Type.Optional(
        Type.String({ description: 'Message to include on each tick. Required for start.' })
      ),
    }),
    execute: async (_callId, params) => {
      if (params.action === 'start') {
        const intervalSeconds = params.interval_seconds ?? 60;
        const message = params.message ?? 'Heartbeat tick';
        try {
          manager.startHeartbeat(pi, intervalSeconds, message);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Heartbeat started: every ${intervalSeconds}s, message="${message}"`,
              },
            ],
            details: { intervalSeconds, message },
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text' as const, text: err.message }],
            details: {},
            isError: true,
          };
        }
      }

      if (params.action === 'stop') {
        manager.stopHeartbeat();
        return {
          content: [{ type: 'text' as const, text: 'Heartbeat stopped.' }],
          details: {},
        };
      }

      // status
      const status = manager.getHeartbeatStatus();
      return {
        content: [{ type: 'text' as const, text: status }],
        details: {},
      };
    },
  });

  // ─── schedule_task ────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'schedule_task',
    label: 'Schedule Task',
    description:
      'Schedule a task. Provide a human-friendly schedule string (e.g. "every 30m", "daily", "0 9 * * *", "2026-04-01T09:00:00Z"), a prompt, and optionally contextId and context_mode.',
    promptSnippet: 'Schedule a task by cron, interval, or datetime',
    parameters: Type.Object({
      schedule: Type.String({
        description:
          'Schedule: cron expression, ISO datetime, or interval like "every 30m", "hourly", "daily"',
      }),
      prompt: Type.String({ description: 'Prompt to dispatch to the agent on schedule' }),
      contextId: Type.Optional(
        Type.String({ description: 'Context to run in (default: main)' })
      ),
      context_mode: Type.Optional(
        Type.String({ description: 'Context mode: "shared" (default) or "isolated"' })
      ),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.schedule_task(params);
    },
  });

  // ─── list_tasks ───────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'list_tasks',
    label: 'List Tasks',
    description:
      'List all scheduled tasks with rich status: id, schedule, prompt, status, next run time (relative), last result, context mode.',
    promptSnippet: 'List all scheduled tasks with status and next run time',
    parameters: Type.Object({}),
    execute: async () => {
      const tools = getTools();
      return tools.list_tasks({} as Record<string, never>);
    },
  });

  // ─── cancel_task ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'cancel_task',
    label: 'Cancel Task',
    description: 'Cancel and delete a scheduled task by its ID.',
    promptSnippet: 'Cancel and delete a scheduled task by ID',
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID to cancel (from list_tasks)' }),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.cancel_task(params);
    },
  });

  // ─── pause_task ───────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'pause_task',
    label: 'Pause Task',
    description: 'Pause a scheduled task. The task will not run until resumed.',
    promptSnippet: 'Pause a scheduled task without deleting it',
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID to pause (from list_tasks)' }),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.pause_task(params);
    },
  });

  // ─── resume_task ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'resume_task',
    label: 'Resume Task',
    description: 'Resume a paused task. next_run is recomputed from now.',
    promptSnippet: 'Resume a paused task, recomputing its next run',
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID to resume (from list_tasks)' }),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.resume_task(params);
    },
  });

  // ─── update_task ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: 'update_task',
    label: 'Update Task',
    description:
      "Update a task's prompt, schedule, or context_mode. If schedule changes, next_run is recomputed.",
    promptSnippet: "Update a task's prompt, schedule, or context mode",
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID to update (from list_tasks)' }),
      schedule: Type.Optional(Type.String({ description: 'New schedule string' })),
      prompt: Type.Optional(Type.String({ description: 'New prompt' })),
      context_mode: Type.Optional(
        Type.String({ description: 'New context mode: "shared" or "isolated"' })
      ),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.update_task(params);
    },
  });

  // ─── /tasks slash command ─────────────────────────────────────────────────

  pi.registerCommand({
    name: 'tasks',
    description:
      'Task management. Use "/tasks due" to list overdue tasks, or "/tasks" to list all active tasks.',
    execute: async (args: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDb } = require('../db/index.js') as typeof import('../db/index.js');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getTasksDue, formatTasksDue } = require('../scheduler.js') as typeof import('../scheduler.js');

      const db = getDb();
      const subCmd = args?.trim().toLowerCase();

      if (subCmd === 'due') {
        const due = getTasksDue(db);
        return formatTasksDue(due as any);
      }

      // List all active tasks
      const tasks = db
        .prepare("SELECT * FROM tasks WHERE status='active' ORDER BY next_run ASC")
        .all() as any[];

      if (tasks.length === 0) {
        return 'No active tasks.';
      }

      const now = Date.now();
      const lines = tasks.map((t: any) => {
        const nextRunMs = t.next_run ? new Date(t.next_run).getTime() : null;
        const overdue = nextRunMs && nextRunMs <= now;
        const rel = overdue
          ? 'OVERDUE'
          : nextRunMs
          ? `in ${Math.round((nextRunMs - now) / 60_000)}m`
          : 'unknown';
        return `[${t.id}] ${(t.schedule_value || t.schedule).padEnd(20)} → ${t.prompt.slice(0, 40)} | next: ${rel}`;
      });

      return lines.join('\n');
    },
  });
}
