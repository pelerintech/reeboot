# Spec: Config Schema

---

## Capability: Channel trust field accepted in config

**GIVEN** a `config.json` with `channels.web.trust = 'end-user'`  
**WHEN** `loadConfig()` parses it  
**THEN** `config.channels.web.trust === 'end-user'`

---

## Capability: Channel trust defaults to owner

**GIVEN** a `config.json` with no `trust` field on any channel  
**WHEN** `loadConfig()` parses it  
**THEN** `config.channels.web.trust === 'owner'` and `config.channels.whatsapp.trust === 'owner'`

---

## Capability: trusted_senders field accepted

**GIVEN** a `config.json` with `channels.whatsapp.trusted_senders = ['+15551234567']`  
**WHEN** `loadConfig()` parses it  
**THEN** `config.channels.whatsapp.trusted_senders` equals `['+15551234567']`

---

## Capability: trusted_senders defaults to empty array

**GIVEN** a `config.json` with no `trusted_senders` on any channel  
**WHEN** `loadConfig()` parses it  
**THEN** `config.channels.web.trusted_senders` equals `[]`

---

## Capability: contexts tool whitelist accepted

**GIVEN** a `config.json` with `contexts: [{ name: 'support', tools: { whitelist: ['send_message'] } }]`  
**WHEN** `loadConfig()` parses it  
**THEN** `config.contexts[0].tools.whitelist` equals `['send_message']`

---

## Capability: contexts defaults to empty array

**GIVEN** a `config.json` with no `contexts` field  
**WHEN** `loadConfig()` parses it  
**THEN** `config.contexts` equals `[]`
