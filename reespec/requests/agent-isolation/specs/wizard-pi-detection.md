# Spec: wizard pi detection

## WP-1: detectPiAuth returns available when auth.json has providers

GIVEN ~/.pi/agent/auth.json exists with at least one provider entry
AND ~/.pi/agent/settings.json exists with defaultProvider and defaultModel
WHEN `detectPiAuth()` is called
THEN returns `{ available: true, provider, model }`

## WP-2: detectPiAuth returns unavailable when auth.json missing

GIVEN ~/.pi/agent/auth.json does not exist
WHEN `detectPiAuth()` is called
THEN returns `{ available: false }`

## WP-3: detectPiAuth returns unavailable when auth.json is empty

GIVEN ~/.pi/agent/auth.json exists but has no provider entries (`{}`)
WHEN `detectPiAuth()` is called
THEN returns `{ available: false }`

## WP-4: wizard offers pi choice when pi auth detected

GIVEN detectPiAuth returns available
WHEN runProviderStep() runs
THEN the first prompt offers exactly two choices:
  "Use existing pi's provider, model and auth"
  "Set up separate credentials for reeboot"

## WP-5: choosing pi auth skips provider/model/key prompts

GIVEN detectPiAuth returns available
AND user selects "Use existing pi's provider, model and auth"
WHEN runProviderStep() completes
THEN returns `{ authMode: "pi", provider: "", modelId: "", apiKey: "" }`
AND no provider selection prompt was shown
AND no model selection prompt was shown
AND no API key prompt was shown

## WP-6: choosing separate credentials runs existing flow

GIVEN detectPiAuth returns available
AND user selects "Set up separate credentials for reeboot"
WHEN runProviderStep() runs
THEN provider selection prompt is shown
AND model selection prompt is shown
AND API key prompt is shown
AND returns `{ authMode: "own", provider, modelId, apiKey }`

## WP-7: no pi detected goes straight to existing flow

GIVEN detectPiAuth returns unavailable
WHEN runProviderStep() runs
THEN no pi choice prompt is shown
AND provider selection prompt is shown immediately
AND returns `{ authMode: "own", provider, modelId, apiKey }`
