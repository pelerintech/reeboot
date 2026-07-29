# QR generation

## Capability

`POST /api/channels/whatsapp/qr` generates a fresh QR code from Baileys and returns it as a data URL.

---

### GIVEN the WhatsApp adapter is stopped, WHEN POST /api/channels/whatsapp/qr is called, THEN a QR data URL is returned

- Adapter has not been started or has been stopped
- Auth directory is empty
- Response status is 200
- Response body contains `{ qrDataUrl: "data:image/png;base64,..." }`
- The string starts with `data:image/png;base64,`

### GIVEN the WhatsApp adapter is connected, WHEN POST /api/channels/whatsapp/qr is called, THEN the adapter is stopped, auth is cleared, and QR is returned

- Adapter status was "connected" before the call
- After the call, adapter status is "disconnected" (adapter stopped)
- Auth directory contents have been removed
- Response contains a valid QR data URL

### GIVEN Baileys fails to generate a QR within 2 minutes, WHEN POST /api/channels/whatsapp/qr is called, THEN a timeout error is returned

- Response status is 408 (Request Timeout) or 500
- Response body contains `{ error: "QR not generated within timeout" }`

### GIVEN POST /api/channels/whatsapp/qr returns a QR, WHEN the QR is scanned on WhatsApp, THEN the adapter starts and connects

- After scan, `linkWhatsAppDevice`'s `onSuccess` fires
- `adapter.start()` is called
- Adapter status transitions to "connected" (within reasonable time)
- Auth directory contains valid creds files

### GIVEN POST /api/channels/whatsapp/qr returns a QR, WHEN 2 minutes pass without a scan, THEN the link flow times out

- `linkWhatsAppDevice`'s `onTimeout` fires
- Adapter stays stopped
- Status remains "disconnected"
