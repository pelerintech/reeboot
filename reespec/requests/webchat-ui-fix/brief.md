# Webchat UI fix

## Goals

Fix two frontend bugs in the WebChat React SPA that break the conversation display:

1. **Message ordering broken across turns** — `currentAssistantIdRef` is never cleared when the user sends a new message, so streaming events (text_delta, tool_call_start/end) from the next turn are appended to the previous turn's assistant message instead of creating a fresh one. The new response text and tool calls land in the old message bubble, while the user's latest message sits below them.

2. **User avatar on the wrong side** — Both assistant and user avatars are rendered on the left side of the chat. In normal chat UX, the user's avatar belongs on the right, next to their message bubble, with text left-aligned.

## Non-goals

- Not changing server-side event emission, routing, or the WebSocket protocol
- Not changing the WebAdapter, orchestrator, or pi-runner
- Not adding new features to the webchat (multi-context, auth, etc.)
- Not changing the assistant avatar placement (stays on the left)
- Not changing the message hydration from `/api/contexts/main/messages`

## Impact

- Users of the WebChat UI see responses appearing in the correct chronological order
- The chat reads as a normal conversation: assistant on the left, user on the right
- Existing server-side tests are unaffected (no server changes)
- Existing webchat component tests for Message and ToolCall remain valid
