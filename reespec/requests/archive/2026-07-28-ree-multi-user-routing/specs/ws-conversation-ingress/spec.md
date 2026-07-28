# Spec — ws-conversation-ingress

The Web/API WS handler supplies `conversationId` from the path and no longer requires a pre-registered
context in ree mode.

## S1 — path segment becomes conversationId
- **GIVEN** ree mode and two WS connections at `/ws/chat/A` and `/ws/chat/B`
- **WHEN** each sends a message
- **THEN** the published messages carry `conversationId:'A'` and `'B'`, each with a distinct
  per-connection `peerId`.

## S2 — unknown id is NOT rejected in ree mode
- **GIVEN** ree mode and a connection at `/ws/chat/never-seen-before`
- **WHEN** it connects
- **THEN** the connection is accepted (the `getContextById` gate is not applied for ree).

## S3 — invalid/reserved id is rejected before dispatch
- **GIVEN** a connection whose id is reserved (`main`) or violates the charset/length policy
- **WHEN** it sends a message
- **THEN** the message is rejected (an error is returned to the client and nothing is dispatched).

## S4 — pi mode unchanged
- **GIVEN** pi mode and `/ws/chat/main`
- **WHEN** a message is sent
- **THEN** behavior matches today (context-gated, routed to the `main` runner).
