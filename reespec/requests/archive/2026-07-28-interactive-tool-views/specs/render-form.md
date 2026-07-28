# render_form tool and FormWidget

## F1: FormWidget renders text, select, and number fields

**GIVEN** a `FormWidget` component
**WHEN** rendered with fields:
- `{ name: "name", label: "Company name", type: "text" }`
- `{ name: "type", label: "Company type", type: "select", options: ["Tech", "Finance"] }`
- `{ name: "employees", label: "Employees", type: "number" }`
**THEN** the component renders a text input, a select dropdown, and a number input
**AND** each field has its label displayed

## F2: Form submit dispatches action WS message with field values

**GIVEN** a `FormWidget` rendered with form fields
**WHEN** the user fills in fields and clicks submit
**THEN** a WebSocket message is sent: `{ type: "action", action: "form_submit", fields: { name: "Acme", type: "Tech", employees: 50 }, surfaceId: "<form-view-id>" }`

## F3: Form validates required fields before submit

**GIVEN** a `FormWidget` rendered with form fields
**WHEN** the user clicks submit without filling required fields
**THEN** the submit button is disabled (client-side validation)
**AND** no WS message is sent

## F4: Tool returns form view

**GIVEN** a registered `render_form` tool
**WHEN** a tool call is made with fields
**THEN** the tool returns `{ content: "Please fill in the form", view: { type: "form", fields: [...] } }`
**AND** the WebChat renders a FormWidget

## F5: Validation rejects empty fields array

**GIVEN** a registered `render_form` tool
**WHEN** a tool call is made with `{ fields: [] }`
**THEN** the tool returns an error with `isError: true`

## F6: Validation rejects unknown field types

**GIVEN** a registered `render_form` tool
**WHEN** a tool call is made with a field of type "checkbox" (not in allowed types)
**THEN** the tool returns an error with `isError: true`

## F7: Content fallback for non-webchat channels

**GIVEN** a registered `render_form` tool
**WHEN** a tool call is made with form fields
**THEN** the `content` field contains a text listing all required fields, like "Please provide: company name (text), company type (select: Tech, Finance), employees (number)"
**AND** the text is suitable for display in non-webchat channels

## F8: Server handles form_submit WS message

**GIVEN** a WebSocket connection to the server
**WHEN** the server receives `{ type: "action", action: "form_submit", fields: { name: "Acme", type: "Tech" }, surfaceId: "f-1" }`
**THEN** the server injects a structured message into the conversation: "[Form Response: { name: "Acme", type: "Tech" }]"
**AND** a new agent turn is triggered with this content
