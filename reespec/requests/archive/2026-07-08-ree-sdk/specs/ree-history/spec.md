# Spec — ReeHistory (per-chat persistence)

## Capability: Per-chat conversation-history persistence

The `ReeRuntime` persists each chat's conversation history to a reeboot-owned store (NOT pi's `SessionManager` file). History survives process restart and is loaded on chat resume. History is isolated per chat — chat A's history is invisible to chat B.

### Scenarios

#### S1: A turn persists user and assistant messages for the chat

**GIVEN** a `ReeRuntime` with a chat `c1` and a completed turn (user message → assistant response)
**WHEN** the turn completes
**THEN** a row exists in the chat-messages store for the user message (with `chat_id = 'c1'`, role `user`)

**AND** a row exists for the assistant response (with `chat_id = 'c1'`, role `assistant`)

#### S2: History is isolated per chat

**GIVEN** two chats (c1, c2) each with a completed turn
**WHEN** the history store is queried for `c1`
**THEN** only c1's messages are returned

**AND** c2's messages are NOT included

#### S3: Chat resume loads recent history from the store

**GIVEN** a chat `c1` that previously completed 3 turns and was then disposed
**WHEN** a new chat with the same `chatId` is created (resume)
**THEN** the new chat's history is loaded from the store

**AND** the history contains the messages from the previous turns (up to `maxHistoryPerChat`)

#### S4: Idle-evicted chat's history is pruned

**GIVEN** a chat that has been idle-evicted (disposed via `sweepIdle`)
**WHEN** the history store is queried for that chat's `chatId`
**THEN** the history is either deleted OR marked as pruned (no longer returns active rows)

**AND** a resumed chat with the same `chatId` starts with empty history (or a configured retention window)

#### S5: History store is restart-survivable

**GIVEN** a `ReeRuntime` with a chat `c1` that has completed turns, and a process restart
**WHEN** a new `ReeRuntime` is created with the same DB
**THEN** `c1`'s history is still present in the store (the persistence is to durable storage, not in-memory only)
