## ADDED Requirements

### Requirement: ChannelAdapter interface is defined and exported
`src/channels/interface.ts` SHALL export `ChannelAdapter`, `MessageBus`, `ChannelConfig`, `ChannelStatus`, `MessageContent`, and `IncomingMessage` types. The `ChannelAdapter` interface SHALL be exported from `reeboot/channels` (via `package.json#exports`).

#### Scenario: Types are importable from reeboot/channels
- **WHEN** an external module does `import type { ChannelAdapter } from "reeboot/channels"`
- **THEN** the type is available with no compilation errors

### Requirement: MessageBus is an EventEmitter-based interface
`MessageBus` SHALL be an EventEmitter (or compatible interface) where channels emit `('message', IncomingMessage)` events and the orchestrator subscribes to them. `IncomingMessage` SHALL contain: `channelType`, `peerId`, `content` (text), `timestamp`, `raw` (provider-specific original message object).

#### Scenario: Message event carries expected shape
- **WHEN** a channel emits a message event on the bus
- **THEN** the handler receives an `IncomingMessage` with all required fields populated

### Requirement: ChannelAdapter lifecycle methods are defined
`ChannelAdapter` SHALL define: `init(config, bus): Promise<void>` (register with bus, set up internals), `start(): Promise<void>` (open connection), `stop(): Promise<void>` (close connection gracefully), `send(peerId, content): Promise<void>` (send a message), `status(): ChannelStatus`. `ChannelStatus` SHALL be `'connected' | 'disconnected' | 'error' | 'initializing'`.

#### Scenario: Adapter implements all interface methods
- **WHEN** a class implementing ChannelAdapter is instantiated
- **THEN** TypeScript compiler verifies all required methods are present
