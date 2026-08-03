# Spec — webhook-triggers

Generic inbound webhook subscriptions: a trusted event → an agent run. One primitive,
covering notify (A), act+deliver (A+B) and B-side workflow entry (B) as configurations.

## S1 — Register a subscription and expose its endpoint

- **GIVEN** `config.webhooks` contains a subscription `{ name, secret, prompt, enabled }`
- **WHEN** the server starts
- **THEN** `POST /webhook/<name>` is routable; an unknown or disabled `<name>` returns 404

## S2 — HMAC authenticity is enforced

- **GIVEN** a subscription with a secret
- **WHEN** a request arrives at `/webhook/<name>` without a valid `X-Reeboot-Signature`
  (HMAC-SHA256 of the raw body over the secret, constant-time compared)
- **THEN** the request is rejected with 401 and no agent run is triggered

## S3 — Body becomes context and drives an agent run

- **GIVEN** a valid signed request with a JSON body
- **WHEN** it reaches the endpoint
- **THEN** the body is mapped to context (default: JSON string), substituted into the
  subscription's `prompt`, and the agent runs that prompt as a task

## S4 — Deliver mode sends the result to a channel+peer

- **GIVEN** a subscription with a `deliver: { channel, peer }` target
- **WHEN** the agent run completes
- **THEN** the agent's result is delivered to the configured channel+peer (notify/act
  patterns); the HTTP caller receives an acknowledgment

## S5 — No-deliver mode returns the result synchronously

- **GIVEN** a subscription with no `deliver` target
- **WHEN** the agent run completes
- **THEN** the endpoint returns the agent's result to the caller as JSON
  (the "webhook as API gateway / command" mode)

## S6 — B-side workflow entry is a configuration

- **GIVEN** a subscription whose prompt starts a specialized conversation / delegates
  (category-3 use, e.g. payment→document-gen or ticket→triage)
- **WHEN** the webhook fires
- **THEN** the same primitive runs it — no separate core surface needed; the delegate/a2a
  and scheduler machinery already present is reused
