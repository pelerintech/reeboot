# A2A protocol — cross-process agent communication

## Capability: A2A peer discovery

### Scenario: A2A discovery endpoint returns capabilities
**GIVEN** reeboot is running with A2A enabled  
**WHEN** an HTTP GET request is sent to `/a2a/capabilities`  
**THEN** the response is a JSON object with `name`, `version`, and `tools` array  
**AND** the response status is 200

## Capability: A2A task invocation

### Scenario: A2A invoke endpoint executes task
**GIVEN** a remote A2A peer is configured in `config.json`  
**WHEN** the agent calls `delegate({ task: "Research X", peer: "research-agent" })`  
**AND** the peer URL is `http://localhost:3001`  
**THEN** an HTTP POST is sent to `http://localhost:3001/a2a/invoke` with the task  
**AND** the peer returns a result  
**AND** the result is returned to the calling agent

### Scenario: A2A invoke returns structured result
**GIVEN** a remote A2A peer returns structured data  
**WHEN** the response is received  
**THEN** the result is compatible with structured tool views (request `structured-tool-views`)  
**AND** the WebChat can render it as a rich component

### Scenario: A2A peer authentication
**GIVEN** a remote A2A peer is configured with an API key  
**WHEN** a request is sent to the peer  
**THEN** the request includes the API key in the `Authorization` header  
**AND** the peer validates the key before executing

### Scenario: A2A invoke with unknown peer returns error
**GIVEN** no A2A peer is configured with name `unknown-agent`  
**WHEN** the agent calls `delegate({ task: "X", peer: "unknown-agent" })`  
**THEN** the delegate tool returns an error: "Unknown A2A peer: unknown-agent"

## Capability: A2A server handles incoming requests

### Scenario: reeboot receives A2A invoke request
**GIVEN** reeboot is running with A2A server enabled  
**WHEN** a POST request is received at `/a2a/invoke` with a valid task payload  
**THEN** the task is executed in a sub-agent session  
**AND** a 200 response is returned with the result

### Scenario: reeboot A2A server rejects unauthenticated request
**GIVEN** reeboot is running with A2A server enabled and an API key configured  
**WHEN** a POST request is received at `/a2a/invoke` without the API key  
**THEN** a 401 response is returned
