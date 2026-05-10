# Spec — F2: Owner number setup command

## Capability

`reeboot channels setup owner-whatsapp` captures the owner's WhatsApp identity
by waiting for a live incoming message and saving the exact `peerId` to config.
Eliminates the `@s.whatsapp.net` vs `@lid` format ambiguity.

## Scenarios

### GIVEN WhatsApp is enabled in config
### WHEN `reeboot channels setup owner-whatsapp` is run
### THEN the user is shown a choice: self-chat or different number

---

### GIVEN the owner setup command is running
### WHEN the user selects "self-chat"
### THEN `owner_id` is cleared (set to empty string) in config
### AND other config fields are preserved

---

### GIVEN the owner setup command is running
### WHEN the user selects "different number" and a message arrives with peerId "43624150659184@lid"
### THEN `owner_id` is saved as "43624150659184@lid" in config
### AND a confirmation is printed showing the captured identity

---

### GIVEN the owner setup command is waiting for a message
### WHEN the user presses Q
### THEN the command exits cleanly without modifying config

---

### GIVEN WhatsApp is NOT enabled in config
### WHEN `reeboot channels setup owner-whatsapp` is run
### THEN an error is shown: "WhatsApp is not enabled. Run `reeboot channels login whatsapp` first."

---

### GIVEN a successful WhatsApp QR scan in the wizard
### WHEN the QR scan completes (onSuccess fires)
### THEN the owner setup subflow runs immediately as the next step
