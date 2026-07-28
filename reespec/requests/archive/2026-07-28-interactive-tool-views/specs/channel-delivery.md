# Channel content delivery (non-webchat)

## D1: Non-webchat adapter receives tool content fallback for view-producing tools

**GIVEN** a tool call that returns `{ content: "<text>", view: { ... } }`
**AND** the originating channel adapter does NOT implement `sendEvent` (i.e. it is a
non-webchat adapter such as WhatsApp, Signal, or Telegram)
**WHEN** the orchestrator processes the `tool_call_end` event
**THEN** the adapter's `send(peerId, { type: "text", text: <content> })` is invoked with
the tool's `content` text fallback
**AND** the user on that channel receives the information as a plain text message, even
though no chart/plan/form/confirm widget is rendered

## D2: Webchat adapter receives the structured view, not a duplicate text message

**GIVEN** a channel adapter that DOES implement `sendEvent` (i.e. WebAdapter)
**WHEN** the orchestrator processes a `tool_call_end` event that carries a `view`
**THEN** the event is forwarded via `sendEvent(peerId, event)` so the webchat renders the
rich widget
**AND** the tool's `content` text fallback is NOT additionally sent via `send()` (the
widget is the canonical rendering; no duplicate text delivery)

## D3: Tools without a view are not delivered via the content-fallback path

**GIVEN** a tool call that returns `content` but NO `view` field
**WHEN** the orchestrator processes the `tool_call_end` event
**THEN** no extra `send()` call is made for the tool's content (the LLM's own
narrative reply, delivered at end-of-turn, is the sole delivery channel for non-view tools)

## D4: Delivery is fire-and-forget and never breaks the turn

**GIVEN** a non-webchat adapter whose `send()` rejects (e.g. disconnected peer,
transport error)
**WHEN** the orchestrator attempts to deliver the content fallback
**THEN** the rejection is swallowed (no unhandled rejection, no turn failure)
**AND** the turn continues to completion normally

## D5: Content text is extracted robustly from the tool result

**GIVEN** a `tool_call_end` event whose `result` may be `{ content: "string" }` or
`{ content: [{ type: "text", text: "..." }] }` or a bare array of text blocks
**WHEN** the orchestrator extracts the fallback text
**THEN** a non-empty human-readable string is produced from whichever shape is present
**AND** if no text can be extracted, no `send()` is attempted (nothing delivered)
