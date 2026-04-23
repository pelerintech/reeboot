# Spec: Web Channel Fixes

## Overview

Fix the `__system__` broadcast bug and bring the web adapter to full Tier 2
contract compliance.

---

## Capability: __system__ broadcasts to all connected peers

### Scenario: Both connected peers receive a __system__ message

GIVEN a web adapter that has been started  
AND peer "peer-a" is registered with a mock sender  
AND peer "peer-b" is registered with a mock sender  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN the mock sender for "peer-a" receives `{ type: 'text', text: 'hello' }`  
AND the mock sender for "peer-b" receives `{ type: 'text', text: 'hello' }`

### Scenario: __system__ with no connected peers returns without throwing

GIVEN a web adapter that has been started  
AND no peers are registered  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN no error is thrown

### Scenario: __system__ broadcast continues if one peer sender throws

GIVEN a web adapter with "peer-a" whose sender throws  
AND "peer-b" whose sender succeeds  
WHEN `send('__system__', { type: 'text', text: 'hello' })` is called  
THEN no error is thrown  
AND "peer-b" still receives the message
