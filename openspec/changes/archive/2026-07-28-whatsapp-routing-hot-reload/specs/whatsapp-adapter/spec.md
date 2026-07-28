## ADDED Requirements

### Requirement: WhatsApp adapter connects via Baileys v7 and displays QR code
The WhatsApp adapter SHALL use `@whiskeysockets/baileys` v7 to establish a WhatsApp Web connection. On first connect (no saved auth state), it SHALL display a QR code in the terminal via Baileys' `printQRInTerminal: true` option. Auth state SHALL be persisted at `~/.reeboot/channels/whatsapp/auth/`.

#### Scenario: QR code is displayed on first connect
- **WHEN** `adapter.start()` is called with no existing auth state
- **THEN** a QR code is printed to the terminal for the user to scan

#### Scenario: Saved auth state is loaded on subsequent starts
- **WHEN** `adapter.start()` is called and `~/.reeboot/channels/whatsapp/auth/` contains a valid auth state
- **THEN** the adapter connects without displaying a QR code

### Requirement: Incoming text messages are published to the MessageBus
The adapter SHALL listen for `messages.upsert` events from Baileys, filter to `type: "notify"` and `fromMe === false`, extract the text content, and emit an `IncomingMessage` on the `MessageBus`.

#### Scenario: User text message is emitted on bus
- **WHEN** Baileys fires `messages.upsert` for an incoming text message
- **THEN** the bus receives an `IncomingMessage` with `channelType: "whatsapp"`, correct `peerId`, and `content` set to the message text

#### Scenario: Own messages and status updates are ignored
- **WHEN** Baileys fires `messages.upsert` for a message with `fromMe === true`
- **THEN** no `IncomingMessage` is emitted on the bus

### Requirement: Adapter sends text messages to WhatsApp peers
`adapter.send(peerId, { type: "text", text })` SHALL call Baileys `sendMessage(peerId, { text })`. Messages longer than 4096 characters SHALL be split and sent sequentially with 100ms delay between chunks.

#### Scenario: Short message is sent as single Baileys sendMessage call
- **WHEN** `adapter.send("12345@s.whatsapp.net", { type: "text", text: "Hello" })` is called
- **THEN** Baileys `sendMessage` is called once with the full text

#### Scenario: Long message is chunked and sent sequentially
- **WHEN** `adapter.send` is called with text longer than 4096 characters
- **THEN** Baileys `sendMessage` is called multiple times, once per chunk

### Requirement: Adapter auto-reconnects on disconnection
The adapter SHALL handle `connection.update` events from Baileys. On `DisconnectReason.loggedOut` it SHALL update status to `'error'` and not reconnect. On all other disconnect reasons it SHALL reconnect automatically.

#### Scenario: Non-logout disconnect triggers reconnect
- **WHEN** Baileys fires connection.update with a non-logout disconnect reason
- **THEN** adapter attempts to reconnect

#### Scenario: Logged out disconnect stops reconnect
- **WHEN** Baileys fires connection.update with DisconnectReason.loggedOut
- **THEN** adapter status is set to 'error' and no reconnect is attempted

### Requirement: QR login is available via reeboot channels login whatsapp
The CLI command `reeboot channels login whatsapp` SHALL start the WhatsApp adapter in login-only mode (no agent started), display the QR code, wait for successful connection, then exit.

#### Scenario: Login command completes after QR scan
- **WHEN** user runs `reeboot channels login whatsapp` and scans the QR code
- **THEN** auth state is saved and the CLI exits with success message
