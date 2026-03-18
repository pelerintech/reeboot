## ADDED Requirements

### Requirement: ChannelRegistry registers and retrieves adapters
`src/channels/registry.ts` SHALL export a `ChannelRegistry` class with `register(type, factory)` and `get(type): ChannelAdapter | undefined` methods. Built-in adapters (whatsapp, web) SHALL call `registerChannel()` at module import time. The registry SHALL be a singleton per process.

#### Scenario: Built-in adapters are available after import
- **WHEN** `import "./channels/whatsapp.js"` is executed
- **THEN** `registry.get("whatsapp")` returns a factory

#### Scenario: Unregistered type returns undefined
- **WHEN** `registry.get("telegram")` is called without registering telegram
- **THEN** the result is `undefined`

### Requirement: Custom channel adapters are loaded from config paths
If `config.channels.<type>.adapter` contains a file path, the registry SHALL dynamically import that file and expect a default export implementing `ChannelAdapter`. Load errors SHALL be caught and reported per-adapter without crashing the process.

#### Scenario: Custom adapter is loaded from config path
- **WHEN** config has `channels.telegram.adapter = "~/.reeboot/channels/telegram.ts"` and the file exports a valid ChannelAdapter
- **THEN** `registry.get("telegram")` returns the adapter after startup

#### Scenario: Custom adapter load error is reported without crash
- **WHEN** the adapter file has a syntax error
- **THEN** an error is logged and the other channels start normally

### Requirement: initChannels() starts all enabled adapters
`initChannels(config, bus)` SHALL iterate `config.channels`, skip disabled channels, load custom adapters if needed, call `adapter.init(config, bus)` then `adapter.start()` for each enabled channel. It SHALL return a map of running adapters.

#### Scenario: Only enabled channels are started
- **WHEN** config has `whatsapp.enabled = false` and `web.enabled = true`
- **THEN** only the web adapter's `start()` is called
