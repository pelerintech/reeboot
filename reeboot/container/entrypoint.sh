#!/bin/sh
# reeboot container entrypoint
#
# Behaviour:
#   1. If REEBOOT_AGENTS_MD is set, write it to ~/.reeboot/agent/AGENTS.md
#      (persona injection — done before start so pi picks it up as agentDir context)
#   2. If REEBOOT_API_TOKEN is set, inject it into the config file's server.token
#   3. If ~/.reeboot/config.json exists (volume-mounted from host setup), start directly.
#   4. If no config.json but env vars are set, generate a minimal config from env vars.
#   5. If no config.json and no env vars, print error and exit.
#
# Create a config.json and mount it via:
#   docker run -v /path/to/config-dir:/home/reeboot/.reeboot ...
# Or use docker-compose with a bind mount (see docker-compose.yml).
#
# Supported env vars:
#   REEBOOT_AGENTS_MD   → written to ~/.reeboot/agent/AGENTS.md (persona injection)
#   REEBOOT_API_TOKEN   → injected into config.json server.token (API auth)
#   REEBOOT_HOST        → bind address (default 0.0.0.0)
#   REEBOOT_AUTH_MODE   → authentication mode (default: token)
#
# Knowledge / embedding cache:
#   HF_CACHE_DIR        → override path for the HuggingFace ONNX model cache
#                         (default: ~/.reeboot/hf-cache/ — inside the volume mount,
#                         so models persist across container restarts)
#                         Set to a separate host path or named volume when sharing
#                         the model cache across multiple reeboot containers.

set -e

REEBOOT_HOST="${REEBOOT_HOST:-0.0.0.0}"
export REEBOOT_HOST
export PI_CACHE_RETENTION=long
CONFIG_FILE="${HOME}/.reeboot/config.json"
REBOOT_DIR="${HOME}/.reeboot"

# ── Step 1: persona injection (always, before start) ─────────────────────────
if [ -n "${REEBOOT_AGENTS_MD}" ]; then
  mkdir -p "${HOME}/.reeboot/agent"
  printf '%s' "${REEBOOT_AGENTS_MD}" > "${HOME}/.reeboot/agent/AGENTS.md"
fi

# ── Step 2: inject REEBOOT_API_TOKEN into config if set ──────────────────────
if [ -f "${CONFIG_FILE}" ] && [ -n "${REEBOOT_API_TOKEN}" ]; then
  # Use Node.js to inject the token into the config file's server.token field
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf-8'));
    cfg.server = cfg.server || {};
    cfg.server.token = cfg.server.token || process.env.REEBOOT_API_TOKEN;
    fs.writeFileSync('${CONFIG_FILE}', JSON.stringify(cfg, null, 2));
  " 2>/dev/null || true
fi

# ── Step 3: if config exists, start directly ─────────────────────────────────
if [ -f "${CONFIG_FILE}" ]; then
  exec node dist/index.js start --no-interactive "$@"
fi

# ── Step 4: no config — try env vars ─────────────────────────────────────────
if [ -n "${REEBOOT_API_TOKEN}" ] || [ -n "${REEBOOT_AUTH_MODE}" ]; then
  echo "No config.json found — generating minimal config from environment variables..."
  mkdir -p "${REBOOT_DIR}"
  cat > "${CONFIG_FILE}" << CONFIG_EOF
{
  "sdk": "ree",
  "ree": {
    "maxChats": 200,
    "idleTtlMs": 1800000,
    "maxHistoryPerChat": 50
  },
  "channels": {
    "web": {
      "enabled": true,
      "port": 3000
    },
    "whatsapp": {
      "enabled": false
    },
    "signal": {
      "enabled": false
    }
  },
  "server": {
    "token": "${REEBOOT_API_TOKEN}"
  },
  "knowledge": {
    "enabled": true
  }
}
CONFIG_EOF
  echo "Minimal config generated at ${CONFIG_FILE}"
  exec node dist/index.js start --no-interactive "$@"
fi

# ── Step 5: no config and no env vars — print error and exit ─────────────────
echo "Error: No config.json found at ${CONFIG_FILE}"
echo ""
echo "To deploy reeboot:"
echo "  1. Create a config file at ${CONFIG_FILE} with your settings"
echo "  2. Provide REEBOOT_API_TOKEN env var to auto-generate a minimal config"
echo "  3. Mount your config directory: docker run -v /path/to/config:${HOME}/.reeboot ..."
echo "  4. Or run 'reeboot init' interactively on a native install"
exit 1
