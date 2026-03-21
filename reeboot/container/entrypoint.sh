#!/bin/sh
# reeboot container entrypoint
# Starts the agent in non-interactive mode (no TTY in container).
# Binds to 0.0.0.0 so the port is reachable from outside the container.
set -e

export REEBOOT_HOST="${REEBOOT_HOST:-0.0.0.0}"
exec node dist/index.js start --no-interactive "$@"
