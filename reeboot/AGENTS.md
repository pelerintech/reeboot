# Reeboot — Developer Instructions

## Integration tests

After any major implementation (new SDK adapter, agent loop change, extension refactoring, Docker build change), validate the full system:

```bash
cd reeboot/tests/docker-integration
./run-pi.sh    # tests pi SDK in Docker (14 tests)
./run-ree.sh   # tests ree SDK in Docker (16 tests)
```

Both scripts build the Docker image, start a container with the target SDK config, run integration tests against the live container, and tear down. They require Docker and a reachable local LLM model.

Each script exits 0 on success, 1 on any test failure. Container logs are always printed for debugging.

## What the tests verify

- **Docker build** — the image builds cleanly from source
- **Container startup** — the server starts, config is loaded, health endpoint responds
- **REST API** — health, status, channels, contexts, tasks, budget, reload, logs stream
- **WebSocket chat** — connection, text turns, tool calls (bash, read), multi-turn conversation, abort
- **SDK-specific features** — pi: sessions, extensions; ree: concurrent chats, chat isolation

## Requirements

- Docker installed and running
- Local LLM model reachable at `http://100.107.230.26:3000/v1` (configured in `config-*.json`)
- No API keys needed — tests use the local model
