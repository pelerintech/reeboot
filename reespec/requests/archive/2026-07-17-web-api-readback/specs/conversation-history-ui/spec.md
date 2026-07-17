# Spec — conversation-history-ui

The Chat page hydrates its transcript from the history endpoint on mount, so the conversation
survives SPA navigation (unmount/remount).

## S1 — Chat page fetches history on mount
- **GIVEN** `GET /api/contexts/main/messages` is stubbed to return
  `[{role:'user',content:'hello',created_at:'2026-07-17 10:00:00'},
    {role:'assistant',content:'hi there',created_at:'2026-07-17 10:00:01'}]`
- **WHEN** the `Chat` component mounts
- **THEN** it calls `fetch` for `/api/contexts/main/messages` exactly once, and after the fetch
  resolves the rendered transcript shows "hello" and "hi there".

## S2 — remount re-hydrates (navigation recovery)
- **GIVEN** the history endpoint returns one user message "earlier question"
- **WHEN** the `Chat` component is unmounted and mounted again (simulating navigate-away-and-back)
- **THEN** after the second mount the transcript again shows "earlier question" (state is not lost;
  it is re-fetched).

## S3 — empty history renders the empty state
- **GIVEN** the history endpoint returns `[]`
- **WHEN** the `Chat` component mounts
- **THEN** the empty-state prompt ("How can I help you?") is shown and no message rows are rendered.

## S4 — history is fetched on mount only, not on WS reconnect
- **GIVEN** the history endpoint returns one message
- **WHEN** the component mounts and the underlying WebSocket subsequently reconnects (without a remount)
- **THEN** `fetch('/api/contexts/main/messages')` is called exactly once (no duplicate hydration on
  reconnect).
