# Spec: Channel Contract

## Overview

A `CHANNEL_CONTRACT.md` file lives in `src/channels/` and is referenced via JSDoc from
`ChannelAdapter`. It defines two tiers of contract. A shared contract test suite enforces
every clause programmatically.

---

## Capability: Contract documentation exists and is referenced

### Scenario: CHANNEL_CONTRACT.md is present and covers both tiers

GIVEN the reeboot source tree  
WHEN `src/channels/CHANNEL_CONTRACT.md` is read  
THEN it contains a section for "Tier 1: External Messaging Channels"  
AND it contains a section for "Tier 2: Local Interface Channels"  
AND it lists inbound, outbound, and lifecycle clauses for each tier  
AND it describes what channels must NOT implement (policy clauses)

### Scenario: ChannelAdapter interface references the contract

GIVEN `src/channels/interface.ts`  
WHEN the file is read  
THEN the `ChannelAdapter` interface JSDoc contains a reference to `CHANNEL_CONTRACT.md`  
AND it indicates the tier classification requirement

---

## Capability: Shared contract test suite — Tier 1

### Scenario: send() drops silently when not connected

GIVEN a Tier 1 channel adapter that has been initialised but not started  
WHEN `send('some-peer', { type: 'text', text: 'hello' })` is called  
THEN it returns without throwing  
AND no message is emitted on the bus

### Scenario: send() drops silently with __system__ when not connected

GIVEN a Tier 1 channel adapter that has been initialised but not started  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN it returns without throwing

### Scenario: init() sets status to initialising

GIVEN a Tier 1 channel adapter  
WHEN `init(config, bus)` is called  
THEN `status()` returns `'initialising'`

### Scenario: stop() prevents reconnection

GIVEN a Tier 1 channel adapter that has been started  
WHEN `stop()` is called  
THEN `status()` returns `'disconnected'`  
AND calling `stop()` a second time does not throw

### Scenario: fromSelf is set on inbound messages

GIVEN a Tier 1 channel adapter connected to a mock transport  
WHEN the mock transport delivers a message originating from the adapter's own account  
THEN the message published to the bus has `fromSelf === true`

GIVEN a Tier 1 channel adapter connected to a mock transport  
WHEN the mock transport delivers a message from a third party  
THEN the message published to the bus has `fromSelf === false`

### Scenario: echo deduplication suppresses own-sent messages

GIVEN a Tier 1 channel adapter connected to a mock transport  
WHEN `send('peer-jid', { type: 'text', text: 'hi' })` is called  
AND the mock transport echoes that message back as an inbound event  
THEN no message is published to the bus

---

## Capability: Shared contract test suite — Tier 2

### Scenario: send() drops silently when not connected

GIVEN a Tier 2 channel adapter that has been initialised but not started  
WHEN `send('some-peer', { type: 'text', text: 'hello' })` is called  
THEN it returns without throwing

### Scenario: __system__ broadcasts to all connected peers

GIVEN a Tier 2 channel adapter that has been started  
AND two peers "peer-a" and "peer-b" are registered  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN both "peer-a" and "peer-b" receive the message

### Scenario: __system__ broadcast tolerates disconnected peers

GIVEN a Tier 2 channel adapter with one registered peer "peer-a" that throws on send  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN no error is thrown  
AND the adapter does not crash

### Scenario: init() sets status to initialising

GIVEN a Tier 2 channel adapter  
WHEN `init(config, bus)` is called  
THEN `status()` returns `'initialising'`

### Scenario: stop() transitions status to disconnected

GIVEN a Tier 2 channel adapter that has been started  
WHEN `stop()` is called  
THEN `status()` returns `'disconnected'`
