## ADDED Requirements

### Requirement: Credential proxy starts on localhost:3001 when enabled
`src/credential-proxy.ts` SHALL start a second Fastify instance on `localhost:3001` when `config.credentialProxy.enabled === true`. It SHALL forward all requests to the target LLM provider URL, replacing the `Authorization` header with the real API key from config.

#### Scenario: Proxy forwards request with real key
- **WHEN** a request arrives with `Authorization: Bearer placeholder-reeboot` and `X-Reeboot-Provider: anthropic`
- **THEN** the proxy forwards the request to the Anthropic API URL with `Authorization: Bearer <realApiKey>`

#### Scenario: Proxy only listens on loopback
- **WHEN** proxy is started
- **THEN** it only binds to `127.0.0.1`, not `0.0.0.0`

### Requirement: Proxy is not started when disabled
If `config.credentialProxy.enabled === false` (default), `src/credential-proxy.ts` SHALL export a no-op `startProxy()` that returns immediately.

#### Scenario: Proxy does not start when disabled
- **WHEN** `config.credentialProxy.enabled = false` and `startProxy()` is called
- **THEN** no port 3001 listener is opened

### Requirement: Proxy supports multiple LLM providers via header
The `X-Reeboot-Provider` header in the incoming request SHALL determine which provider's API key is injected and which base URL is used for forwarding. Supported providers: anthropic, openai, google, openrouter.

#### Scenario: Correct provider URL is used for forwarding
- **WHEN** request has `X-Reeboot-Provider: openai`
- **THEN** the request is forwarded to the OpenAI API base URL with the OpenAI API key
