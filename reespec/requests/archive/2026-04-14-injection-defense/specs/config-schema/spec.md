# Spec: Config Schema

---

## Capability: Security injection_guard config accepted

**GIVEN** a `config.json` with `security.injection_guard.enabled = false`  
**WHEN** `loadConfig()` parses it  
**THEN** `config.security.injection_guard.enabled === false`

---

## Capability: Injection guard enabled by default

**GIVEN** a `config.json` with no `security` field  
**WHEN** `loadConfig()` parses it  
**THEN** `config.security.injection_guard.enabled === true`

---

## Capability: external_source_tools configurable

**GIVEN** a `config.json` with `security.injection_guard.external_source_tools = ['gmail_read', 'rss_read']`  
**WHEN** `loadConfig()` parses it  
**THEN** `config.security.injection_guard.external_source_tools` equals `['gmail_read', 'rss_read']`

---

## Capability: external_source_tools defaults to fetch_url and web_fetch

**GIVEN** a `config.json` with no `security` field  
**WHEN** `loadConfig()` parses it  
**THEN** `config.security.injection_guard.external_source_tools` equals `['fetch_url', 'web_fetch']`
