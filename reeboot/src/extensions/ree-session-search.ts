/**
 * Ree session_search extension
 *
 * Registers a session_search tool for ree mode that queries the per-chat
 * chat_messages table instead of the global messages table.
 *
 * This is registered as a fifth factory in getReeFactories (loaded last,
 * after capabilities, so it sees the full tool set).
 */

import type { ExtensionAPI } from './extension-api.js';

/**
 * Factory: registers session_search tool on the ree adapter.
 */
export default async function(api: ExtensionAPI, _config: Record<string, any>): Promise<void> {
  // session_search queries the per-chat message history via the chat_messages table
  api.registerTool({
    name: 'session_search',
    label: 'Session Search',
    description:
      'Full-text search over the current conversation history. ' +
      'Returns matching messages with role, timestamp, and content excerpt. ' +
      'Scoped to the current chat only — cannot search across other conversations.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search terms to match against message history',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10, max: 100)',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['query'],
    },
    execute: async (_id: string, params: Record<string, any>): Promise<any> => {
      const query = String(params.query ?? '');
      const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);

      const chatId = api.getCurrentChatId?.();
      if (!chatId) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ results: [], error: 'No active chat' }) }],
          details: {},
        };
      }

      try {
        const db = await getReeHistoryDb();
        if (!db) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ results: [], error: 'Database not available' }) }],
            details: {},
          };
        }

        // FTS5 query on chat_messages_fts, scoped to current chat
        const rows = db.prepare(`
          SELECT m.role, m.content, m.created_at
          FROM chat_messages_fts f
          JOIN chat_messages m ON m.id = f.rowid
          WHERE m.chat_id = ? AND chat_messages_fts MATCH ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(chatId, query, limit) as Array<{ role: string; content: string; created_at: string }>;

        const results = rows.map((r: any) => ({
          role: r.role,
          content: r.content?.slice(0, 500) ?? '',
          excerpt: r.content?.slice(0, 200) ?? '',
          timestamp: r.created_at,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ results }) }],
          details: {},
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ results: [], error: String(err?.message ?? err) }) }],
          details: {},
        };
      }
    },
  });
}

/**
 * Get the ree history DB from the runtime singleton.
 * Returns null if the ree runtime hasn't been initialised.
 *
 * Caches the resolved DB once found, but does NOT cache a null result
 * so subsequent calls retry if the runtime initialises later.
 */
let _cachedDb: any = null;
let _pendingDb: Promise<any> | null = null;

async function getReeHistoryDb(): Promise<any> {
  if (_cachedDb) return _cachedDb;
  if (_pendingDb) return _pendingDb;

  _pendingDb = (async () => {
    try {
      const { getReeRuntime } = await import('../agent-runner/index.js');
      const runtime = getReeRuntime();
      if (runtime?.getHistoryDb) {
        _cachedDb = runtime.getHistoryDb();
        return _cachedDb;
      }
      return null;
    } catch {
      return null;
    } finally {
      _pendingDb = null;
    }
  })();

  return _pendingDb;
}
