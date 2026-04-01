#!/bin/sh
# tandemu-session-start.sh — Runs at Claude Code session start via SessionStart hook.
# 1. Fetches personality memories and writes them to ~/.claude/CLAUDE.md (global, all projects)
# 2. Fetches repo memory index and outputs to stdout (injected into session context)

set -e

# Load config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || exit 0

CLAUDE_MD="$HOME/.claude/CLAUDE.md"
START_MARKER="<!-- tandemu:personality:start -->"
END_MARKER="<!-- tandemu:personality:end -->"

# --- 1. Update personality in ~/.claude/CLAUDE.md ---

PERSONALITY=$(curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" \
  "$TANDEMU_API/api/memory/search?q=communication+style+preferences+name+personality+coding+DNA&scope=personal&limit=5" 2>/dev/null || true)

if [ -n "$PERSONALITY" ]; then
  LINES=$(echo "$PERSONALITY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for m in data.get('memories', []):
        content = m.get('memory', m.get('content', ''))
        if content:
            print(f'- {content}')
except:
    pass
" 2>/dev/null)
fi

# Build the new personality block (or empty if no memories)
if [ -n "$LINES" ]; then
  NEW_BLOCK="$START_MARKER
# About This Developer
$LINES
$END_MARKER"
else
  NEW_BLOCK=""
fi

# Read existing CLAUDE.md or start fresh
if [ -f "$CLAUDE_MD" ]; then
  EXISTING=$(cat "$CLAUDE_MD")
else
  EXISTING=""
fi

# Check if a Tandemu personality section already exists
if echo "$EXISTING" | grep -qF "$START_MARKER"; then
  # Replace existing section using python for reliable multiline replacement
  python3 -c "
import re, sys
existing = open('$CLAUDE_MD').read()
pattern = re.escape('$START_MARKER') + r'.*?' + re.escape('$END_MARKER')
replacement = sys.stdin.read().strip()
updated = re.sub(pattern, replacement, existing, flags=re.DOTALL)
# Remove empty lines left behind if replacement is empty
if not replacement:
    updated = re.sub(r'\n{3,}', '\n\n', updated)
open('$CLAUDE_MD', 'w').write(updated)
" <<EOF
$NEW_BLOCK
EOF
else
  # No existing section — prepend personality block if we have one
  if [ -n "$NEW_BLOCK" ]; then
    printf '%s\n\n%s\n' "$NEW_BLOCK" "$EXISTING" > "$CLAUDE_MD"
  fi
fi

# --- 2. Output repo memory index to stdout (injected into session context) ---

REPO_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || true)
if [ -n "$REPO_NAME" ]; then
  INDEX=$(curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" \
    "$TANDEMU_API/api/memory/index?repo=$REPO_NAME" 2>/dev/null || true)

  if [ -n "$INDEX" ]; then
    echo "$INDEX"

    # Also persist to project memory dir
    PROJECT_DIR=$(pwd | sed "s/\//-/g")
    MEMORY_DIR="$HOME/.claude/projects/${PROJECT_DIR}/memory"
    mkdir -p "$MEMORY_DIR"
    echo "$INDEX" > "$MEMORY_DIR/tandemu-index.md"
  fi
fi

exit 0
