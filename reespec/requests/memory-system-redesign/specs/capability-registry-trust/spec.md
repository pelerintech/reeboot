# Spec — capability-registry-trust

Provider-declared capabilities are surfaced through ONE uniform mechanism and governed by
the same trust machinery as first-party tools — "a tool is a tool".

## S1 — Provider capabilities are declared via a uniform registry

- **GIVEN** a provider exposing `listCapabilities()` returning `CapabilityDef[]`
- **WHEN** the active provider is (re)selected
- **THEN** the memory extension walks the registry and registers one tool per capability —
  the same mechanism for builtin, dreem, and mem0 alike; no per-backend special-casing.

## S2 — Declared capabilities are namespaced

- **GIVEN** a provider `dreem` declares a capability `graph`
- **WHEN** the tool is registered
- **THEN** its name is the namespaced form `memory::dreem::graph`, filterable/loggable/
  attributable in the audit log.

## S3 — Malformed capability defs are rejected at registration

- **GIVEN** a provider declares a malformed or non-conforming tool definition
- **WHEN** the memory extension attempts registration
- **THEN** the definition is rejected (schema-validated) and never enters the tool list.

## S4 — Injecting capability defs are blocked

- **GIVEN** a provider declares a tool whose description/instructions contain injection
  patterns
- **WHEN** the declared content is scanned by the injection scanner before registration
- **THEN** the tool is blocked and not registered.

## S5 — Provider tools obey the same policy/gating as first-party tools

- **GIVEN** a provider-declared capability tool
- **WHEN** the trust-enforcer whitelist / permission-tier / `minAuthLevel` gate applies
- **THEN** it is governed identically to first-party tools — a deployment's `permissions`
  and trust config apply uniformly; no bespoke trust path.

## S6 — Provider recall output is treated as untrusted external content

- **GIVEN** `recall` results are surfaced to the agent
- **WHEN** they are not from the local builtin store
- **THEN** injection-guard's external-source policy (treat-as-data) applies to them,
  consistent with other external tool output.
