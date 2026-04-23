# Spec: Messages Persistence

## Capability

Every agent turn writes the user message and (on success) the assistant response to the
`messages` table, enabling session_search and memory consolidation.

---

## Scenarios

### MP-1: User message written on every turn outcome

GIVEN a turn is dispatched with a user message `content` on channel `whatsapp` from peer `+40X`  
WHEN the turn completes (success, error, or timeout)  
THEN a row exists in `messages` with `role: 'user'`, `content` matching the original, `channel: 'whatsapp'`, `peer_id: '+40X'`

### MP-2: Assistant message written on successful turn

GIVEN a turn completes successfully with non-empty `responseText`  
THEN a row exists in `messages` with `role: 'assistant'` and `content` matching `responseText`

### MP-3: Assistant message NOT written on failed turn

GIVEN a turn fails with an error before producing a response  
THEN only the user message row exists — no assistant row is written for that turn

### MP-4: FTS5 index updated automatically

GIVEN a user message row is written to `messages`  
WHEN `session_search({ query: "<word from that message>" })` is called  
THEN the result contains the newly written message  
(The FTS5 trigger handles this — no extra code needed, but must be verified end-to-end)

### MP-5: Messages carry context and channel metadata

GIVEN a turn on context `main`, channel `signal`, peer `+40Y`  
WHEN the messages are written  
THEN both rows have `context_id: 'main'`, `channel: 'signal'`, `peer_id: '+40Y'`

### MP-6: Scheduler-fired turns do not write garbage channel metadata

GIVEN a turn fired by the scheduler (`channelType: 'scheduler'`, `peerId: 'scheduler'`)  
WHEN the turn completes  
THEN either no message row is written for that turn  
OR the row correctly reflects the origin channel/peer from the task (not 'scheduler'/'scheduler')
