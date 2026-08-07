# Capability: catalog boundary

## Scenarios

### SC-1 Internal skills are outside the user catalog
GIVEN the reeboot package ships both internal/harness skills and user-facing skills
WHEN the catalog is resolved
THEN the user catalog contains only user-facing extension skills
AND internal/harness skills are in a separate folder not returned by the user
catalog resolver

### SC-2 Internal skills cannot be managed by the user
GIVEN a skill marked internal (harness)
WHEN the user lists, toggles, uploads, or removes skills via the UI/API
THEN internal skills never appear in the list
AND the user can never enable, disable, upload-over, or delete an internal skill

### SC-3 The loose harness markdown files relocate to the internal folder
GIVEN `visual-charting.md` and `visual-planning.md` currently sit loose in the
bundled catalog
WHEN the catalog is restructured
THEN they are moved into the internal folder and are no longer part of the user
catalog
