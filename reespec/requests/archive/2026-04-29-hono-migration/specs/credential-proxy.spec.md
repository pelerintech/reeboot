# Spec: Credential Proxy

## Capability
A separate Hono server intercepts LLM API calls and injects the real API key, stripping the placeholder.

## Scenarios

### Scenario: Proxy does not start when disabled

GIVEN `config.credentialProxy.enabled` is `false`
WHEN `startProxy(config)` is called
THEN it resolves with `null`

### Scenario: Proxy starts on loopback

GIVEN `config.credentialProxy.enabled` is `true`
AND port is 0 (dynamic) or explicit
WHEN `startProxy(config)` is called
THEN it resolves with a running server
AND the server listens on `127.0.0.1`

### Scenario: Proxy forwards request and replaces auth header

GIVEN the proxy is running with an Anthropic API key configured
WHEN a request is made with `POST /v1/messages`
AND `Authorization: Bearer placeholder-reeboot`
AND `X-Reeboot-Provider: anthropic`
THEN the forwarded `fetch()` is called to `https://api.anthropic.com/v1/messages`
AND the forwarded request has `Authorization: Bearer <real-key>`

### Scenario: Proxy uses correct provider URL

GIVEN the proxy is running
WHEN a request is made with `X-Reeboot-Provider: openai`
THEN the target URL is `https://api.openai.com`

AND when `X-Reeboot-Provider: google`
THEN the target URL is `https://generativelanguage.googleapis.com`

### Scenario: Proxy forwards response headers and body

GIVEN the proxy forwards a request
WHEN the provider responds with status 200, headers, and body
THEN the proxy response has the same status
AND the same headers (except `transfer-encoding`)
AND the same body text

### Scenario: Proxy handles provider errors

GIVEN the provider is unreachable
WHEN the forwarded `fetch` throws
THEN the proxy responds with status 502
AND body contains `{ error: 'Proxy error: <message>' }`

### Scenario: stopProxy closes the server

GIVEN the proxy is running
WHEN `stopProxy()` is called
THEN the server stops accepting connections
AND `_proxyServer` is null

### Scenario: stopProxy is idempotent

GIVEN the proxy is already stopped
WHEN `stopProxy()` is called again
THEN it resolves without error
