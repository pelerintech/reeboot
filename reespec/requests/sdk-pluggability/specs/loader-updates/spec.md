# Spec — Loader Updates

## Capability: Update Loader to Use Adapter

The loader (`reeboot/src/extensions/loader.ts`) is updated to create a `PiExtensionAdapter` and pass it to extensions instead of pi's `ExtensionAPI`.

### Scenarios

#### S1: Loader imports PiExtensionAdapter

**GIVEN** `loader.ts` is updated  
**WHEN** it imports `PiExtensionAdapter`  
**THEN** the import is: `import { PiExtensionAdapter } from './pi-adapter.js'`

#### S2: Loader creates adapter per session

**GIVEN** `loader.ts` creates extension factories  
**WHEN** a new session is created  
**THEN** a new `PiExtensionAdapter` instance is created with the pi session and context

**AND** the same adapter instance is passed to all extensions in that session

#### S3: Extensions receive adapter instead of pi

**GIVEN** the loader creates extension factories  
**WHEN** an extension factory is called  
**THEN** the first argument is the `PiExtensionAdapter` (implements `ExtensionAPI`)

**AND** the second argument is the `ExtensionContext` (workspacePath, config, db, scheduler)

#### S4: Existing extension signature preserved

**GIVEN** the loader is updated  
**WHEN** existing extension factories are called  
**THEN** the call signature is unchanged: `extensionFactory(adapter, context)`

**AND** extensions do not need to be modified to accept different arguments

#### S5: Adapter is created with correct context

**GIVEN** the loader has `context: ContextConfig` and `config: Config`  
**WHEN** `new PiExtensionAdapter(piSession, extensionContext)` is called  
**THEN** `extensionContext` includes:
- `workspacePath: context.workspacePath`
- `config: config`
- `db: getDb()` (if available)
- `scheduler: globalScheduler` (if available)

#### S6: Loader still imports pi for ResourceLoader

**GIVEN** `loader.ts` is updated  
**WHEN** it imports from pi  
**THEN** it still imports `DefaultResourceLoader` and `ResourceLoader` from `@earendil-works/pi-coding-agent`

**AND** these are used for resource loading (not part of the extension API refactoring)

#### S7: Backward compatibility

**GIVEN** the loader is updated  
**WHEN** existing tests run  
**THEN** tests that mock the loader still work (adapter is transparent to tests)

**AND** no test changes are required for basic loader functionality
