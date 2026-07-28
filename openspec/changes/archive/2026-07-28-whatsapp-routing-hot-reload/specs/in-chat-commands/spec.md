## ADDED Requirements

### Requirement: In-chat commands are parsed before agent dispatch
The orchestrator SHALL check if `IncomingMessage.content` starts with `/` and attempt to match known commands before calling `runner.prompt()`. Matched commands SHALL be handled internally; the message SHALL NOT be forwarded to the agent runner.

#### Scenario: /new command resets the session
- **WHEN** user sends "/new"
- **THEN** the current runner is disposed, a new session file path is created, a new runner is created for the context, and a confirmation is sent back: "New session started."

#### Scenario: /context <name> switches routing context
- **WHEN** user sends "/context work" from any channel
- **THEN** subsequent messages from that peerId are routed to the "work" context (peer-level routing override stored in memory for the session)

#### Scenario: /contexts lists available contexts
- **WHEN** user sends "/contexts"
- **THEN** a reply lists all context names, one per line, with the current context marked with `*`

#### Scenario: /status shows current state
- **WHEN** user sends "/status"
- **THEN** a reply shows: current context name, current model (provider + id), and token usage for the current session (input + output)

#### Scenario: /compact triggers session compaction
- **WHEN** user sends "/compact"
- **THEN** the pi session's compaction mechanism is triggered and a confirmation is sent: "Session compacted."

### Requirement: Unknown slash commands are forwarded to the agent
If a message starts with `/` but does not match any known command, it SHALL be forwarded to the agent runner as a normal message.

#### Scenario: Unknown slash command reaches the agent
- **WHEN** user sends "/search for cats"
- **THEN** the agent receives the message and can respond to it

### Requirement: Commands work across all channels
In-chat commands SHALL work identically in WhatsApp, Signal, and WebChat. The orchestrator handles them channel-agnostically.

#### Scenario: /new works in WhatsApp
- **WHEN** WhatsApp user sends "/new"
- **THEN** session is reset and confirmation is sent via WhatsApp
