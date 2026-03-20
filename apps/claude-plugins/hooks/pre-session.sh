#!/usr/bin/env bash
# pre-session.sh — Runs at session start
# Loads CLAUDE.md context, checks for .tandem-config, and sets up telemetry.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "${SCRIPT_DIR}")"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"

echo "=== Tandem Pre-Session Setup ==="

# 1. Load CLAUDE.md into context
CLAUDE_MD="${PLUGIN_DIR}/CLAUDE.md"
if [ -f "${CLAUDE_MD}" ]; then
  echo "[OK] CLAUDE.md found at ${CLAUDE_MD}"
else
  echo "[WARN] CLAUDE.md not found at ${CLAUDE_MD}"
fi

# 2. Check for .tandem-config in the repo root
if [ -n "${REPO_ROOT}" ]; then
  TANDEM_CONFIG="${REPO_ROOT}/.tandem-config"
  if [ -f "${TANDEM_CONFIG}" ]; then
    echo "[OK] .tandem-config found at ${TANDEM_CONFIG}"

    # Source any environment overrides from config
    if command -v jq >/dev/null 2>&1; then
      TELEMETRY_ENABLED=$(jq -r '.telemetry.enabled // "true"' "${TANDEM_CONFIG}" 2>/dev/null || echo "true")
      TELEMETRY_ENDPOINT=$(jq -r '.telemetry.endpoint // ""' "${TANDEM_CONFIG}" 2>/dev/null || echo "")
      ORG_ID=$(jq -r '.organization.id // ""' "${TANDEM_CONFIG}" 2>/dev/null || echo "")
    else
      echo "[WARN] jq not installed — skipping config parsing"
      TELEMETRY_ENABLED="true"
      TELEMETRY_ENDPOINT=""
      ORG_ID=""
    fi
  else
    echo "[INFO] No .tandem-config found in repo root"
    TELEMETRY_ENABLED="true"
    TELEMETRY_ENDPOINT=""
    ORG_ID=""
  fi
else
  echo "[WARN] Not inside a git repository"
  TELEMETRY_ENABLED="true"
  TELEMETRY_ENDPOINT=""
  ORG_ID=""
fi

# 3. Set up environment variables for telemetry
export TANDEM_TELEMETRY_ENABLED="${TELEMETRY_ENABLED}"
export TANDEM_TELEMETRY_ENDPOINT="${TELEMETRY_ENDPOINT:-https://telemetry.tandem.dev:4317}"
export TANDEM_ORG_ID="${ORG_ID}"
export TANDEM_SESSION_ID="${TANDEM_SESSION_ID:-$(uuidgen 2>/dev/null || date +%s)}"
export TANDEM_SESSION_START="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo ""
echo "Session environment:"
echo "  TANDEM_TELEMETRY_ENABLED=${TANDEM_TELEMETRY_ENABLED}"
echo "  TANDEM_TELEMETRY_ENDPOINT=${TANDEM_TELEMETRY_ENDPOINT}"
echo "  TANDEM_ORG_ID=${TANDEM_ORG_ID}"
echo "  TANDEM_SESSION_ID=${TANDEM_SESSION_ID}"
echo "  TANDEM_SESSION_START=${TANDEM_SESSION_START}"

echo ""
echo "=== Pre-Session Setup Complete ==="
