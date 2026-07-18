# Spec — ExtensionAPI Interface

## Capability: Define ExtensionAPI Interface

The `ExtensionAPI` interface is defined in `reeboot/src/extensions/extension-api.ts`. It captures only what extensions actually use from the pi SDK.

### Scenarios

#### S1: Interface exports required types

**GIVEN** `reeboot/src/extensions/extension-api.ts` exists  
**WHEN** a module imports from it  
**THEN** the following types are exported:
- `ExtensionAPI`
- `ExtensionEventMap`
- `ExtensionHandler`
- `ToolDefinition`
- `ToolResult`
- `ExtensionContext`
- `ExtensionFactory`

**NOTE:** `ExtensionEvent` (a union of all event payloads) is intentionally NOT exported — no bundled extension uses it, and the interface captures only what extensions actually use. It can be added later if a future SDK or generic event handler needs it.

**AND** the file is non-empty (> 100 lines)

#### S2: ExtensionAPI has registerTool method

**GIVEN** `ExtensionAPI` interface is defined  
**WHEN** an extension calls `pi.registerTool(tool)`  
**THEN** the method signature is: `registerTool(tool: ToolDefinition): void`

**AND** `ToolDefinition` has these fields:
- `name: string`
- `label: string` (required — every tool needs a UI label; alternative SDKs always supply one)
- `description: string`
- `parameters: any` (JSON Schema)
- `execute: (toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: ((details: any) => void) | undefined, ctx: ExtensionContext) => Promise<ToolResult>` (5 params — `signal`-based cancellation and `onUpdate` streaming are required for multi-chat support where chat timeouts and customer disconnects must abort in-flight tools)
- `promptSnippet?: string`
- `promptGuidelines?: string[]` (optional)

#### S3: ExtensionAPI has on method with generic typing

**GIVEN** `ExtensionAPI` interface is defined  
**WHEN** an extension calls `pi.on(event, handler)`  
**THEN** the method signature is generic: `on<T extends keyof ExtensionEventMap>(event: T, handler: (event: ExtensionEventMap[T]) => void | Promise<void | ExtensionEventMap[T]>): () => void`

**AND** the return value is an unsubscribe function

#### S4: ExtensionAPI has optional session methods

**GIVEN** `ExtensionAPI` interface is defined  
**WHEN** an extension uses session naming  
**THEN** these optional methods are available:
- `setSessionName?(name: string): void`
- `getSessionName?(): string | undefined`

#### S5: ExtensionAPI has optional messaging method

**GIVEN** `ExtensionAPI` interface is defined  
**WHEN** an extension sends messages  
**THEN** this optional method is available:
- `sendMessage?(message: { customType: string; content?: unknown; display?: unknown; details?: unknown }, options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' }): void`

**NOTE:** the message/options shapes are inline anonymous types, not named `CustomMessage`/`SendMessageOptions` types — reeboot defines its own minimal shape so alternative SDKs are not forced to adopt pi's named types.

#### S6: ExtensionContext is provided

**GIVEN** `ExtensionAPI` interface is defined  
**WHEN** an extension accesses context  
**THEN** `api.context` is available with:
- `workspacePath: string`
- `config: any`
- `db?: any` (typed `any` intentionally — reeboot must NOT lock extensions to a specific database library like better-sqlite3, since alternative SDKs may use Postgres or other stores; a reeboot-owned minimal `ExtensionDB` interface is future work)
- `scheduler?: any` (same rationale — scheduler shape is SDK-specific; a minimal reeboot-owned interface is future work)
- `cwd: string`
- `ui: ExtensionUIContext` (select/confirm/input/notify — SDK provides from its host UI)
- `hasUI: boolean` (false in headless/RPC modes; extensions must degrade gracefully)
- `sessionManager?: any`
- `modelRegistry?: any`

#### S7: ExtensionFactory type is defined

**GIVEN** `ExtensionAPI` interface is defined  
**WHEN** the loader creates extensions  
**THEN** `ExtensionFactory` type is: `(api: ExtensionAPI) => void | Promise<void>` (single param — context is accessed via `api.context`, not passed as a second argument; this keeps the factory signature stable across SDKs and avoids coupling the loader call to a context shape that varies per SDK)
