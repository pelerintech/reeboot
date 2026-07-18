# Spec — conversation-id-validation

A validation helper accepts safe conversation ids and rejects malformed or reserved ones.

## S1 — accepts a valid id
- **GIVEN** `cust-42`, `abc.def:1`, a 128-char alphanumeric id
- **WHEN** validated
- **THEN** each is accepted.

## S2 — rejects malformed ids
- **GIVEN** an empty string, a 129-char id, or an id with spaces/`/`/`..`
- **WHEN** validated
- **THEN** each is rejected.

## S3 — rejects reserved ids
- **GIVEN** `main`, `__system__`, `scheduler`, `__outage_probe__`
- **WHEN** validated
- **THEN** each is rejected (cannot collide with internal contexts).
