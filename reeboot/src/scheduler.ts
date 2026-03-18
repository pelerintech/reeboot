/**
 * Scheduler
 *
 * Loads enabled tasks from the SQLite `tasks` table on startup,
 * registers node-cron jobs, and dispatches prompts to the orchestrator
 * when jobs fire. Updates `last_run` after each execution.
 */

import * as cron from 'node-cron';
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduledTaskRef {
  taskId: string;
  contextId: string;
  prompt: string;
}

export interface SchedulerOrchestrator {
  handleScheduledTask(task: ScheduledTaskRef): Promise<void>;
}

interface TaskRow {
  id: string;
  context_id: string;
  schedule: string;
  prompt: string;
  enabled: number;
  last_run: string | null;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export class Scheduler {
  private _db: Database.Database;
  private _orchestrator: SchedulerOrchestrator;
  private _jobs = new Map<string, ReturnType<typeof cron.schedule>>();

  constructor(db: Database.Database, orchestrator: SchedulerOrchestrator) {
    this._db = db;
    this._orchestrator = orchestrator;
  }

  async start(): Promise<void> {
    // Load all enabled tasks and register cron jobs
    const tasks = this._db
      .prepare('SELECT * FROM tasks WHERE enabled = 1')
      .all() as TaskRow[];

    for (const task of tasks) {
      this.registerJob({
        id: task.id,
        contextId: task.context_id,
        schedule: task.schedule,
        prompt: task.prompt,
      });
    }
  }

  registerJob(task: { id: string; contextId: string; schedule: string; prompt: string }): void {
    // Cancel existing job for this task if any
    const existing = this._jobs.get(task.id);
    if (existing) {
      existing.stop();
    }

    const job = cron.schedule(task.schedule, async () => {
      try {
        await this._orchestrator.handleScheduledTask({
          taskId: task.id,
          contextId: task.contextId,
          prompt: task.prompt,
        });
      } catch (err) {
        console.error(`[Scheduler] Task ${task.id} failed: ${err}`);
      } finally {
        // Update last_run
        this._db
          .prepare("UPDATE tasks SET last_run = datetime('now') WHERE id = ?")
          .run(task.id);
      }
    });

    this._jobs.set(task.id, job);
  }

  cancelJob(taskId: string): void {
    const job = this._jobs.get(taskId);
    if (job) {
      job.stop();
      this._jobs.delete(taskId);
    }
  }

  stop(): void {
    for (const [, job] of this._jobs) {
      job.stop();
    }
    this._jobs.clear();
  }
}

// ─── Tool helpers ─────────────────────────────────────────────────────────────

export interface SchedulerToolsTarget {
  registerJob(task: { id: string; contextId: string; schedule: string; prompt: string }): void;
  cancelJob(taskId: string): void;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}

export function createSchedulerTools(db: Database.Database, scheduler: SchedulerToolsTarget) {
  return {
    async schedule_task(params: {
      schedule: string;
      prompt: string;
      contextId?: string;
    }): Promise<ToolResult> {
      // Validate cron expression
      if (!cron.validate(params.schedule)) {
        return {
          content: [{ type: 'text', text: `Invalid cron expression: ${params.schedule}` }],
          details: {},
          isError: true,
        };
      }

      const contextId = params.contextId ?? 'main';
      const id = nanoid();

      try {
        db.prepare(
          'INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES (?, ?, ?, ?, 1)'
        ).run(id, contextId, params.schedule, params.prompt);

        scheduler.registerJob({
          id,
          contextId,
          schedule: params.schedule,
          prompt: params.prompt,
        });

        return {
          content: [{ type: 'text', text: `Scheduled task created (id: ${id})` }],
          details: { id, schedule: params.schedule, contextId },
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to schedule task: ${err.message}` }],
          details: {},
          isError: true,
        };
      }
    },

    async list_tasks(_params: Record<string, never>): Promise<ToolResult> {
      const tasks = db
        .prepare('SELECT id, context_id, schedule, prompt, enabled, last_run FROM tasks')
        .all() as any[];

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: 'No scheduled tasks.' }],
          details: { tasks: [] },
        };
      }

      const lines = tasks.map((t: any) =>
        `[${t.id}] ${t.schedule} → ${t.prompt} (context: ${t.context_id}, enabled: ${t.enabled ? 'yes' : 'no'}, last_run: ${t.last_run ?? 'never'})`
      );

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: { tasks },
      };
    },

    async cancel_task(params: { task_id: string }): Promise<ToolResult> {
      const task = db
        .prepare('SELECT id FROM tasks WHERE id = ?')
        .get(params.task_id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${params.task_id}` }],
          details: {},
          isError: true,
        };
      }

      db.prepare('DELETE FROM tasks WHERE id = ?').run(params.task_id);
      scheduler.cancelJob(params.task_id);

      return {
        content: [{ type: 'text', text: `Cancelled task ${params.task_id}` }],
        details: { taskId: params.task_id },
      };
    },
  };
}
