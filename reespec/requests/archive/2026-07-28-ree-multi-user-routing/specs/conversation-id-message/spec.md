# Spec — conversation-id-message

`IncomingMessage` carries a `conversationId` isolation axis distinct from the `peerId` routing token.

## S1 — field round-trips
- **GIVEN** `createIncomingMessage({ channelType:'web', peerId:'sess1', conversationId:'A', content:'hi' })`
- **WHEN** the message is created and read
- **THEN** `conversationId === 'A'` and `peerId === 'sess1'`.

## S2 — field is optional (backward compatible)
- **GIVEN** `createIncomingMessage({ channelType:'signal', peerId:'+123', content:'hi' })` (no conversationId)
- **WHEN** created
- **THEN** it succeeds, `conversationId` is `undefined`, and existing callers still type-check.
