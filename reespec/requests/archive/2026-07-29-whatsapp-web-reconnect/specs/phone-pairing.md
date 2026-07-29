# Phone number pairing fallback

## Capability

`POST /api/channels/whatsapp/pair` uses Baileys' phone-number pairing mode as a fallback when QR fails or the user prefers it.

---

### GIVEN the WhatsApp adapter is stopped, WHEN POST /api/channels/whatsapp/pair is called with a valid phone number, THEN a pairing request is sent

- Request body: `{ phone: "+1234567890" }`
- Baileys socket is created with `pairingCode: true` and the provided `phoneNumber`
- Response status is 200
- Response body contains `{ status: "pairing_requested" }` or `{ status: "paired" }`

### GIVEN a pairing request is sent, WHEN the user approves on their phone, THEN the adapter connects

- Baileys socket reaches `connection: 'open'`
- Auth is saved to the adapter's auth directory
- `adapter.start()` is called
- Adapter transitions to "connected"

### GIVEN POST /api/channels/whatsapp/pair is called, WHEN the phone number is missing or invalid, THEN a validation error is returned

- Request body is empty or missing `phone`
- Response status is 400
- Response body contains `{ error: "phone is required" }`

### GIVEN POST /api/channels/whatsapp/pair is called, WHEN the pairing request times out (2 min), THEN an error is returned

- No approval on phone within the timeout window
- Response status is 408 or 500
- Response body contains `{ error: "Pairing timed out" }`
- Adapter stays stopped

### GIVEN POST /api/channels/whatsapp/pair is called, WHEN the user is already connected, THEN the adapter is reset first

- Same behaviour as QR: adapter stopped, auth cleared, then pairing flow started
