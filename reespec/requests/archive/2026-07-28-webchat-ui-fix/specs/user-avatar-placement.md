# User avatar placement

## L1: User avatar is rendered on the right

**GIVEN** a Chat component with a user message in the messages array
**WHEN** the component renders
**THEN** the user avatar (blue circle with person icon) appears to the RIGHT of the user message content in DOM order

## L2: Assistant avatar stays on the left

**GIVEN** a Chat component with an assistant message in the messages array
**WHEN** the component renders
**THEN** the assistant avatar (dark circle with diamond icon) appears to the LEFT of the assistant message content in DOM order

## L3: User message content is left-aligned

**GIVEN** a Chat component rendering a user message
**WHEN** the message content renders
**THEN** the text container uses `text-left` alignment (not `text-right` as before)

## L4: Error messages have no avatar

**GIVEN** a Chat component with an error message
**WHEN** the component renders
**THEN** no avatar is shown for the error message (error row shows centered error badge only)
