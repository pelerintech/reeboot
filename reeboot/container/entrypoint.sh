#!/bin/sh
# reeboot container entrypoint
#
# Behaviour:
#   1. If REEBOOT_AGENTS_MD is set, write it to ~/.reeboot/agent/AGENTS.md
#      (persona injection — done before start so pi picks it up as agentDir context)
#   2. If ~/.reeboot/config.json already exists (volume-mounted from host setup),
#      skip env var translation and start directly.
#   3. Otherwise, translate REEBOOT_* env vars into --no-interactive flags
#      and generate config.json on first boot.
#
# Supported env vars:
#   REEBOOT_PROVIDER    → --provider
#   REEBOOT_API_KEY     → --api-key
#   REEBOOT_MODEL       → --model
#   REEBOOT_NAME        → --name
#   REEBOOT_AUTH_MODE   → --auth-mode  ("pi" | "own", default "own")
#   REEBOOT_AGENTS_MD   → written to ~/.reeboot/agent/AGENTS.md
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

# ── Step 3: no config — translate env vars and generate config on first boot ──
FLAGS=""

if [ -n "${REEBOOT_PROVIDER}" ]; then
  FLAGS="${FLAGS} --provider ${REEBOOT_PROVIDER}"
fi

if [ -n "${REEBOOT_API_KEY}" ]; then
  FLAGS="${FLAGS} --api-key ${REEBOOT_API_KEY}"
fi

if [ -n "${REEBOOT_MODEL}" ]; then
  FLAGS="${FLAGS} --model ${REEBOOT_MODEL}"
fi

if [ -n "${REEBOOT_NAME}" ]; then
  FLAGS="${FLAGS} --name ${REEBOOT_NAME}"
fi

if [ -n "${REEBOOT_AUTH_MODE}" ]; then
  FLAGS="${FLAGS} --auth-mode ${REEBOOT_AUTH_MODE}"
fi

exec node dist/index.js start --no-interactive ${FLAGS} "$@"
