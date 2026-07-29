# Channels page button wiring

## Capability

The existing Channels page buttons for WhatsApp are updated to use the new QR/pairing dialog instead of the current generic terminal-only Login/Reconnect actions.

---

### GIVEN the WhatsApp channel status is "disconnected", WHEN the user sees the channel row, THEN a "Connect" button is shown

- Button text: "Connect"
- Clicking opens the ChannelQrDialog in QR mode
- Existing "Login" and "Reconnect" buttons are replaced

### GIVEN the WhatsApp channel status is "error" (logged out), WHEN the user sees the channel row, THEN a "Reconnect" button is shown

- Button text: "Reconnect"
- Clicking calls POST /reset first, then opens ChannelQrDialog in QR mode
- Existing "Login" button is replaced

### GIVEN the WhatsApp channel status is "connected", WHEN the user sees the channel row, THEN a "Switch account" button is shown

- Button text: "Switch account"
- Clicking calls POST /reset, then opens ChannelQrDialog in QR mode
- Existing "Logout" button is retained (simple stop, no reset)
- "Switch account" is a new button alongside "Logout"

### GIVEN the WhatsApp channel is in the middle of a link flow, WHEN the user navigates away from Channels and back, THEN the dialog does not persist

- Dialog state is local to the component (not persisted across navigation)
- Navigating away cancels any ongoing link flow (component unmount cleanup aborts if possible)
- User must click Connect/Reconnect again to start a new link flow

### GIVEN the WhatsApp channel is being reconnected via the dialog, WHEN the channel status polling returns "connected", THEN the dialog closes

- The existing 5-second polling interval continues to run
- On "connected", dialog auto-closes
- Channel row shows green indicator immediately
