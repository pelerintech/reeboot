#!/bin/sh
# reeboot container entrypoint
#
# Behaviour:
#   1. If REEBOOT_AGENTS_MD is set, write it to ~/.reeboot/agent/AGENTS.md
#      (persona injection — done before start so pi picks it up as agentDir context)
#   2. If ~/.reeboot/config.json exists (volume-mounted from host setup), start directly.
#   3. If no config.json, print error and exit — config file is the single source of truth.
#
# The config file is the only supported configuration mechanism for containers.
# Create a config.json and mount it via:
#   docker run -v /path/to/config-dir:/home/reeboot/.reeboot ...
# Or use docker-compose with a bind mount (see docker-compose.yml).
#
# Supported env vars:
#   REEBOOT_AGENTS_MD   → written to ~/.reeboot/agent/AGENTS.md (persona injection)
#   REEBOOT_HOST        → bind address (default 0.0.0.0)
#
# Knowledge / embedding cache:
#   HF_CACHE_DIR        → override path for the HuggingFace ONNX model cache
#                         (default: ~/.reeboot/hf-cache/ — inside the volume mount,
#                         so models persist across container restarts)
#                         Set to a separate host path or named volume when sharing
#                         the model cache across multiple reeboot containers.

set -e

export REEBOOT_HOST="${REEBOOT_HOST:-0.0.0.0}"
export PI_CACHE_RETENTION=long
CONFIG_FILE="${HOME}/.reeboot/config.json"

# ── Step 1: persona injection (always, before start) ─────────────────────────
if [ -n "${REEBOOT_AGENTS_MD}" ]; then
  mkdir -p "${HOME}/.reeboot/agent"
  printf '%s' "${REEBOOT_AGENTS_MD}" > "${HOME}/.reeboot/agent/AGENTS.md"
fi

# ── Step 2: if config exists, start directly ─────────────────────────────────
if [ -f "${CONFIG_FILE}" ]; then
  exec node dist/index.js start --no-interactive "$@"
fi

# ── Step 3: no config — print error and exit ────────────────────────────────
echo "Error: No config.json found at ${CONFIG_FILE}"
echo ""
echo "To deploy reeboot:"
echo "  1. Create a config file at ${CONFIG_FILE} with your settings"
echo "  2. Or mount your config directory: docker run -v /path/to/config:${HOME}/.reeboot ..."
echo "  3. Or run 'reeboot init' interactively on a native install"
exit 1
