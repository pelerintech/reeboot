# Spec: Message Trust Field

---

## Capability: IncomingMessage carries trust field

**GIVEN** an `IncomingMessage` constructed with `trust: 'end-user'`  
**WHEN** the message is published to the bus and received by a subscriber  
**THEN** `message.trust === 'end-user'`

---

## Capability: IncomingMessage trust field is optional

**GIVEN** an `IncomingMessage` constructed without a `trust` field  
**WHEN** the message is published and received  
**THEN** `message.trust` is `undefined` (no runtime error)

---

## Capability: Orchestrator attaches resolved trust to message

**GIVEN** a config with `channels.web.trust = 'end-user'`  
**AND** an incoming message with `channelType: 'web'` and no `trust` field  
**WHEN** the orchestrator handles the message  
**THEN** the message passed to the runner has `trust === 'end-user'`
