# Spec — B1: WhatsApp `enabled: true` written after QR scan

## Capability

After a successful WhatsApp QR scan (in either the wizard or `reeboot channels login whatsapp`),
`config.json` is updated with `channels.whatsapp.enabled = true` using the load→merge→save
pattern, without resetting any other config fields.

## Scenarios

### GIVEN a `config.json` exists with `whatsapp.enabled: false` and other custom fields
### WHEN WhatsApp QR scan succeeds in the wizard channels step
### THEN `config.json` has `whatsapp.enabled: true`
### AND all other existing config fields are preserved unchanged

---

### GIVEN a `config.json` exists with `whatsapp.enabled: false`
### WHEN `reeboot channels login whatsapp` completes successfully
### THEN `config.json` has `whatsapp.enabled: true`

---

### GIVEN a QR scan times out
### WHEN the wizard channels step completes
### THEN `config.json` is NOT modified (enabled remains false)
