## MODIFIED Requirements

### Requirement: reeboot reload is fully implemented
`reeboot reload` SHALL call `loader.reload()` on all active runners (replacing the stub from Week 1). On success it SHALL print "Extensions and skills reloaded." and exit 0. If any loader throws, it SHALL print the error and exit 1.

#### Scenario: Reload succeeds and prints confirmation
- **WHEN** `reeboot reload` is run while the agent is running
- **THEN** stdout shows "Extensions and skills reloaded." and exit code is 0

#### Scenario: Reload error prints error and exits 1
- **WHEN** `reeboot reload` is run and loader.reload() throws
- **THEN** the error is printed and exit code is 1

### Requirement: reeboot restart is fully implemented
`reeboot restart` SHALL trigger graceful shutdown per the session-lifecycle spec and then exit 0.

#### Scenario: Restart exits 0 after graceful shutdown
- **WHEN** `reeboot restart` is run
- **THEN** all channels are stopped, all runners disposed, process exits 0

### Requirement: reeboot channels login whatsapp displays QR and saves auth
`reeboot channels login whatsapp` SHALL start the WhatsApp adapter in login-only mode, print the QR code, wait for connection, print success, and exit 0.

#### Scenario: Login completes after QR scan
- **WHEN** `reeboot channels login whatsapp` is run and user scans the QR
- **THEN** auth state is saved to `~/.reeboot/channels/whatsapp/auth/` and CLI exits 0 with "WhatsApp connected."

### Requirement: reeboot channels list shows all channel statuses
`reeboot channels list` SHALL print a table of configured channels with their current status (connected/disconnected/error).

#### Scenario: Channel list shows status
- **WHEN** `reeboot channels list` is run
- **THEN** each configured channel appears with its status
