# Delegate tool — same-process sub-agent delegation

## Capability: agent delegates sub-task to a same-process sub-agent

### Scenario: delegate tool returns sub-agent result
**GIVEN** a delegate tool is registered via `ExtensionAPI.registerTool()`  
**WHEN** the main agent calls `delegate({ task: "Summarize: hello world" })`  
**THEN** a new AgentRunner session is created  
**AND** the task is injected as the user message  
**AND** the sub-agent runs to completion  
**AND** the result is returned as structured text  
**AND** the main agent receives the result

### Scenario: delegate tool works on pi runtime
**GIVEN** the SDK mode is `pi`  
**WHEN** the delegate tool creates a sub-agent  
**THEN** the sub-agent uses `PiAgentRunner`  
**AND** the result is returned successfully

### Scenario: delegate tool works on ree runtime
**GIVEN** the SDK mode is `ree`  
**WHEN** the delegate tool creates a sub-agent  
**THEN** the sub-agent uses the ree runner  
**AND** the result is returned successfully

### Scenario: sub-agent inherits main agent's model
**GIVEN** the main agent uses provider `anthropic` and model `claude-sonnet-4-5`  
**WHEN** a sub-agent is created via the delegate tool  
**THEN** the sub-agent uses the same provider and model  
**AND** the sub-agent does not have a separate model configuration

### Scenario: sub-agent has access to main agent's tool set
**GIVEN** the main agent has tools [memory, knowledge_search, schedule_task]  
**WHEN** a sub-agent is created via the delegate tool  
**THEN** the sub-agent can call the same tools

### Scenario: sub-agent timeout aborts long-running task
**GIVEN** a sub-agent is created with an empty task  
**WHEN** the sub-agent runs for longer than the configured timeout (default 60s)  
**THEN** the sub-agent is aborted  
**AND** the delegate tool returns a timeout error  
**AND** the main agent receives the error

### Scenario: delegate tool returns view-compatible result
**GIVEN** the delegate tool is created  
**WHEN** the sub-agent returns a structured result  
**THEN** the result is compatible with the structured tool views system (request `structured-tool-views`)  
**AND** the WebChat can render it as a rich component
