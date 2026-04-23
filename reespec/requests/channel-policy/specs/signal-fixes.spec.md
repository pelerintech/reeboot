# Spec: Signal Channel Fixes

## Overview

Bring the Signal adapter to full Tier 1 contract compliance. Fix three behavioural
bugs and add missing observability.

---

## Capability: syncMessage self-destination filter

### Scenario: Note-to-self syncMessage is processed

GIVEN a Signal adapter with `phoneNumber: '+40700000001'`  
WHEN a `syncMessage.sentMessage` envelope arrives with `destinationNumber: '+40700000001'`  
THEN the message is published to the bus  
AND peerId is `'+40700000001'`

### Scenario: syncMessage to a third party is dropped

GIVEN a Signal adapter with `phoneNumber: '+40700000001'`  
WHEN a `syncMessage.sentMessage` envelope arrives with `destinationNumber: '+40700000002'`  
THEN NO message is published to the bus

---

## Capability: Echo deduplication

### Scenario: Agent-sent message that echoes back as syncMessage is suppressed

GIVEN a Signal adapter connected to a mock signal-cli  
WHEN `send('+40700000001', { type: 'text', text: 'agent reply' })` is called  
AND the mock delivers a `syncMessage.sentMessage` for that same text within 10 seconds  
THEN NO message is published to the bus

### Scenario: Genuine note-to-self typed by user is not suppressed

GIVEN a Signal adapter with no recent sends  
WHEN a `syncMessage.sentMessage` arrives  
THEN the message IS published to the bus

---

## Capability: send() status guard

### Scenario: send() returns silently when not connected

GIVEN a Signal adapter that has been initialised but not started  
WHEN `send('+40700000001', { type: 'text', text: 'hello' })` is called  
THEN it returns without throwing  
AND no HTTP request is made to signal-cli

---

## Capability: Observability logging

### Scenario: Received message is logged

GIVEN a Signal adapter processing an inbound message  
WHEN a valid text message is received  
THEN a log line matching `[Signal] Received message` is written to console

### Scenario: Skipped empty message is logged

GIVEN a Signal adapter processing an inbound envelope with no text  
WHEN the envelope is handled  
THEN a log line matching `[Signal] Skipping empty` is written to console
