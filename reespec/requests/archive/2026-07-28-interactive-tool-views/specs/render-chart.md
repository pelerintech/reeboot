# render_chart tool

## C1: Tool returns data-chart view with bar chart

**GIVEN** a registered `render_chart` tool
**WHEN** a tool call is made with `{ labels: ["Jan", "Feb"], values: [10, 20], kind: "bar" }`
**THEN** the tool returns `{ content: "Chart: 2 data points", view: { type: "data-chart", labels: ["Jan", "Feb"], values: [10, 20], kind: "bar" } }`
**AND** the WebChat renders a DataChart component with bar SVG elements

## C2: Tool returns data-chart view with line chart

**GIVEN** a registered `render_chart` tool
**WHEN** a tool call is made with `{ labels: ["A", "B", "C"], values: [5, 15, 10], kind: "line" }`
**THEN** the tool returns `{ content: "Chart: 3 data points", view: { type: "data-chart", labels: ["A", "B", "C"], values: [15, 10], kind: "line" } }`
**AND** the WebChat renders a DataChart component with line SVG elements

## C3: Validation rejects empty labels

**GIVEN** a registered `render_chart` tool
**WHEN** a tool call is made with `{ labels: [], values: [], kind: "bar" }`
**THEN** the tool returns an error result with `isError: true`
**AND** the error message indicates that labels and values must be non-empty

## C4: Validation rejects mismatched lengths

**GIVEN** a registered `render_chart` tool
**WHEN** a tool call is made with `{ labels: ["A", "B"], values: [1], kind: "bar" }`
**THEN** the tool returns an error result with `isError: true`
**AND** the error message indicates that labels and values must have the same length

## C5: Content fallback for non-webchat channels

**GIVEN** a registered `render_chart` tool
**WHEN** a tool call is made with chart data
**THEN** the `content` field contains a human-readable text summary of the chart
**AND** the text is suitable for display in non-webchat channels (WhatsApp, Signal, CLI)
