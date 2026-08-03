#!/usr/bin/env bash
# verify-ci.sh — reproduce the CI `test` job locally before pushing.
#
# Runs the exact sequence the CI `test` job runs (see .github/workflows/ci.yml):
#   npm ci  →  npm run build  →  npm run test:coverage  (enforces the 80/80/80/72 gate)
#
# The intent: never push a commit that fails CI on something that was locally
# checkable. Run this from a clean checkout state before pushing.
#
# Usage:
#   ./scripts/verify-ci.sh                    # locates reeboot/ from the script path
#   REBOOT_VERIFY_CACHE=/path ./verify-ci.sh  # override the npm cache dir
#
# npm version parity: CI bundles the npm that ships with Node 22 (npm ~10); your
# local npm may differ (e.g. 11). Both resolve identically on the v3 lockfile.
# A fresh cache directory is used so the resolution result (not a stale cache)
# is what actually gets verified. Node version is unchanged (>=22; zod 4 needs
# no newer Node).
#
# CI-only, NOT replicated here: the Codecov upload step. It needs a secret token,
# runs only after tests pass, and gating on it is about upload success, not code
# correctness.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CACHE="${REBOOT_VERIFY_CACHE:-$ROOT/node_modules/.verify-cache}"
# A writeable temp dir for native module builds (node-gyp / xcrun caches). Some
# restricted environments (CI sandboxes, strict TMPDIR policies) block the system
# tmp dir; an explicit writeable dir keeps `npm ci` reproducible.
TMP="${REBOOT_VERIFY_TMPDIR:-$ROOT/node_modules/.verify-tmp}"
mkdir -p "$CACHE" "$TMP"
export TMPDIR="$TMP"
echo "→ working dir: $ROOT"
echo "→ npm cache:   $CACHE   (override via REBOOT_VERIFY_CACHE)"
echo "→ tmpdir:      $TMPDIR  (override via REBOOT_VERIFY_TMPDIR)"

step() { echo; echo "── $* ──"; }

step "npm ci (fresh install, strict peer resolution)"
npm ci --cache "$CACHE"

step "npm run build (tsc)"
npm run build

step "npm run test:coverage (enforces the 80/80/80/72 gate)"
npm run test:coverage

echo
echo "✓ verify-ci: all CI-replicated steps passed. Safe to push."
