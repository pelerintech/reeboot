# Spec — Channel Status

## Capability

View channel status and manage channel connections (login/logout/reconnect).

## Scenarios

### GIVEN the user navigates to the Channels tab
**WHEN** the Channels panel loads
**THEN** the channel list is fetched from `GET /api/channels`
**AND** each channel is displayed with its status (connected, disconnected, error)
**AND** the WhatsApp channel shows its current state (e.g., "WhatsApp: Connected", "WhatsApp: Disconnected")
**AND** the Signal channel shows its current state
**AND** other configured channels show their states

### GIVEN the user is viewing the Channels tab
**WHEN** the user clicks the "Reconnect" button for a channel
**THEN** a POST request is sent to `/api/channels/:type/reconnect` with `{ type: 'whatsapp' }`
**AND** a loading indicator is shown for that channel
**AND** if the reconnection is successful, the channel status updates to "Connected"
**AND** if the reconnection fails, an error message is displayed: "⚠ Failed to reconnect WhatsApp"

### GIVEN the WhatsApp channel is disconnected
**WHEN** the user clicks the "Login" button for WhatsApp
**THEN** a POST request is sent to `/api/channels/:type/login` with `{ type: 'whatsapp' }`
**AND** the channel status changes to "Connecting..."
**AND** if the login is successful, the status updates to "Connected"
**AND** if the login fails, an error message is displayed: "⚠ WhatsApp login failed"

### GIVEN the WhatsApp channel is connected
**WHEN** the user clicks the "Logout" button for WhatsApp
**THEN** a POST request is sent to `/api/channels/:type/logout` with `{ type: 'whatsapp' }`
**AND** the channel status changes to "Disconnecting..."
**AND** if the logout is successful, the status updates to "Disconnected"
**AND** if the logout fails, an error message is displayed: "⚠ WhatsApp logout failed"

### GIVEN the user is viewing the Channels tab
**WHEN** the channel status changes (e.g., due to network issues, server restart)
**THEN** the channel list is automatically refreshed via polling (every 5 seconds)
**AND** the channel status updates in real-time without page refresh
**AND** the status indicator changes color (green for connected, red for disconnected, yellow for reconnecting)

### GIVEN the user has multiple channels configured
**WHEN** the user navigates to the Channels tab
**THEN** all configured channels are listed (WhatsApp, Signal, etc.)
**AND** each channel shows its name, status, and last seen timestamp
**AND** the user can interact with each channel independently (reconnect, login, logout)
**AND** the channel list is sorted by connection status (connected first, then disconnected)

### GIVEN the user is viewing the Channels tab
**WHEN** the server returns an error response from `/api/channels`
**THEN** an error message is displayed: "⚠ Failed to load channel status"
**AND** a retry button is shown to re-fetch the channel list
**AND** the user can retry without navigating away from the Channels tab

### GIVEN the user is viewing the Channels tab
**WHEN** the user clicks on a channel's status
**THEN** a details panel expands showing:
- Channel type (e.g., "WhatsApp")
- Connection status (Connected, Disconnected, Error)
- Last seen timestamp
- Error message (if applicable)
- Reconnect/Login/Logout buttons (contextual based on status)
