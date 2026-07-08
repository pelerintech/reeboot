# Spec — AGENTS.md developer instructions

## Capability

A developer-facing `AGENTS.md` at the reeboot root instructs future agents (and humans) to run the Docker integration tests after major implementations.

## Scenarios

### S1: AGENTS.md exists at reeboot/AGENTS.md
- **GIVEN** the reeboot repository
- **THEN** `reeboot/AGENTS.md` exists
- **AND** the file is non-empty (> 100 characters)

### S2: AGENTS.md documents the integration test scripts
- **GIVEN** `reeboot/AGENTS.md` exists
- **THEN** the file references `run-pi.sh`
- **AND** the file references `run-ree.sh`
- **AND** the file includes the command to run each script

### S3: AGENTS.md instructs when to run tests
- **GIVEN** `reeboot/AGENTS.md` exists
- **THEN** the file states that tests should be run after major implementations
- **AND** the file explains what "major implementation" means (SDK adapter, agent loop, extension refactoring, Docker build)
