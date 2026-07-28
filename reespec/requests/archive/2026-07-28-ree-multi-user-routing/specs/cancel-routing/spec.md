# Spec — cancel-routing

A cancel on one conversation aborts only that conversation's in-flight turn.

## S1 — cancel carries conversationId
- **GIVEN** ree mode and an in-flight turn on `conversationId:'A'`
- **WHEN** a cancel is sent on A's connection
- **THEN** the cancel resolves to context `'A'` and aborts A's turn.

## S2 — cancel does not affect other conversations
- **GIVEN** A and B both mid-turn
- **WHEN** a cancel is sent for A
- **THEN** B's in-flight turn is unaffected.
