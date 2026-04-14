# Spec: Loader Wiring

## Capability
`mcp-manager` is wired into `getBundledFactories()` and toggled by `config.extensions.core.mcp`.

---

## Scenarios

### GIVEN config has no `extensions.core.mcp` key (default)
WHEN `getBundledFactories(config)` is called
THEN the returned factories array includes the mcp-manager factory

### GIVEN config has `extensions.core.mcp: false`
WHEN `getBundledFactories(config)` is called
THEN the returned factories array does NOT include the mcp-manager factory

### GIVEN config has `extensions.core.mcp: true`
WHEN `getBundledFactories(config)` is called
THEN the returned factories array includes the mcp-manager factory
