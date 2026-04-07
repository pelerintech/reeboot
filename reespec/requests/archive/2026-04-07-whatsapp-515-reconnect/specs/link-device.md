# Spec — linkWhatsAppDevice reconnect behaviour

## Capability

`linkWhatsAppDevice` completes successfully when WhatsApp sends a 515 stream restart after QR scan.

---

## Scenarios

### GIVEN a fresh QR scan, WHEN WA sends 515 and then the reconnected socket opens, THEN onSuccess is called

- `linkWhatsAppDevice` is called with `onQr`, `onSuccess`, `onTimeout` callbacks
- First socket emits `connection: 'close'` with `lastDisconnect.error.output.statusCode = 515`
- A second socket is created automatically
- Second socket emits `connection: 'open'`
- `onSuccess()` is called exactly once
- `onTimeout()` is not called

### GIVEN a direct connect (no 515), WHEN the socket opens, THEN onSuccess is called

- First socket emits `connection: 'open'` directly
- `onSuccess()` is called exactly once
- `onTimeout()` is not called

### GIVEN the timeout fires before any open, THEN onTimeout is called

- No socket ever emits `connection: 'open'` within `timeoutMs`
- `onTimeout()` is called exactly once
- `onSuccess()` is not called

### GIVEN WA sends loggedOut (401), THEN neither callback fires (fatal abort)

- First socket emits `connection: 'close'` with statusCode 401
- No reconnect attempt is made
- Neither `onSuccess` nor `onTimeout` is called immediately
- (Timeout would eventually fire — tested separately)

### GIVEN a 515 reconnect, WHEN the second socket opens, THEN onSuccess fires only once

- Even if `connection: 'open'` fires multiple times across sockets
- `onSuccess()` is called at most once (guarded by `resolved` flag)
