# Spec: authMode in config

## SC-1: authMode field exists in config schema

GIVEN the config schema in `src/config.ts`
WHEN the schema is parsed
THEN `agent.model.authMode` exists as `z.enum(["pi", "own"]).default("own")`

## SC-2: authMode="own" preserves provider/model/apiKey

GIVEN a config.json with `authMode: "own"`, `provider: "anthropic"`, `id: "claude-sonnet-4-5"`, `apiKey: "sk-test"`
WHEN `loadConfig()` parses it
THEN all four fields are returned with correct values

## SC-3: authMode="pi" sets provider/model/apiKey to empty

GIVEN a config.json with `authMode: "pi"` and no provider/model/apiKey
WHEN `loadConfig()` parses it
THEN authMode is "pi" and provider/model/apiKey default to ""

## SC-4: existing configs without authMode default to "own"

GIVEN a config.json that has no `authMode` field (legacy install)
WHEN `loadConfig()` parses it
THEN authMode defaults to "own"
