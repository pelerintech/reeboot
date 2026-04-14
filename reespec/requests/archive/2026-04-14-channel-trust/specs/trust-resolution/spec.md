# Spec: Trust Resolution

---

## Capability: Channel default trust resolves to owner

**GIVEN** a config with `channels.whatsapp.trust = 'owner'`  
**WHEN** `resolveMessageTrust('whatsapp', '+15559999999', config)` is called  
**THEN** returns `'owner'`

---

## Capability: Channel default trust resolves to end-user

**GIVEN** a config with `channels.web.trust = 'end-user'`  
**WHEN** `resolveMessageTrust('web', 'socket-abc123', config)` is called  
**THEN** returns `'end-user'`

---

## Capability: Sender override elevates trust above channel default

**GIVEN** a config with `channels.whatsapp.trust = 'end-user'` and `channels.whatsapp.trusted_senders = ['+15551234567']`  
**WHEN** `resolveMessageTrust('whatsapp', '+15551234567', config)` is called  
**THEN** returns `'owner'`

---

## Capability: Non-listed sender on mixed channel uses channel default

**GIVEN** a config with `channels.whatsapp.trust = 'end-user'` and `channels.whatsapp.trusted_senders = ['+15551234567']`  
**WHEN** `resolveMessageTrust('whatsapp', '+15559999999', config)` is called  
**THEN** returns `'end-user'`

---

## Capability: Unknown channel type defaults to owner

**GIVEN** a config with no entry for channel type `'telegram'`  
**WHEN** `resolveMessageTrust('telegram', 'user-xyz', config)` is called  
**THEN** returns `'owner'`

---

## Capability: Missing trust config defaults to owner

**GIVEN** a config where channel schemas have no `trust` field (existing config)  
**WHEN** `resolveMessageTrust('whatsapp', '+15559999999', config)` is called  
**THEN** returns `'owner'`
