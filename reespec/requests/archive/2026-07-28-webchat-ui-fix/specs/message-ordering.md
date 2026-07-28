# Message ordering across turns

## S1: New assistant message is created for each turn

**GIVEN** a Chat component rendered with an empty message list
**WHEN** the component receives:
  1. An initial `text_delta` ("Hello") followed by `message_end`
  2. Then the user sends a new message ("What's the weather?")
  3. Then a `text_delta` ("Let me check...") arrives for the second turn
**THEN** the messages array contains three entries: user-1, assistant-1 ("Hello"), user-2, assistant-2 ("Let me check...")
**AND** assistant-2 is a distinct message from assistant-1 (different id, content did not append to assistant-1)

## S2: Tool calls from second turn attach to correct message

**GIVEN** a Chat component with a completed first turn (assistant-1 exists)
**WHEN** the user sends a second message, then `text_delta` ("Searching...") arrives, then `tool_call_start` arrives for the second turn
**THEN** the tool call is attached to assistant-2 (the new message), not to assistant-1

## S3: Trailing tool_call_end after message_end still works within same turn

**GIVEN** a Chat component receiving events in this order: `text_delta`, `tool_call_start`, `message_end`, `tool_call_end`
**WHEN** the `tool_call_end` arrives after `message_end`
**THEN** the tool call on assistant-1 is updated with the result (currentAssistantIdRef must not be cleared on message_end)

## S4: Error handler resets ref

**GIVEN** a Chat component receiving events for turn 1
**WHEN** an `error` event arrives
**THEN** currentAssistantIdRef is null, and subsequent text_delta creates a new assistant message

## S5: Cancelled handler resets ref

**GIVEN** a Chat component receiving events for turn 1
**WHEN** a `cancelled` event arrives
**THEN** currentAssistantIdRef is null, and subsequent text_delta creates a new assistant message
