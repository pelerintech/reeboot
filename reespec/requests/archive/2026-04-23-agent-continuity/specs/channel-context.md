# Spec: Channel Context in Prompts

## Capability

Every prompt dispatched to the agent runner includes a channel context header identifying
the channel type and peer ID of the originating message, so the agent always knows where
it is and who it is talking to.

---

## Scenarios

### CC-1: Header prepended for channel messages

GIVEN a message arrives with `channelType: 'whatsapp'` and `peerId: '+40712345678'`  
WHEN the orchestrator dispatches the turn  
THEN the content passed to `runner.prompt()` starts with `[channel: whatsapp | peer: +40712345678]`  
AND the original message content follows on the next line

### CC-2: Header prepended for web channel

GIVEN a message arrives with `channelType: 'web'` and `peerId: 'session-abc123'`  
WHEN the orchestrator dispatches the turn  
THEN the content passed to `runner.prompt()` starts with `[channel: web | peer: session-abc123]`

### CC-3: Scheduler turns are not prefixed with channel header

GIVEN a turn is fired by the scheduler (`channelType: 'scheduler'`)  
WHEN the orchestrator dispatches the turn  
THEN the content passed to `runner.prompt()` does NOT start with `[channel: scheduler`  
(The scheduler prompt is enriched separately with routing instructions — see scheduling spec)

### CC-4: Recovery turns carry the header

GIVEN a crashed turn is requeued with `channelType: 'recovery'`  
WHEN re-dispatched  
THEN the channel context header is NOT prepended  
(Recovery turns already contain the original prompt; double-wrapping would confuse the agent)
