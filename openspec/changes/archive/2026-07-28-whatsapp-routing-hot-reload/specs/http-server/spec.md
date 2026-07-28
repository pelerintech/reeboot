## MODIFIED Requirements

### Requirement: GET /api/channels returns channel statuses
`GET /api/channels` SHALL return `[{ type, status, connectedAt }]` for all configured channels, reading live status from the `ChannelRegistry`.

#### Scenario: Channel list is returned
- **WHEN** `GET /api/channels` is called
- **THEN** response is HTTP 200 with an array of channel status objects

### Requirement: POST /api/channels/:type/login initiates channel login
`POST /api/channels/:type/login` SHALL initiate the login flow for the specified channel type. For WhatsApp this starts the Baileys QR flow and returns a 202 Accepted immediately (QR appears in terminal, not in API response).

#### Scenario: Login returns 202
- **WHEN** `POST /api/channels/whatsapp/login` is called
- **THEN** response is HTTP 202 with `{ message: "Login initiated. Check terminal for QR code." }`

#### Scenario: Unknown channel type returns 404
- **WHEN** `POST /api/channels/unknown/login` is called
- **THEN** response is HTTP 404

### Requirement: POST /api/channels/:type/logout disconnects a channel
`POST /api/channels/:type/logout` SHALL call `adapter.stop()` for the channel and update status to `'disconnected'`.

#### Scenario: Logout disconnects and returns 200
- **WHEN** `POST /api/channels/whatsapp/logout` is called
- **THEN** the WhatsApp adapter is stopped and response is HTTP 200
