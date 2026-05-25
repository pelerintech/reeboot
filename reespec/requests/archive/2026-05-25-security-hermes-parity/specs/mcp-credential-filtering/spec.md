# Spec — mcp-credential-filtering

MCP subprocesses receive a filtered environment. Credential patterns in MCP error messages are redacted before being returned to the LLM.

## Scenarios

### 1. Passes only safe env vars to MCP subprocesses

**GIVEN** the host environment has `OPENAI_API_KEY=sk-abc123` and `GITHUB_TOKEN=ghp_xyz789`
**WHEN** an MCP server is spawned
**THEN** the subprocess environment does NOT contain `OPENAI_API_KEY` or `GITHUB_TOKEN`
**AND** the subprocess environment DOES contain `PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `SHELL`, `TMPDIR`

### 2. Passes explicitly configured env vars

**GIVEN** the MCP server config has `env: { GITHUB_TOKEN: "ghp_configured" }`
**WHEN** the MCP server is spawned
**THEN** `GITHUB_TOKEN` is present in the subprocess environment with value `"ghp_configured"`

### 3. Passes XDG variables

**GIVEN** the host has `XDG_CONFIG_HOME=/home/user/.config`
**WHEN** an MCP server is spawned
**THEN** `XDG_CONFIG_HOME` is present in the subprocess environment

### 4. Redacts GitHub PAT in error messages

**GIVEN** an MCP tool call fails with error "Authentication failed: ghp_abc123def456ghi789jkl012mno345pqr678stu"
**WHEN** the error is returned to the LLM
**THEN** the error message shows "Authentication failed: [REDACTED-GITHUB-TOKEN]"

### 5. Redacts OpenAI key in error messages

**GIVEN** an MCP tool call fails with error "Invalid key: sk-proj-abc123xyz..."
**WHEN** the error is returned to the LLM
**THEN** the key is replaced with `[REDACTED-OPENAI-KEY]`

### 6. Redacts Bearer tokens

**GIVEN** an MCP error contains "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
**WHEN** the error is returned to the LLM
**THEN** the token is replaced with `Bearer [REDACTED]`

### 7. Redacts key=value credentials

**GIVEN** an MCP error contains "connection failed: api_key=sk-live-12345&region=us"
**WHEN** the error is returned to the LLM
**THEN** the value after `api_key=` is replaced with `[REDACTED]`

### 8. Does not redact safe text

**GIVEN** an MCP tool returns "File not found: /tmp/missing.txt"
**WHEN** the result is returned to the LLM
**THEN** the text is unchanged (no credential patterns present)