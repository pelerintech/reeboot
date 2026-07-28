## ADDED Requirements

### Requirement: Signal adapter connects via signal-cli-rest-api Docker sidecar
The Signal adapter SHALL communicate with a running `bbernhard/signal-cli-rest-api` Docker container via its REST API on a configurable port (default: 8080). `adapter.status()` SHALL return `'error'` if Docker is not running or the container is not found.

#### Scenario: Adapter reports error if Docker not running
- **WHEN** Docker is not running and `adapter.start()` is called
- **THEN** `adapter.status()` returns `'error'`

#### Scenario: Adapter connects to running signal-cli container
- **WHEN** signal-cli-rest-api is running and configured correctly
- **THEN** `adapter.start()` resolves and `adapter.status()` returns `'connected'`

### Requirement: Signal adapter polls for incoming messages
The adapter SHALL poll `GET /v1/receive/<number>` at a configurable interval (default: 1000ms). Each received message SHALL be emitted as an `IncomingMessage` on the `MessageBus` with `channelType: "signal"`.

#### Scenario: Incoming Signal message is emitted on bus
- **WHEN** the poll endpoint returns a message
- **THEN** an `IncomingMessage` is emitted with `channelType: "signal"` and correct content

#### Scenario: Poll interval is configurable
- **WHEN** `config.channels.signal.pollInterval = 2000`
- **THEN** the adapter polls every 2000ms

### Requirement: Signal adapter sends text messages
`adapter.send(peerId, { type: "text", text })` SHALL call `POST /v2/send` on the signal-cli REST API. Long messages SHALL be chunked at 4096 characters (same as WhatsApp adapter).

#### Scenario: Short message is sent via signal-cli REST API
- **WHEN** `adapter.send("+1234567890", { type: "text", text: "Hello" })` is called
- **THEN** `POST /v2/send` is called with the recipient and message

### Requirement: reeboot channels login signal guides through Docker setup
`reeboot channels login signal` SHALL guide the user through: (1) checking if Docker is installed and running, (2) pulling `bbernhard/signal-cli-rest-api`, (3) starting the container, (4) registering or linking a phone number. Each step prints clear instructions or detects already-done state.

#### Scenario: Login detects existing running container
- **WHEN** `reeboot channels login signal` is run and the Docker container is already running
- **THEN** CLI reports "signal-cli-rest-api already running" and skips Docker steps
