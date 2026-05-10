# Spec — D1: WhatsApp JID troubleshooting documentation

## Capability

`docs/channels/whatsapp.md` explains the `@s.whatsapp.net` vs `@lid` format issue
so users who hit it manually can understand what happened and how to recover.

## Scenarios

### GIVEN `docs/channels/whatsapp.md`
### WHEN inspected
### THEN it contains a "Troubleshooting" section

---

### GIVEN the troubleshooting section
### WHEN inspected
### THEN it explains what `@s.whatsapp.net` and `@lid` are
### AND explains why Baileys may use `@lid` in multi-device mode
### AND explains how to find the correct JID via debug log (`peerId` field)
### AND references `reeboot channels setup owner-whatsapp` as the recommended fix
