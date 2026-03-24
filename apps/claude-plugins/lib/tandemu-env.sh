#!/bin/sh
# Shared Tandemu config loader — source this from skills to get env vars.
# Usage: source "$(dirname "$0")/../lib/tandemu-env.sh"

_TANDEMU_CONFIG=$(cat ~/.claude/tandemu.json 2>/dev/null)
if [ -z "$_TANDEMU_CONFIG" ]; then
  echo "ERROR: Tandemu not configured. Run install.sh to set up." >&2
  return 1 2>/dev/null || exit 1
fi

eval "$(echo "$_TANDEMU_CONFIG" | python3 -c "
import sys, json
c = json.load(sys.stdin)
print(f'TANDEMU_TOKEN={chr(39)}{c[\"auth\"][\"token\"]}{chr(39)}')
print(f'TANDEMU_API={chr(39)}{c[\"api\"][\"url\"]}{chr(39)}')
print(f'TANDEMU_ORG_ID={chr(39)}{c[\"organization\"][\"id\"]}{chr(39)}')
print(f'TANDEMU_TEAM_ID={chr(39)}{c[\"team\"][\"id\"]}{chr(39)}')
print(f'TANDEMU_USER_ID={chr(39)}{c[\"user\"][\"id\"]}{chr(39)}')
print(f'TANDEMU_USER_EMAIL={chr(39)}{c[\"user\"][\"email\"]}{chr(39)}')
print(f'TANDEMU_USER_NAME={chr(39)}{c[\"user\"][\"name\"]}{chr(39)}')
")"

unset _TANDEMU_CONFIG
