# Capability: runtime compatibility on zod 4

The agent runtime — including `@tanstack/ai` core's tool/schema layer now running on
zod 4, and the project's own `src/config.ts` zod usage — must behave as before.

## Scenario: config schema parses under zod 4

- **GIVEN** `src/config.ts` defines `ConfigSchema` with `z.object/.string/.enum/
  .number/.int/.boolean/.array/.default`
- **WHEN** `ConfigSchema.parse({})` (defaults) and a representative full config are
  parsed under the zod 4 tree
- **THEN** parsing succeeds and `defaultConfig` retains its shape
- **AND** an invalid config value is still rejected by `safeParse`

## Scenario: agent tool definitions convert under zod 4

- **GIVEN** a tool defined through `@tanstack/ai`'s `toolDefinition` / `z.tool`
  with a zod schema, and the ree agent loop runs on the zod 4 tree
- **WHEN** the loop streams a turn and invokes the tool
- **THEN** the tool schema is converted and emitted correctly, and the tool-call
  round-trips without error (no zod-3/4 API incompatibility in
  `tool-definition`/`schema-converter`)

## Scenario: no regressions in the existing ree suite

- **GIVEN** the existing ree runtime/agent-loop/config tests run under the zod 4 tree
- **THEN** they pass, confirming no behavioural regression from the version change
