#!/bin/sh
# Tandemu env loader — sourced by skills. Probes per-agent auth files in order
# until one is found, then exports TANDEMU_* env vars for the calling shell.
#
# This is the canonical loader, shipped by both install paths:
#   - Plugin marketplace: /tandemu:setup copies it to ~/.claude/lib/
#   - install.sh: install_universal_lib copies it to ~/.config/tandemu/lib/
# Skills source the universal path first, then the Claude path, so either
# install path works and existing Claude users keep working.

_TANDEMU_CONFIG=""
for _f in \
  "$HOME/.claude/tandemu.json" \
  "$HOME/.config/tandemu/auth.json" \
  "$HOME/.config/tandemu/cursor-auth.json" \
  "$HOME/.config/tandemu/codex-auth.json"; do
  if [ -f "$_f" ]; then
    _TANDEMU_CONFIG=$(cat "$_f" 2>/dev/null)
    [ -n "$_TANDEMU_CONFIG" ] && break
  fi
done
unset _f

if [ -z "$_TANDEMU_CONFIG" ]; then
  echo "ERROR: Tandemu not configured. Run /tandemu:setup or install.sh to set up." >&2
  return 1 2>/dev/null || exit 1
fi

eval "$(echo "$_TANDEMU_CONFIG" | python3 -c "
import sys, json
c = json.load(sys.stdin)
print(f'TANDEMU_TOKEN={chr(39)}{c[\"auth\"][\"token\"]}{chr(39)}')
print(f'TANDEMU_API={chr(39)}{c[\"api\"][\"url\"]}{chr(39)}')
print(f'TANDEMU_ORG_ID={chr(39)}{c.get(\"organization\",{}).get(\"id\",\"\")}{chr(39)}')
print(f'TANDEMU_USER_ID={chr(39)}{c[\"user\"][\"id\"]}{chr(39)}')
print(f'TANDEMU_USER_EMAIL={chr(39)}{c[\"user\"][\"email\"]}{chr(39)}')
print(f'TANDEMU_USER_NAME={chr(39)}{c[\"user\"][\"name\"]}{chr(39)}')

teams = c.get('teams') or ([c['team']] if c.get('team',{}).get('id') else [])
if teams:
    ids = ','.join(t['id'] for t in teams)
    names = ','.join(t['name'] for t in teams)
    print(f'TANDEMU_TEAM_ID={chr(39)}{teams[0][\"id\"]}{chr(39)}')
    print(f'TANDEMU_TEAM_IDS={chr(39)}{ids}{chr(39)}')
    print(f'TANDEMU_TEAM_NAMES={chr(39)}{names}{chr(39)}')
    print(f'TANDEMU_TEAM_COUNT={len(teams)}')
else:
    print(\"TANDEMU_TEAM_ID=''\")
    print(\"TANDEMU_TEAM_IDS=''\")
    print(\"TANDEMU_TEAM_NAMES=''\")
    print('TANDEMU_TEAM_COUNT=0')
")"

# Universal active-task dir (skills read/write here)
export TANDEMU_TASKS_DIR="${TANDEMU_TASKS_DIR:-$HOME/.config/tandemu/active-tasks}"
mkdir -p "$TANDEMU_TASKS_DIR" 2>/dev/null || true

# One-time migration: relocate legacy branch-keyed task files from the old
# Claude-only location into the universal dir. Same filename scheme, so this
# is a plain move. Skipped if a file with that name already exists there.
for _t in "$HOME"/.claude/tandemu-active-task-*.json; do
  [ -e "$_t" ] || continue
  _dest="$TANDEMU_TASKS_DIR/$(basename "$_t")"
  [ -e "$_dest" ] || mv "$_t" "$_dest" 2>/dev/null || true
done
unset _t _dest

# OTEL collector endpoint. Derived from the API host (collector runs alongside
# the backend on :4318). Skills must use this instead of reading
# ~/.claude/settings.json, which only exists on Claude Code installs.
_TANDEMU_OTEL_HOST=$(echo "$TANDEMU_API" | sed 's|https\{0,1\}://||; s|/.*||; s|:.*||')
if [ -n "$_TANDEMU_OTEL_HOST" ]; then
  export TANDEMU_OTEL_ENDPOINT="http://${_TANDEMU_OTEL_HOST}:4318"
fi
unset _TANDEMU_OTEL_HOST

unset _TANDEMU_CONFIG
