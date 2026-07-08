# Spec — Navigation

## Capability

Tab/panel navigation with left sidebar, collapsing on mobile.

## Scenarios

### GIVEN the user opens the webchat
**WHEN** the page loads
**THEN** the navigation bar shows tabs: Chat (active), Channels, Logs, Settings
**AND** the Chat panel is displayed as the default view
**AND** the navigation bar is at the top of the page with a horizontal layout
**AND** the active tab is highlighted with the accent color (#4f9cf9)

### GIVEN the user clicks on the Channels tab
**WHEN** the Channels tab button is clicked
**THEN** the Channels panel is displayed
**AND** the Chat panel is hidden
**AND** the Channels tab is now active (highlighted)
**AND** the Chat tab is no longer active

### GIVEN the user clicks on the Logs tab
**WHEN** the Logs tab button is clicked
**THEN** the Logs panel is displayed with live log stream
**AND** the Logs panel is hidden when another tab is active
**AND** the Logs tab is highlighted as active
**AND** the user can filter logs by level (debug, info, warn, error, fatal)

### GIVEN the user clicks on the Settings tab
**WHEN** the Settings tab button is clicked
**THEN** the Settings panel is displayed
**AND** the budget limits form is shown with current values
**AND** the daily spend progress bar is displayed
**AND** the user can edit and save budget limits

### GIVEN the user resizes the browser window to mobile width (<768px)
**WHEN** the viewport width decreases below the mobile breakpoint
**THEN** the navigation bar transforms into a bottom tab bar
**AND** the navigation tabs are displayed horizontally at the bottom of the screen
**AND** the content area expands to fill the remaining screen space
**AND** the navigation bar remains accessible and tappable

### GIVEN the user is on a mobile device
**WHEN** the user switches between tabs
**THEN** the tab switch is smooth and responsive
**AND** the bottom tab bar is large enough for comfortable tapping (min 44px height)
**AND** the active tab indicator is clearly visible
**AND** the content area adapts to the smaller viewport

### GIVEN the user navigates to a tab
**WHEN** the tab content is loaded
**THEN** the tab content area displays the appropriate panel
**AND** any async data loading shows a loading state
**AND** errors are displayed with retry options
**AND** the tab remains active until the user switches

### GIVEN the user is on a desktop viewport (>768px)
**WHEN** the user switches tabs
**THEN** the navigation bar remains at the top
**AND** the content area is centered with max-width for readability
**AND** the tab transitions are smooth (fade or slide)
