# Spec PF-2 — WhatsApp presence implementation

## Capability

`WhatsAppAdapter` implements `markRead`, `startTyping`, and `stopTyping` using
the Baileys socket API. `startTyping` fires a composing presence update every
8 seconds until `stopTyping` is called.

---

## Scenarios

### PF-2-A: markRead sends a read receipt via Baileys

GIVEN a connected WhatsApp adapter  
WHEN `markRead(incomingMsg)` is called  
THEN `sock.readMessages([incomingMsg.raw.key])` is called once  
AND no error is thrown even if `sock.readMessages` rejects

### PF-2-B: markRead is a no-op when socket is not connected

GIVEN a WhatsApp adapter that is not connected (`_socket` is null)  
WHEN `markRead(incomingMsg)` is called  
THEN `sock.readMessages` is NOT called  
AND no error is thrown

### PF-2-C: startTyping sends composing presence immediately

GIVEN a connected WhatsApp adapter  
WHEN `startTyping(incomingMsg)` is called with peerId `"peer1@s.whatsapp.net"`  
THEN `sock.sendPresenceUpdate('composing', 'peer1@s.whatsapp.net')` is called immediately

### PF-2-D: startTyping refreshes composing presence every 8 seconds

GIVEN a connected WhatsApp adapter with fake timers  
WHEN `startTyping(incomingMsg)` is called  
AND 8 seconds elapse  
THEN `sock.sendPresenceUpdate('composing', peerId)` is called a second time  
AND after another 8 seconds it is called a third time

### PF-2-E: stopTyping sends paused presence and clears the refresh interval

GIVEN a connected WhatsApp adapter  
AND `startTyping(incomingMsg)` has been called  
WHEN `stopTyping(incomingMsg)` is called  
THEN `sock.sendPresenceUpdate('paused', peerId)` is called once  
AND no further composing updates are sent after the interval would have fired

### PF-2-F: startTyping errors do not propagate

GIVEN a connected WhatsApp adapter where `sock.sendPresenceUpdate` rejects  
WHEN `startTyping(incomingMsg)` is called  
THEN the promise resolves without throwing

### PF-2-G: markRead is called on incoming messages before bus publish

GIVEN a connected WhatsApp adapter with `readMessages` spy  
WHEN a real-time `messages.upsert` event fires with a non-empty text message  
THEN `sock.readMessages` is called before the message is published to the bus
