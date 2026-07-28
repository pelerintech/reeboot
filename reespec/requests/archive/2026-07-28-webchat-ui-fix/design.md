# Webchat UI fix — design

## Problem 1: Stale `currentAssistantIdRef` across turns

### Root cause

In `webchat/src/pages/Chat.tsx`, a module-level ref (`currentAssistantIdRef`) tracks which assistant message is currently being streamed into. It is:

- **Set** when the first `text_delta` of a turn arrives (no existing ref → create new message)
- **Cleared** in `error` and `cancelled` handlers
- **NOT cleared** in `handleSend` (user submits new message)
- **NOT cleared** in `message_end` (intentionally — see comment about trailing tool events)

This means when the user submits their second message, `currentAssistantIdRef.current` still points to the assistant message from Turn 1. The first `text_delta` from Turn 2 finds an existing ref and appends to the old message instead of creating a new one. Tool calls from Turn 2 also land on the old message.

### Fix

Add `currentAssistantIdRef.current = null` at the end of `handleSend`, after the user message is pushed to state and before `send()` is called.

```
handleSend flow:
  1. Guard: no-op if empty / processing / disconnected
  2. Clear streaming state on existing messages
  3. Push user message to messages array
  4. Clear input & set processing
  5. ★ Clear currentAssistantIdRef.current ← NEW
  6. send() via WebSocket
```

### Why this is safe

| Scenario | Behaviour |
|---|---|
| Turn 1: first `text_delta` | ref is null → creates assistant-1, sets ref |
| Turn 1: subsequent `text_delta` | finds ref (assistant-1) → appends |
| Turn 1: `tool_call_start` | finds ref (assistant-1) → attaches tool call |
| Turn 1: `message_end` | ref preserved (for trailing tool events) |
| Turn 1: trailing `tool_call_end` arrives after `message_end` | finds ref (assistant-1) → updates tool call |
| User clicks send for Turn 2 | ref cleared to null |
| Turn 2: first `text_delta` | ref is null → creates assistant-2, sets ref |

**Guarantee**: The server processes turns sequentially per context. Turn 1's `message_end` is always emitted before Turn 2's first event. WebSocket framing preserves order. So there is no race where Turn 1 trailing events arrive after `handleSend` clears the ref — they always arrive before.

**Zero-text-delta turns**: If a turn produces only tool calls with no text, the `tool_call_start` handler has a fallback: when `currentAssistantIdRef.current` is null, it scans backward through messages to find the last assistant message. With the fix, this fallback could attach to a previous turn's message. However, in practice every turn starts with a `text_delta` (even if empty) because pi emits `message_update` before `tool_execution_start`. The fallback is a safety net that won't trigger in normal operation.

---

## Problem 2: User avatar on wrong side

### Current layout

```
┌─ Message row (flex row) ────────────────────┐
│                                              │
│  [assistant-avatar]  [assistant content]     │
│  [user-avatar]       [user content (text-right)] │
└──────────────────────────────────────────────┘
```

Both avatars are rendered as the first child of the flex container. The user's text is right-aligned but the avatar stays on the left.

### Desired layout

```
┌─ Message row (flex row) ────────────────────┐
│                                              │
│  [assistant-avatar]  [assistant content]     │
│  [user content]      [user-avatar]           │
└──────────────────────────────────────────────┘
```

User avatar on the right, next to the user bubble. Both content areas left-aligned.

### Fix

In the message rendering loop in `Chat.tsx`:

1. **Move the user avatar block** to *after* the content div (it currently comes before)
2. **Change user content alignment** from `text-right` to `text-left`

No CSS changes to `Message.tsx` or `ToolCall.tsx` — they render content based on `role` prop and don't control avatar positioning.

### Visual effect

Assistant message unchanged:
```
✦  Hello! How can I help you today?
```

User message before (broken):
```
👤  What's the weather in Paris?
```

User message after (fixed):
```
What's the weather in Paris?  👤
```
