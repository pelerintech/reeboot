# Spec: broadcast-notification

## Capability

`broadcastToAllChannels` sends a text message to every active channel adapter simultaneously. Used by crash recovery, outage declaration, and outage resolution. Failures on individual adapters are logged but do not prevent delivery to other adapters.

---

## Scenarios

### Message is sent to all registered adapters

GIVEN two channel adapters registered (e.g. web + whatsapp)  
WHEN `broadcastToAllChannels(adapters, "test message")` is called  
THEN `adapter.send()` is called on both adapters  
AND both calls receive the same message text

---

### One adapter failure does not block others

GIVEN two channel adapters, the first of which throws on `send()`  
WHEN `broadcastToAllChannels` is called  
THEN the second adapter still receives the message  
AND the error from the first adapter is caught and logged (not thrown)

---

### No adapters registered — completes silently

GIVEN an empty adapters map  
WHEN `broadcastToAllChannels` is called  
THEN no error is thrown  
AND the function completes without sending anything
