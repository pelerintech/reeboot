#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REEBOOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
IMAGE_TAG="reeboot:integration"
CONTAINER_NAME="reeboot-integration-pi"
CONFIG_FILE="$SCRIPT_DIR/config-pi.json"
TEST_FILE="$SCRIPT_DIR/test-pi.mjs"
BASE_URL="http://localhost:3000"

cleanup() {
  echo "=== Cleaning up ==="
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Building Docker image ==="
docker build -f "$REEBOOT_DIR/container/Dockerfile" "$REEBOOT_DIR" -t "$IMAGE_TAG"

echo "=== Starting container ==="
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 3000:3000 \
  -v "$CONFIG_FILE:/home/reeboot/.reeboot/config.json" \
  -e REEBOOT_HOST=0.0.0.0 \
  "$IMAGE_TAG"

echo "=== Waiting for health ==="
cd "$SCRIPT_DIR"
node -e "
import('./helpers.mjs').then(m => m.waitForHealth('$BASE_URL', 60000)).then(() => {
  console.log('Container is healthy');
  process.exit(0);
}).catch(err => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});
"

echo "=== Running tests ==="
node "$TEST_FILE"
RESULT=$?

echo "=== Container logs (last 50 lines) ==="
docker logs "$CONTAINER_NAME" 2>&1 | tail -50

exit $RESULT
