# render_confirm tool and ConfirmWidget

## CF1: ConfirmWidget renders title, message, and buttons

**GIVEN** a `ConfirmWidget` component
**WHEN** rendered with `{ title: "Cancel order?", message: "Order #123 will be cancelled", confirmLabel: "Yes, cancel", cancelLabel: "No" }`
**THEN** the component displays the title, message, and two buttons (confirm + cancel)

## CF2: Confirm button dispatches action WS message

**GIVEN** a `ConfirmWidget` component rendered with confirm data
**WHEN** the user clicks the confirm button
**THEN** a WebSocket message is sent: `{ type: "action", action: "confirm", value: true, surfaceId: "<confirm-view-id>" }`

## CF3: Cancel button dispatches action WS message

**GIVEN** a `ConfirmWidget` component rendered with confirm data
**WHEN** the user clicks the cancel button
**THEN** a WebSocket message is sent: `{ type: "action", action: "confirm", value: false, surfaceId: "<confirm-view-id>" }`

## CF4: Tool returns confirm view

**GIVEN** a registered `render_confirm` tool
**WHEN** a tool call is made with `{ title: "Cancel order?", message: "Are you sure?", confirmLabel: "Yes", cancelLabel: "No" }`
**THEN** the tool returns `{ content: "Cancel order #123?", view: { type: "confirm", title: "Cancel order?", message: "Are you sure?", confirmLabel: "Yes", cancelLabel: "No" } }`
**AND** the WebChat renders a ConfirmWidget

## CF5: Validation rejects missing title

**GIVEN** a registered `render_confirm` tool
**WHEN** a tool call is made with `{ message: "test" }` (no title)
**THEN** the tool returns an error with `isError: true`

## CF6: Content fallback for non-webchat channels

**GIVEN** a registered `render_confirm` tool
**WHEN** a tool call is made with confirm data
**THEN** the `content` field contains text like "Cancel order #123? Reply 'yes' to confirm or 'no' to cancel"
**AND** the text is suitable for display in non-webchat channels

## CF7: Server handles action WS message

**GIVEN** a WebSocket connection to the server
**WHEN** the server receives `{ type: "action", action: "confirm", value: true, surfaceId: "cf-1" }`
**THEN** the server injects a structured message into the conversation: "[User confirmed: true]"
**AND** a new agent turn is triggered with this content
