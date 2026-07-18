# Spec — ree-conversation-isolation

Concurrent customer conversations are fully isolated: distinct chats, histories, and reply routing.

## S1 — distinct chats and histories
- **GIVEN** two conversations `A` and `B` with interleaved turns
- **WHEN** both have run
- **THEN** `runtime.getChat('A')` and `runtime.getChat('B')` are distinct instances, and A's
  `chat_messages` rows never appear under B (and vice-versa).

## S2 — reply routing per connection
- **GIVEN** A and B connected on separate WS connections
- **WHEN** A's turn produces output
- **THEN** the reply is delivered only to A's connection (`peerId`), never to B's.

## S3 — independent serialization
- **GIVEN** A is mid-turn (busy)
- **WHEN** B sends a message
- **THEN** B's turn runs without waiting for A (per-conversation busy/queue), and a second message to A
  queues behind A's in-flight turn.
