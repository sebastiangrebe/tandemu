#!/usr/bin/env bash
# post-task.sh — Runs after task completion
# Generates a PR description from the session's diffs and outputs a summary.

set -euo pipefail

MAIN_BRANCH="${TANDEMU_MAIN_BRANCH:-main}"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

echo "=== Tandemu Post-Task Summary ==="
echo "Branch: ${CURRENT_BRANCH}"
echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Check if we have commits ahead of main
if git rev-parse --verify "${MAIN_BRANCH}" >/dev/null 2>&1; then
  COMMIT_COUNT=$(git rev-list "${MAIN_BRANCH}..HEAD" --count 2>/dev/null || echo "0")
  echo "Commits ahead of ${MAIN_BRANCH}: ${COMMIT_COUNT}"
  echo ""

  if [ "${COMMIT_COUNT}" -gt 0 ]; then
    echo "--- Commit Log ---"
    git log "${MAIN_BRANCH}..HEAD" --oneline --no-merges
    echo ""

    echo "--- Diff Summary ---"
    git diff "${MAIN_BRANCH}...HEAD" --stat
    echo ""

    echo "--- Suggested PR Description ---"
    echo ""
    echo "## Summary"
    echo ""
    echo "This branch introduces the following changes:"
    echo ""
    git log "${MAIN_BRANCH}..HEAD" --format="- %s" --no-merges
    echo ""
    echo "## Changes"
    echo ""
    git diff "${MAIN_BRANCH}...HEAD" --stat | tail -1
    echo ""
    echo "## Testing"
    echo ""
    echo "- [ ] Unit tests added/updated"
    echo "- [ ] Manual testing performed"
    echo "- [ ] CI checks pass"
  else
    echo "No new commits on this branch."
  fi
else
  echo "Warning: Could not find ${MAIN_BRANCH} branch for comparison."
fi

echo ""
echo "=== End Post-Task Summary ==="
