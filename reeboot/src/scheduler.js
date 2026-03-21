/**
 * Scheduler
 *
 * Single poll-loop (default 60s) replacing per-task node-cron jobs.
 * Queries the DB for due tasks, runs them concurrently, logs each run
 * in task_runs, and updates next_run / last_result on the tasks row.
 *
 * Preserves the registerJob / cancelJob / stop API for back-compat with
 * scheduler-registry.ts and orchestrator.ts.
 */
import { nanoid } from 'nanoid';
import { runMigration } from './db/schema.js';
import { detectScheduleType, computeNextRun } from './scheduler/parse.js';
// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_INTERVAL_MS = 60_000;
const MAX_RESULT_CHARS = 200;
// ─── Scheduler ────────────────────────────────────────────────────────────────
export class Scheduler {
    _db;
    _orchestrator;
    _intervalMs;
    _timer = null;
    _inFlight = new Set();
    constructor(db, orchestrator, options = {}) {
        this._db = db;
        this._orchestrator = orchestrator;
        this._intervalMs =
            options.intervalMs ??
                (process.env.REEBOOT_SCHEDULER_INTERVAL_MS
                    ? parseInt(process.env.REEBOOT_SCHEDULER_INTERVAL_MS, 10)
                    : DEFAULT_INTERVAL_MS);
        // Run DB migration on construction
        runMigration(this._db);
    }
    // ── Lifecycle ──────────────────────────────────────────────────────────────
    async start() {
        await this._poll();
    }
    stop() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }
    // ── Poll loop ──────────────────────────────────────────────────────────────
    _poll = async () => {
        try {
            const nowIso = new Date().toISOString();
            const due = this._db
                .prepare("SELECT * FROM tasks WHERE status='active' AND next_run <= ?")
                .all(nowIso);
            await Promise.all(due.map((t) => this._runTask(t).catch((err) => this._logError(t, err, 0))));
        }
        catch (err) {
            console.error('[Scheduler] poll error:', err);
        }
        this._timer = setTimeout(this._poll, this._intervalMs);
    };
    // ── Task execution ─────────────────────────────────────────────────────────
    async _runTask(task) {
        const runId = nanoid();
        const startMs = Date.now();
        let result = undefined;
        let status = 'success';
        let errorMsg = null;
        try {
            result = await this._orchestrator.handleScheduledTask({
                taskId: task.id,
                contextId: task.context_id,
                prompt: task.prompt,
            });
            status = 'success';
        }
        catch (err) {
            status = 'error';
            errorMsg = err?.message ?? String(err);
            throw err; // rethrow so poll loop catch handles it
        }
        finally {
            const durationMs = Date.now() - startMs;
            const resultStr = typeof result === 'string' && result.length > 0
                ? result.slice(-MAX_RESULT_CHARS)
                : null;
            const lastResult = status === 'error' ? errorMsg : resultStr;
            // Insert task_runs row
            try {
                this._db
                    .prepare(`INSERT INTO task_runs (id, task_id, run_at, duration_ms, status, result, error)
             VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, ?, ?)`)
                    .run(runId, task.id, durationMs, status, resultStr, errorMsg);
            }
            catch (dbErr) {
                console.error('[Scheduler] failed to insert task_run:', dbErr);
            }
            // Update tasks row
            try {
                if (task.schedule_type === 'once') {
                    this._db
                        .prepare("UPDATE tasks SET status='completed', last_result=?, last_run=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
                        .run(lastResult, task.id);
                }
                else {
                    const nextRun = computeNextRun({
                        schedule_type: task.schedule_type,
                        schedule_value: task.schedule_value,
                        normalized_ms: task.normalized_ms,
                        next_run: task.next_run,
                    });
                    this._db
                        .prepare("UPDATE tasks SET next_run=?, last_result=?, last_run=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
                        .run(nextRun, lastResult, task.id);
                }
            }
            catch (dbErr) {
                console.error('[Scheduler] failed to update task:', dbErr);
            }
        }
    }
    _logError(task, err, durationMs) {
        console.error(`[Scheduler] Task ${task.id} failed: ${err}`);
        // task_runs insert already done in _runTask finally block
    }
    // ── Back-compat API ────────────────────────────────────────────────────────
    /**
     * registerJob — back-compat shim.
     * Ensures a DB row exists for this task. The poll loop will pick it up.
     */
    registerJob(task) {
        // Check if row already exists
        const existing = this._db
            .prepare('SELECT id FROM tasks WHERE id = ?')
            .get(task.id);
        if (!existing) {
            // Insert with new schema fields derived from the schedule
            let scheduleType = 'cron';
            let scheduleValue = task.schedule;
            let normalizedMs = null;
            let nextRun = null;
            try {
                const desc = detectScheduleType(task.schedule);
                scheduleType = desc.type;
                normalizedMs = desc.normalizedMs ?? null;
                nextRun = computeNextRun({
                    schedule_type: scheduleType,
                    schedule_value: scheduleValue,
                    normalized_ms: normalizedMs,
                    next_run: null,
                });
            }
            catch {
                // Default to cron
            }
            this._db
                .prepare(`INSERT INTO tasks (id, context_id, schedule, prompt, enabled,
            schedule_type, schedule_value, normalized_ms, status, next_run, context_mode)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'active', ?, 'shared')`)
                .run(task.id, task.contextId, task.schedule, task.prompt, scheduleType, scheduleValue, normalizedMs, nextRun);
        }
    }
    /**
     * cancelJob — back-compat shim.
     * Deletes the task from DB and removes from in-flight set.
     */
    cancelJob(taskId) {
        this._inFlight.delete(taskId);
        this._db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Returns all tasks that are currently overdue (status=active, next_run <= now).
 */
export function getTasksDue(db, now) {
    const nowIso = now ?? new Date().toISOString();
    return db
        .prepare("SELECT * FROM tasks WHERE status='active' AND next_run <= ?")
        .all(nowIso);
}
/**
 * Formats a list of overdue tasks as human-readable text.
 */
export function formatTasksDue(tasks) {
    if (tasks.length === 0)
        return 'No overdue tasks.';
    const now = Date.now();
    const lines = tasks.map((t) => {
        const overdueMs = t.next_run ? now - new Date(t.next_run).getTime() : 0;
        const overdueMin = Math.round(overdueMs / 60_000);
        const prompt = t.prompt.length > 60 ? t.prompt.slice(0, 57) + '...' : t.prompt;
        return `[${t.id}] ${prompt} | schedule: ${t.schedule_value || t.schedule} | overdue: ${overdueMin}m`;
    });
    return lines.join('\n');
}
function _relativeTime(isoString) {
    if (!isoString)
        return 'unknown';
    const diff = new Date(isoString).getTime() - Date.now();
    if (diff <= 0)
        return 'overdue';
    const mins = Math.round(diff / 60_000);
    if (mins < 60)
        return `in ${mins} minute${mins !== 1 ? 's' : ''}`;
    const hrs = Math.round(diff / 3_600_000);
    if (hrs < 24)
        return `in ${hrs} hour${hrs !== 1 ? 's' : ''}`;
    const days = Math.round(diff / 86_400_000);
    return `in ${days} day${days !== 1 ? 's' : ''}`;
}
export function createSchedulerTools(db, scheduler) {
    return {
        async schedule_task(params) {
            // Validate schedule
            let scheduleDesc;
            try {
                scheduleDesc = detectScheduleType(params.schedule);
            }
            catch (err) {
                return {
                    content: [{ type: 'text', text: `Invalid schedule: ${err.message}` }],
                    details: {},
                    isError: true,
                };
            }
            const contextId = params.contextId ?? 'main';
            const contextMode = params.context_mode ?? 'shared';
            const id = nanoid();
            const scheduleValue = params.schedule.trim();
            const normalizedMs = scheduleDesc.normalizedMs ?? null;
            // For once tasks, next_run is the ISO string itself
            let nextRun;
            if (scheduleDesc.type === 'once') {
                nextRun = scheduleValue;
            }
            else {
                nextRun = computeNextRun({
                    schedule_type: scheduleDesc.type,
                    schedule_value: scheduleValue,
                    normalized_ms: normalizedMs,
                    next_run: null,
                });
            }
            try {
                db.prepare(`INSERT INTO tasks (id, context_id, schedule, prompt, enabled,
            schedule_type, schedule_value, normalized_ms, status, next_run, context_mode)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'active', ?, ?)`).run(id, contextId, scheduleValue, params.prompt, scheduleDesc.type, scheduleValue, normalizedMs, nextRun, contextMode);
                return {
                    content: [{ type: 'text', text: `Scheduled task created (id: ${id})` }],
                    details: { id, schedule: params.schedule, scheduleType: scheduleDesc.type, contextId, nextRun },
                };
            }
            catch (err) {
                return {
                    content: [{ type: 'text', text: `Failed to schedule task: ${err.message}` }],
                    details: {},
                    isError: true,
                };
            }
        },
        async pause_task(params) {
            const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(params.task_id);
            if (!task) {
                return {
                    content: [{ type: 'text', text: `Task not found: ${params.task_id}` }],
                    details: {},
                    isError: true,
                };
            }
            db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(params.task_id);
            return {
                content: [{ type: 'text', text: `Task ${params.task_id} paused.` }],
                details: { taskId: params.task_id },
            };
        },
        async resume_task(params) {
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.task_id);
            if (!task) {
                return {
                    content: [{ type: 'text', text: `Task not found: ${params.task_id}` }],
                    details: {},
                    isError: true,
                };
            }
            // Recompute next_run from now (not from stale stored value)
            const freshNextRun = computeNextRun({
                schedule_type: task.schedule_type,
                schedule_value: task.schedule_value,
                normalized_ms: task.normalized_ms,
                next_run: null, // force recompute from now
            });
            db.prepare("UPDATE tasks SET status='active', next_run=? WHERE id=?").run(freshNextRun, params.task_id);
            return {
                content: [{ type: 'text', text: `Task ${params.task_id} resumed.` }],
                details: { taskId: params.task_id, nextRun: freshNextRun },
            };
        },
        async update_task(params) {
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.task_id);
            if (!task) {
                return {
                    content: [{ type: 'text', text: `Task not found: ${params.task_id}` }],
                    details: {},
                    isError: true,
                };
            }
            let scheduleType = task.schedule_type;
            let scheduleValue = task.schedule_value;
            let normalizedMs = task.normalized_ms;
            let nextRun = task.next_run;
            if (params.schedule !== undefined) {
                let scheduleDesc;
                try {
                    scheduleDesc = detectScheduleType(params.schedule);
                }
                catch (err) {
                    return {
                        content: [{ type: 'text', text: `Invalid schedule: ${err.message}` }],
                        details: {},
                        isError: true,
                    };
                }
                scheduleType = scheduleDesc.type;
                scheduleValue = params.schedule.trim();
                normalizedMs = scheduleDesc.normalizedMs ?? null;
                nextRun = computeNextRun({
                    schedule_type: scheduleType,
                    schedule_value: scheduleValue,
                    normalized_ms: normalizedMs,
                    next_run: null,
                });
            }
            const prompt = params.prompt ?? task.prompt;
            const contextMode = params.context_mode ?? task.context_mode;
            db.prepare(`UPDATE tasks SET prompt=?, schedule_type=?, schedule_value=?, normalized_ms=?,
         next_run=?, context_mode=?, schedule=? WHERE id=?`).run(prompt, scheduleType, scheduleValue, normalizedMs, nextRun, contextMode, scheduleValue, params.task_id);
            return {
                content: [{ type: 'text', text: `Task ${params.task_id} updated.` }],
                details: { taskId: params.task_id },
            };
        },
        async list_tasks(_params) {
            const rows = db.prepare('SELECT * FROM tasks').all();
            if (rows.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No scheduled tasks.' }],
                    details: { tasks: [] },
                };
            }
            const tasks = rows.map((t) => ({
                id: t.id,
                prompt: t.prompt,
                schedule: t.schedule_value || t.schedule,
                scheduleType: t.schedule_type,
                status: t.status,
                nextRun: _relativeTime(t.next_run),
                lastResult: t.last_result ? t.last_result.slice(0, 100) : null,
                contextMode: t.context_mode,
                createdAt: t.created_at ?? null,
            }));
            const lines = tasks.map((t) => `[${t.id}] ${t.schedule} (${t.scheduleType}) → ${t.prompt} | status: ${t.status} | next: ${t.nextRun}`);
            return {
                content: [{ type: 'text', text: lines.join('\n') }],
                details: { tasks },
            };
        },
        async cancel_task(params) {
            const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(params.task_id);
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
