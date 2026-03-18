/**
 * Scheduler Tool Extension
 *
 * Registers schedule_task, list_tasks, cancel_task tools backed by SQLite.
 * Uses getDb() for DB access and integrates with the Scheduler singleton
 * (injected via pi's extension context or resolved from the global registry).
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  // Lazily resolve DB and scheduler to avoid circular imports
  function getTools() {
    // Dynamic requires deferred to avoid startup issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDb } = require('../src/db/index.js') as typeof import('../src/db/index.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSchedulerTools } = require('../src/scheduler.js') as typeof import('../src/scheduler.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { globalScheduler } = require('../src/scheduler-registry.js') as typeof import('../src/scheduler-registry.js');

    const db = getDb();
    return createSchedulerTools(db, globalScheduler);
  }

  pi.registerTool({
    name: 'schedule_task',
    label: 'Schedule Task',
    description: 'Schedule a recurring task. Provide a cron expression, a prompt, and optionally a contextId.',
    parameters: Type.Object({
      schedule: Type.String({ description: 'Cron expression (e.g. "0 9 * * 1-5" for weekdays at 9am)' }),
      prompt: Type.String({ description: 'Prompt to dispatch to the agent on schedule' }),
      contextId: Type.Optional(Type.String({ description: 'Context to run in (default: main)' })),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.schedule_task(params);
    },
  });

  pi.registerTool({
    name: 'list_tasks',
    label: 'List Tasks',
    description: 'List all scheduled tasks with their id, schedule, prompt, contextId, enabled status and last run time.',
    parameters: Type.Object({}),
    execute: async () => {
      const tools = getTools();
      return tools.list_tasks({} as Record<string, never>);
    },
  });

  pi.registerTool({
    name: 'cancel_task',
    label: 'Cancel Task',
    description: 'Cancel and delete a scheduled task by its ID.',
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID to cancel (from list_tasks)' }),
    }),
    execute: async (_id, params) => {
      const tools = getTools();
      return tools.cancel_task(params);
    },
  });
}
