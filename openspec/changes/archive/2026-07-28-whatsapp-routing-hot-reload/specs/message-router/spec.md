## ADDED Requirements

### Requirement: Orchestrator routes messages to contexts by routing rules
`src/orchestrator.ts` SHALL implement `Orchestrator` that subscribes to the `MessageBus` and routes each `IncomingMessage` to a context using the following priority: (1) exact peer match in `config.routing.rules`, (2) channel-type match in `config.routing.rules`, (3) `config.routing.default`. The resolved context's `AgentRunner` SHALL receive the message.

#### Scenario: Peer match takes highest priority
- **WHEN** an IncomingMessage arrives with `channelType: "whatsapp"` and `peerId: "12345@s.whatsapp.net"` and a routing rule matches that exact peer to context "work"
- **THEN** the message is dispatched to the "work" context runner

#### Scenario: Channel match is used when no peer match
- **WHEN** an IncomingMessage arrives from Signal with no peer-specific rule but a channel rule maps Signal → "main"
- **THEN** the message is dispatched to "main"

#### Scenario: Default context is used as fallback
- **WHEN** no routing rule matches the incoming message
- **THEN** the message is dispatched to `config.routing.default` (default: "main")

### Requirement: Orchestrator replies via the originating channel
After `runner.prompt()` resolves, the orchestrator SHALL call `adapter.send(peerId, { type: "text", text: <full response> })` on the channel adapter that received the original message. The full response is accumulated from all `text_delta` events.

#### Scenario: Response is sent back through the originating channel
- **WHEN** a WhatsApp message is processed and the agent produces a response
- **THEN** the WhatsApp adapter's `send()` is called with the peerId and assembled response text

### Requirement: Busy context sends a "please wait" reply
If a message arrives for a context that is already processing a turn, the orchestrator SHALL send an immediate reply via the originating channel: "I'm still working on your last request. Please wait." The new message SHALL be queued (not dropped) and processed after the current turn completes. Queue depth SHALL be limited to 5 messages per context; additional messages are dropped with a "queue full" reply.

#### Scenario: Busy context gets please-wait reply
- **WHEN** a second message arrives for a context already running a turn
- **THEN** the sender receives "I'm still working on your last request. Please wait."

#### Scenario: Queued message is processed after turn completes
- **WHEN** the current turn for a context completes
- **THEN** the next queued message is immediately dispatched
