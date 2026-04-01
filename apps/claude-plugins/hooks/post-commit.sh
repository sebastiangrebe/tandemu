#!/usr/bin/env bash
# post-commit.sh — Runs after commits
# Validates commit message format (conventional commits) and tags with telemetry metadata.

set -euo pipefail

# Get the latest commit message
COMMIT_MSG=$(git log -1 --format="%s" 2>/dev/null || echo "")
COMMIT_HASH=$(git log -1 --format="%H" 2>/dev/null || echo "")
COMMIT_SHORT=$(git log -1 --format="%h" 2>/dev/null || echo "")

if [ -z "${COMMIT_MSG}" ]; then
  echo "[ERROR] Could not read the latest commit message."
  exit 1
fi

echo "=== Tandemu Post-Commit Hook ==="
echo "Commit: ${COMMIT_SHORT}"
echo "Message: ${COMMIT_MSG}"
echo ""

# 1. Validate conventional commit format
# Pattern: type(optional-scope): description
CONVENTIONAL_PATTERN="^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\(.+\))?: .+"

if echo "${COMMIT_MSG}" | grep -qE "${CONVENTIONAL_PATTERN}"; then
  echo "[OK] Commit message follows conventional commit format."
else
  echo "[WARN] Commit message does not follow conventional commit format."
  echo "  Expected: <type>[optional scope]: <description>"
  echo "  Types: feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert"
  echo "  Example: feat(auth): add login with OAuth2"
fi

# 2. Tag the commit with telemetry metadata via git notes
SESSION_ID="${TANDEMU_SESSION_ID:-unknown}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

TELEMETRY_NOTE="tandemu-session: ${SESSION_ID}
tandemu-timestamp: ${TIMESTAMP}
tandemu-org: ${TANDEMU_ORG_ID:-unknown}"

# Append telemetry metadata as a git note (non-fatal if it fails)
if git notes append -m "${TELEMETRY_NOTE}" "${COMMIT_HASH}" 2>/dev/null; then
  echo "[OK] Telemetry metadata attached to commit."
else
  echo "[INFO] Could not attach git note (notes may not be enabled)."
fi

echo ""
echo "=== Post-Commit Hook Complete ==="
