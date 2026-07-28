# session_search in ree mode

## Capability

In ree mode, the `session_search` tool is available and scoped to the current chat's history.

## Scenarios

### S1: session_search is registered in ree mode

GIVEN a ree-mode deployment
WHEN the extension factories run (via `getReeFactories`)
THEN a tool named `session_search` is registered on the ree adapter

### S2: session_search queries chat_messages, not messages

GIVEN a ree chat with chatId "abc" that has 3 user messages and 3 assistant messages stored in `chat_messages`
WHEN the agent calls `session_search` with a query matching one of the messages
THEN the result contains that message AND does NOT include messages from other chats

### S3: session_search returns empty for chats with no matching messages

GIVEN a ree chat with no messages matching the query
WHEN the agent calls `session_search`
THEN the result is an empty array (not an error)

### S4: ExtensionAPI exposes getCurrentChatId

GIVEN a ree mode extension that calls `api.getCurrentChatId()`
WHEN invoked during a chat session
THEN it returns the current chat's ID string

GIVEN a pi mode extension that calls `api.getCurrentChatId()`
WHEN invoked
THEN it returns `undefined` or `null` (pi mode has no concept of per-chat identity in the ExtensionAPI)
