# ChannelQrDialog UI

## Capability

A modal dialog component that guides the user through the QR scan or phone-number pairing flow.

---

### GIVEN the user clicks "Connect" on a disconnected WhatsApp channel, WHEN the QR data URL arrives, THEN the dialog shows the QR image with instructions

- Dialog is rendered as a modal overlay on the Channels page
- Title: "Connect WhatsApp"
- Instructions: "Open WhatsApp → Settings → Linked Devices → Link a Device, then scan this QR code"
- QR image is displayed (280x280px)
- A "Cancel" button closes the dialog without affecting adapter state

### GIVEN the QR image is displayed, WHEN the user has not scanned for 30 seconds, THEN a "QR not working?" fallback link appears

- A text link appears below the QR: "QR not working? Try phone number instead"
- Remaining time indicator (optional): "Link expires in X:XX"

### GIVEN the QR flow times out, WHEN the link timeout fires, THEN the dialog shows error state with retry and fallback options

- Message: "QR code expired. You can try again or use your phone number instead."
- Button: "Try QR again" — triggers POST /qr again
- Button: "Use phone number" — transitions to pairing mode

### GIVEN the user clicks "Use phone number", WHEN pairing mode is activated, THEN the dialog shows a phone number input

- Input field labelled: "Phone number (with country code)"
- Placeholder: "+1234567890"
- Button: "Send pairing request"
- Cancel button returns to previous state or closes dialog

### GIVEN a pairing request is sent, WHEN waiting for phone approval, THEN the dialog shows "waiting for approval" state

- Message: "Pairing request sent. Approve the link on your phone."
- A spinner or progress indicator
- Cancel button aborts and returns to channel list

### GIVEN the QR scan succeeds or pairing is approved, WHEN the adapter connects, THEN the dialog auto-closes

- Adapter status changes to "connected" (detected via poll)
- Dialog closes automatically
- Channel row shows green "connected" status

### GIVEN the pairing flow fails, WHEN an error occurs, THEN the dialog shows error with retry

- Message: "Pairing failed. Try again or use QR."
- Button: "Try again" — re-triggers pairing
- Button: "Try QR instead" — switches to QR mode
