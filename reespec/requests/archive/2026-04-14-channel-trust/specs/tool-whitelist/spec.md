# Spec: Tool Whitelist

---

## Capability: Owner trust bypasses whitelist

**GIVEN** a context with `tools.whitelist = ['send_message']`  
**AND** a prompt called with `trust: 'owner'`  
**WHEN** the agent calls any tool (including one not in the whitelist)  
**THEN** the tool call is not blocked

---

## Capability: End-user trust blocks tools not in whitelist

**GIVEN** a context with `tools.whitelist = ['send_message']`  
**AND** a prompt called with `trust: 'end-user'`  
**WHEN** the agent attempts to call `bash`  
**THEN** the tool call is blocked with reason `Tool "bash" is not available in this context`

---

## Capability: End-user trust allows whitelisted tools

**GIVEN** a context with `tools.whitelist = ['send_message', 'web_search']`  
**AND** a prompt called with `trust: 'end-user'`  
**WHEN** the agent calls `web_search`  
**THEN** the tool call proceeds normally

---

## Capability: Empty whitelist means no restriction for end-user

**GIVEN** a context with `tools.whitelist = []` (empty)  
**AND** a prompt called with `trust: 'end-user'`  
**WHEN** the agent calls any tool  
**THEN** the tool call is not blocked

---

## Capability: Missing context config means no restriction

**GIVEN** no `contexts` entry in config matching the current context  
**AND** a prompt called with `trust: 'end-user'`  
**WHEN** the agent calls any tool  
**THEN** the tool call is not blocked
