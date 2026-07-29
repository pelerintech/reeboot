# Reset / switch account

## Capability

`POST /api/channels/whatsapp/reset` stops the adapter, clears auth files, and leaves the adapter in a stopped state ready for a fresh link.

---

### GIVEN the WhatsApp adapter is connected, WHEN POST /api/channels/whatsapp/reset is called, THEN the adapter is stopped and auth is cleared

- Request body: `{}` (empty)
- Response status is 200
- Response body contains `{ status: "reset" }`
- `adapter.stop()` is called
- Adapter status is now "disconnected"
- Auth directory (`~/.reeboot/channels/whatsapp/auth/`) is empty or deleted

### GIVEN the WhatsApp adapter is disconnected or error, WHEN POST /api/channels/whatsapp/reset is called, THEN auth is still cleared

- Adapter was already in disconnected or error state
- Auth directory is emptied (fresh start)
- Response status is 200
- Adapter stays stopped (no auto-start)

### GIVEN POST /api/channels/whatsapp/reset is called, WHEN POST /api/channels/whatsapp/qr follows, THEN a fresh QR is generated

- Reset clears the way for a completely fresh link
- QR endpoint works as normal after reset
- No stale auth interferes with the new link flow
