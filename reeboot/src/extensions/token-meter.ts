/**
 * Token Meter Extension
 *
 * Subscribes to agent_end events and inserts a usage row into the SQLite
 * `usage` table via getDb() from the reeboot DB module.
 *
 * The context_id is derived from the cwd (basename of the context workspace).
 * Also persists cost_usd (from pi's built-in pricing) and operation_type
 * (from .reeboot_turn_meta.json written by the orchestrator before dispatch).
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.on('agent_end', async (event, ctx) => {
    // Extract the last assistant message to get token usage
    const messages = event.messages as any[];
    let inputTokens = 0;
    let outputTokens = 0;
    let modelId = '';
    let costUsd = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant') {
        if (m.usage) {
          inputTokens = m.usage.inputTokens ?? 0;
          outputTokens = m.usage.outputTokens ?? 0;
          costUsd = m.usage.cost?.total ?? 0;
        }
        if (m.model) {
          modelId = typeof m.model === 'string' ? m.model : (m.model.id ?? '');
        }
        break;
      }
    }

    if (inputTokens === 0 && outputTokens === 0) return;

    // Derive context_id from the context workspace path (basename)
    const path = await import('path');
    const contextId = path.basename(ctx.cwd);

    // Read operation_type from .reeboot_turn_meta.json (written by orchestrator)
    let operationType = 'user_message';
    try {
      const fs = await import('fs');
      const metaPath = path.join(ctx.cwd, '.reeboot_turn_meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        operationType = meta.operationType ?? 'user_message';
      }
    } catch {
      // If meta file can't be read, default to 'user_message'
    }

    try {
      // Dynamic import to avoid circular deps when extension is loaded outside reeboot
      const { getDb } = await import('../db/index.js');
      const db = getDb();
      db.prepare(
        `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(contextId, inputTokens, outputTokens, modelId, costUsd, operationType);
    } catch {
      // DB may not be available in test/standalone contexts — silently skip
    }
  });
}
