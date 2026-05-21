# Spec PF-3 — Signal presence implementation

## Capability

`SignalAdapter` implements `markRead`, `startTyping`, and `stopTyping` using
the signal-cli-rest-api HTTP endpoints. No refresh loop is needed.

---

## Scenarios

### PF-3-A: markRead posts a read receipt to the REST API

GIVEN a connected Signal adapter with phone number `"+15550001234"`  
WHEN `markRead(incomingMsg)` is called with a message from `"+15559876543"`  
THEN `POST /v1/receipts/%2B15550001234` is called with body:
  `{ "recipient": "+15559876543", "receipt_type": "read", "timestamp": <msg.timestamp> }`

### PF-3-B: markRead is a no-op when adapter is not connected

GIVEN a Signal adapter with `status()` !== `'connected'`  
WHEN `markRead(incomingMsg)` is called  
THEN no HTTP request is made  
AND no error is thrown

### PF-3-C: startTyping sends a PUT to the typing-indicator endpoint

GIVEN a connected Signal adapter with phone number `"+15550001234"`  
WHEN `startTyping(incomingMsg)` is called with peerId `"+15559876543"`  
THEN `PUT /v1/typing-indicator/%2B15550001234` is called  
WITH body `{ "recipient": "+15559876543" }`

### PF-3-D: stopTyping sends a DELETE to the typing-indicator endpoint

GIVEN a connected Signal adapter with phone number `"+15550001234"`  
WHEN `stopTyping(incomingMsg)` is called with peerId `"+15559876543"`  
THEN `DELETE /v1/typing-indicator/%2B15550001234` is called  
WITH body `{ "recipient": "+15559876543" }`

### PF-3-E: Presence errors do not propagate

GIVEN a Signal adapter where `fetch` rejects on typing/receipt calls  
WHEN `markRead`, `startTyping`, or `stopTyping` is called  
THEN the promise resolves without throwing

### PF-3-F: markRead is called on incoming messages before bus publish

GIVEN a connected Signal adapter with `fetch` spy  
WHEN a message arrives via WebSocket or polling  
THEN the receipts POST is issued before the message is published to the bus
