# Spec: External Content Policy

---

## Capability: Injection guard injects external content policy into system prompt

**GIVEN** `security.injection_guard.enabled = true`  
**AND** `security.injection_guard.external_source_tools = ['fetch_url', 'gmail_read']`  
**WHEN** the `before_agent_start` hook fires  
**THEN** the returned system prompt contains an `<external_content_policy>` block  
**AND** the block names `fetch_url` and `gmail_read` as untrusted sources

---

## Capability: External content policy disabled by config

**GIVEN** `security.injection_guard.enabled = false`  
**WHEN** the `before_agent_start` hook fires  
**THEN** the system prompt is returned unchanged (no external content policy block)

---

## Capability: Empty external_source_tools list skips injection

**GIVEN** `security.injection_guard.enabled = true`  
**AND** `security.injection_guard.external_source_tools = []`  
**WHEN** the `before_agent_start` hook fires  
**THEN** the system prompt is returned unchanged

---

## Capability: Extension registered in loader when enabled

**GIVEN** `extensions.core.injection_guard` is `true` (default)  
**WHEN** `getBundledFactories(config)` is called  
**THEN** the returned factories array includes the injection-guard factory
