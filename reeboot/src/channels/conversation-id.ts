/**
 * Conversation identity validation.
 *
 * A `conversationId` is the isolation axis for ree-mode multi-user routing
 * (one stable id per customer conversation → one `ReeChat`). It is supplied by
 * the client integration (e.g. the WS path segment) and must be:
 *
 *   - opaque but bounded: `^[A-Za-z0-9._:-]{1,128}$`
 *   - not a reserved internal context id (so a client id can never collide
 *     with `main` / system / scheduler contexts)
 *
 * Invalid or reserved ids are REJECTED (clear contract) rather than silently
 * namespaced — see design.md Open Decision 1.
 */

const CONVERSATION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Reserved internal context ids that a client-supplied conversation id must
 * never collide with. Keep in sync with orchestrator/server internals.
 */
const RESERVED_CONTEXT_IDS = new Set<string>([
  'main',
  '__system__',
  'scheduler',
  '__outage_probe__',
]);

/**
 * Returns true iff `id` is a syntactically valid, non-reserved conversation id
 * safe to use as a ree `chatId` / orchestrator context id.
 */
export function isValidConversationId(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (!CONVERSATION_ID_RE.test(id)) return false;
  // Path-traversal guards: even though `/` is rejected by the charset, the
  // bare `.` / `..` ids must never become directory names.
  if (id === '.' || id === '..') return false;
  if (RESERVED_CONTEXT_IDS.has(id)) return false;
  return true;
}

/** The set of reserved internal context ids (exported for reuse/tests). */
export const RESERVED_CONVERSATION_IDS: ReadonlySet<string> = RESERVED_CONTEXT_IDS;
