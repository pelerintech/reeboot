# Spec — Logging

## Capability

Live log stream with level filtering, pause/resume, and error notification.

## Scenarios

### GIVEN the user navigates to the Logs tab
**WHEN** the Logs panel loads
**THEN** a live log stream is established via SSE (`GET /api/logs/stream`)
**AND** log records are displayed as colored rows in a scrollable container
**AND** the latest logs are at the bottom of the container
**AND** the container auto-scrolls to the bottom as new logs arrive

### GIVEN the user is viewing the Logs tab
**WHEN** a log record is received
**THEN** the log record is parsed from the SSE event data
**AND** the log row is rendered with timestamp, level, component, and message
**AND** the log row is color-coded by level (info=white, warn=yellow, error=red, fatal=bright red)
**AND** the log row is added to the bottom of the log container
**AND** the container auto-scrolls to show the new log

### GIVEN the user is viewing the Logs tab with level filter set to "info"
**WHEN** a log record with level "debug" is received
**THEN** the log record is filtered out and not displayed
**AND** the level filter dropdown remains set to "info"

### GIVEN the user is viewing the Logs tab with level filter set to "warn"
**WHEN** a log record with level "error" is received
**THEN** the log record is displayed
**AND** the log record with level "info" is filtered out
**AND** the log record with level "fatal" is displayed

### GIVEN the user clicks the "Pause" button
**WHEN** the pause button is clicked
**THEN** the pause button text changes to "Resume"
**AND** incoming log records are not displayed
**AND** the log container is not auto-scrolling
**AND** the pause state is maintained until the user clicks "Resume"

### GIVEN the user clicks the "Resume" button
**WHEN** the resume button is clicked
**THEN** the resume button text changes to "Pause"
**AND** incoming log records are displayed again
**AND** the log container resumes auto-scrolling
**AND** new log records are appended to the existing log entries

### GIVEN the user is viewing the Logs tab
**WHEN** an error or fatal log record is received
**THEN** the error badge count is incremented
**AND** the badge is displayed on the Logs tab button (top-right corner)
**AND** the badge shows the count of unread error/fatal logs
**AND** the badge is red with white text
**AND** the badge is only visible when the Logs tab is not active

### GIVEN the user is on a different tab
**WHEN** an error or fatal log record is received
**THEN** the error badge count is incremented
**AND** the badge is displayed on the Logs tab button
**AND** the badge is visible and shows the count

### GIVEN the user clicks on the Logs tab
**WHEN** the Logs tab becomes active
**THEN** the error badge is cleared (hidden)
**AND** the error badge count is reset to 0
**AND** the Logs panel is displayed with the full log stream

### GIVEN the SSE connection is lost
**WHEN** the EventSource errors
**THEN** the logs status text changes to "Reconnecting..."
**AND** the EventSource is automatically reconnected by the browser
**AND** once reconnected, the status text changes to "Connected"
**AND** log records continue to be displayed after reconnection
**AND** if the reconnection fails after multiple attempts, an error message is displayed: "⚠ Failed to connect to logs stream"

### GIVEN the user is viewing the Logs tab
**WHEN** the log container is scrolled to the top
**THEN** the user can view earlier log entries
**AND** the container does not auto-scroll while the user is scrolled up
**AND** the user can scroll back to the bottom to see the latest logs
**AND** the log container maintains scroll position when new logs arrive while scrolled up

### GIVEN the user is viewing the Logs tab
**WHEN** the log container is full (many log entries)
**THEN** the container is scrollable (overflow-y: auto)
**AND** the container has a fixed height (fills remaining viewport space)
**AND** the user can scroll through the entire log history
**AND** the log entries are not truncated (full content visible)
