# Spec: Policy Layer

## Overview

`ChannelPolicyLayer` wraps any Tier 1 channel adapter. It handles owner identity
resolution, owner-only gating, and `__system__` → owner address resolution.
Channels wrapped by the policy layer become pure transport adapters.

---

## Capability: Owner identity — Mode 1 (self-chat)

### Scenario: Message with fromSelf=true is passed through when owner_id is absent

GIVEN a policy layer wrapping a mock adapter  
AND config has no `owner_id` set  
AND `owner_only` is true  
WHEN the inner adapter publishes a message with `fromSelf: true`  
THEN the message is forwarded to the bus

### Scenario: Message with fromSelf=false is dropped when owner_only and no owner_id

GIVEN a policy layer wrapping a mock adapter  
AND config has no `owner_id` and `owner_only: true`  
WHEN the inner adapter publishes a message with `fromSelf: false`  
THEN the message is NOT forwarded to the bus

---

## Capability: Owner identity — Mode 2 (dedicated account)

### Scenario: Message from owner_id is passed through

GIVEN a policy layer wrapping a mock adapter  
AND config has `owner_id: '+40700000001'` and `owner_only: true`  
WHEN the inner adapter publishes a message with `peerId: '+40700000001'`  
THEN the message is forwarded to the bus

### Scenario: Message from non-owner is dropped in owner_only mode

GIVEN a policy layer wrapping a mock adapter  
AND config has `owner_id: '+40700000001'` and `owner_only: true`  
WHEN the inner adapter publishes a message with `peerId: '+40700000002'`  
THEN the message is NOT forwarded to the bus

### Scenario: owner_only false passes all messages through

GIVEN a policy layer wrapping a mock adapter  
AND config has `owner_id: '+40700000001'` and `owner_only: false`  
WHEN the inner adapter publishes a message with `peerId: '+40700000099'`  
THEN the message IS forwarded to the bus

---

## Capability: __system__ resolution

### Scenario: __system__ resolves to owner_id in Mode 2

GIVEN a policy layer wrapping a mock adapter  
AND config has `owner_id: '+40700000001'`  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN the inner adapter's `send()` is called with `peerId: '+40700000001'`

### Scenario: __system__ resolves to self-address in Mode 1

GIVEN a policy layer wrapping a mock adapter  
AND config has no `owner_id`  
AND the inner adapter exposes its own identity as `'self-jid'`  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN the inner adapter's `send()` is called with `peerId: 'self-jid'`

### Scenario: __system__ is dropped when owner address is unknown

GIVEN a policy layer wrapping a mock adapter  
AND config has no `owner_id`  
AND the inner adapter has no self-address available (not yet connected)  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN the call returns without throwing  
AND the inner adapter's `send()` is NOT called

---

## Capability: Policy layer is transparent for lifecycle and status

### Scenario: status() delegates to inner adapter

GIVEN a policy layer wrapping a mock adapter that returns `'connected'`  
WHEN `status()` is called on the policy layer  
THEN it returns `'connected'`

### Scenario: start() and stop() delegate to inner adapter

GIVEN a policy layer wrapping a mock adapter  
WHEN `start()` is called  
THEN the inner adapter's `start()` is called  
WHEN `stop()` is called  
THEN the inner adapter's `stop()` is called

---

## Capability: Policy layer is applied to all external channels

### Scenario: WhatsApp adapter is wrapped in server init

GIVEN a running reeboot server  
WHEN the channel adapters map is inspected  
THEN the 'whatsapp' entry is a `ChannelPolicyLayer` instance  
AND the 'signal' entry is a `ChannelPolicyLayer` instance

### Scenario: Web adapter is NOT wrapped

GIVEN a running reeboot server  
WHEN the channel adapters map is inspected  
THEN the 'web' entry is NOT a `ChannelPolicyLayer` instance
