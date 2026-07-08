# Spec — Extension Refactoring

## Capability: Refactor 17 Extensions

All 17 bundled extensions are refactored to depend on reeboot's `ExtensionAPI` instead of pi's `ExtensionAPI`. No functional changes — behavior is preserved exactly.

### Scenarios

#### S1: All extensions import from local path

**GIVEN** all 17 extension files are refactored  
**WHEN** a module imports `ExtensionAPI` from any extension  
**THEN** the import path is local: `from '../extensions/extension-api.js'` (or similar relative path)

**AND** no extension imports `ExtensionAPI` from `@earendil-works/pi-coding-agent`

#### S2: budget-manager uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/budget-manager.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 3 tools (`set_budget`, `check_budget`, `budget_status`)

**AND** the extension still subscribes to 3 events (`turn_end`, `before_agent_start`, `agent_end`)

#### S3: capabilities.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/capabilities.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still hooks `before_agent_start` and calls `pi.getAllTools()`

#### S4: confirm-destructive.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/confirm-destructive.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still subscribes to 4 events (`tool_call`, `before_agent_start`, `session_before_switch`, `session_before_fork`)

#### S5: custom-compaction.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/custom-compaction.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still subscribes to `session_before_compact`

#### S6: injection-guard.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/injection-guard.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still hooks `before_agent_start`

#### S7: knowledge-manager.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/knowledge-manager.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 4 tools and subscribes to 3 events (`before_agent_start`, `agent_end`, `session_shutdown`)

#### S8: mcp-manager.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/mcp-manager.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 1 tool and subscribes to 2 events (`before_agent_start`, `session_shutdown`)

#### S9: memory-manager.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/memory-manager.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 2 tools and hooks `before_agent_start`

#### S10: observability.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/observability.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still subscribes to 2 events (`session_shutdown`, `after_provider_response`)

#### S11: protected-paths.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/protected-paths.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still subscribes to `tool_call`

#### S12: scheduler-tool.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/scheduler-tool.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 7 tools and subscribes to 2 events (`session_shutdown`, `user_bash`)

#### S13: session-name.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/session-name.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 1 command and uses `setSessionName`/`getSessionName`

#### S14: skill-manager.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/skill-manager.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 3 tools and subscribes to 3 events (`resources_discover`, `before_agent_start`, `session_shutdown`)

#### S15: token-meter.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/token-meter.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still subscribes to `agent_end`

#### S16: trust-enforcer.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/trust-enforcer.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still subscribes to `tool_call`

#### S17: web-search.ts uses local ExtensionAPI

**GIVEN** `reeboot/src/extensions/web-search.ts` is refactored  
**WHEN** it imports `ExtensionAPI`  
**THEN** the import is: `import type { ExtensionAPI } from './extension-api.js'`

**AND** the extension still registers 2 tools

#### S18: No extension imports from pi SDK

**GIVEN** all 17 extensions are refactored  
**WHEN** grep is run for pi imports in extensions  
**THEN** no extension file contains `from '@earendil-works/pi-coding-agent'`

**EXCEPT** `loader.ts` which still imports from pi:
- `DefaultResourceLoader` and `ResourceLoader` (pi-specific resource loading, not part of the extension API)
- `ExtensionFactory` as a **type-only** import (pi's `DefaultResourceLoader` expects pi's factory type at its boundary; this is loader/SDK interop, not extension coupling)
