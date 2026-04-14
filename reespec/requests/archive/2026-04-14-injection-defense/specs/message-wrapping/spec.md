# Spec: Message Wrapping

---

## Capability: End-user messages are wrapped with trust notice

**GIVEN** `PiAgentRunner.prompt()` is called with `options.trust = 'end-user'`  
**WHEN** the content is passed to the underlying pi session  
**THEN** the content passed to the session starts with `[UNTRUSTED END-USER MESSAGE]`  
**AND** the original message content appears between the opening and closing markers

---

## Capability: Owner messages are not wrapped

**GIVEN** `PiAgentRunner.prompt()` is called with `options.trust = 'owner'`  
**WHEN** the content is passed to the underlying pi session  
**THEN** the content passed to the session is identical to the original message — no wrapping applied

---

## Capability: Missing trust defaults to no wrapping

**GIVEN** `PiAgentRunner.prompt()` is called with no `options` argument  
**WHEN** the content is passed to the underlying pi session  
**THEN** the content is not wrapped (treated as owner trust)
