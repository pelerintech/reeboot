# Capability: skills web UI

## Scenarios

### UI-1 Skills tab is present
GIVEN the web UI is loaded
WHEN the user looks at the navigation
THEN there is a Skills tab alongside chat/channels/logs/settings

### UI-2 List and toggle skills
GIVEN the Skills page is open
WHEN the user sees the list of user-facing skills
THEN each row shows name, description and source
AND a toggle reflects and changes the enabled state (via the API)

### UI-3 Upload a skill
GIVEN the Skills page is open
WHEN the user selects a zip to upload
THEN the file is sent to the upload endpoint
AND on success the new skill appears; on failure an error message shows the reason

### UI-4 Remove a user-uploaded skill
GIVEN a user-uploaded skill is listed
WHEN the user clicks remove
THEN the skill is deleted via the API and disappears from the list

### UI-5 Bundled skills cannot be removed
GIVEN a bundled skill is listed
WHEN the user inspects its actions
THEN there is no remove action (it can only be disabled)

### UI-6 Internal skills are never shown
GIVEN the Skills page is open
WHEN the user scans the list
THEN no internal/harness skills appear
