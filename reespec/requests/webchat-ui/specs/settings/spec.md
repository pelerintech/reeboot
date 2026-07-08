# Spec — Settings

## Capability

Budget limit configuration with real-time spend tracking and progress visualization.

## Scenarios

### GIVEN the user navigates to the Settings tab
**WHEN** the Settings panel loads
**THEN** the budget limits form is displayed with all input fields
**AND** the form is populated with current budget values from `GET /api/settings/budget`
**AND** fields with no limit show empty placeholders (e.g., "e.g. 10.00")
**AND** the daily spend progress bar is displayed if a daily cost limit is set
**AND** the spend summary text shows today's spend and remaining budget

### GIVEN the user is viewing the Settings tab
**WHEN** the budget data is loaded from the server
**THEN** the daily spend progress bar shows the percentage of daily limit used
**AND** the progress bar is colored based on percentage (blue if under threshold, red if over threshold)
**AND** the progress bar label shows "$X.XX / $Y.YY (Z%)"
**AND** the spend summary shows "Today: $X.XX spent (Y tokens) — $Z.ZZ of $W.WW remaining (P%)"
**AND** if no daily limit is set, the progress bar and summary are hidden

### GIVEN the user is viewing the Settings tab
**WHEN** the user edits the "Daily cost limit (USD)" field
**THEN** the input field accepts numeric values with 2 decimal places
**AND** the input field accepts values >= 0
**AND** the input field accepts empty values (to clear the limit)
**AND** the user can enter values like "10.00", "0.50", "100", or ""

### GIVEN the user is viewing the Settings tab
**WHEN** the user edits the "Daily token limit" field
**THEN** the input field accepts integer values
**AND** the input field accepts values >= 0
**AND** the input field accepts empty values (to clear the limit)
**AND** the user can enter values like "500000", "0", or ""

### GIVEN the user is viewing the Settings tab
**WHEN** the user edits any of the budget limit fields
**THEN** the form fields are:
- Daily cost limit (USD)
- Daily token limit
- Session cost limit (USD)
- Session token limit
- Per-turn cost limit (USD)
- Per-turn token limit
- Warn threshold (0.0 – 1.0)
**AND** each field has a label and placeholder
**AND** each field has appropriate validation (number, min, max for warn threshold)

### GIVEN the user has edited budget limits
**WHEN** the user clicks the "Save Budget Settings" button
**THEN** the form is submitted as a PUT request to `/api/settings/budget`
**AND** the request body includes only the fields that were edited (non-empty values)
**AND** empty fields are sent as `null` to clear limits
**AND** a success message is displayed for 3 seconds: "Budget settings saved"
**AND** the form data is reloaded from the server after successful save
**AND** the progress bar and summary are updated to reflect the new limits

### GIVEN the user has edited budget limits
**WHEN** the save request fails
**THEN** no success message is displayed
**AND** the form retains the user's edits (not reverted)
**AND** if the server returns an error, an error message is displayed: "⚠ Failed to save budget settings"

### GIVEN the user is viewing the Settings tab
**WHEN** the form is submitted with invalid values (e.g., negative numbers, warn threshold > 1.0)
**THEN** the form validation prevents submission
**AND** an error message is displayed for the invalid field
**AND** the save button is disabled until all fields are valid
**AND** the warn threshold field only accepts values between 0.0 and 1.0

### GIVEN the user navigates away from the Settings tab
**WHEN** the user switches to another tab
**THEN** the Settings panel is hidden
**AND** the budget data is not reloaded (cached in memory)
**AND** when the user returns to the Settings tab, the form retains the last edited values
**AND** if the user clicks "Save" after switching tabs, the edited values are saved

### GIVEN the user is viewing the Settings tab
**WHEN** the server returns an error loading budget data
**THEN** an error message is displayed: "Unable to load budget data"
**AND** the form fields are empty (not populated)
**AND** a retry button is shown to re-fetch the budget data
**AND** the user can retry without navigating away from the Settings tab

### GIVEN the user is viewing the Settings tab
**WHEN** the daily spend exceeds the warn threshold (e.g., 80%)
**THEN** the progress bar color changes to red (warning color)
**AND** the progress bar label shows the percentage
**AND** the spend summary shows the percentage of budget used
**AND** the user is visually alerted that they are approaching their limit

### GIVEN the user is viewing the Settings tab
**WHEN** the daily spend exceeds the daily cost limit (100%)
**THEN** the progress bar color changes to red (error color)
**AND** the progress bar value is capped at 100%
**AND** the spend summary shows "$0.00 remaining"
**AND** the user is visually alerted that they have exceeded their limit
