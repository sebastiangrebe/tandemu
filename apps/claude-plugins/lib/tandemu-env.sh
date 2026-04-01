#!/bin/sh
# Shared Tandemu config loader — source this from skills to get env vars.
# Usage: source "$(dirname "$0")/../lib/tandemu-env.sh"

_TANDEMU_CONFIG=$(cat ~/.claude/tandemu.json 2>/dev/null)
if [ -z "$_TANDEMU_CONFIG" ]; then
  echo "ERROR: Tandemu not configured. Run /tandemu:setup or install.sh to set up." >&2
  return 1 2>/dev/null || exit 1
fi

eval "$(echo "$_TANDEMU_CONFIG" | python3 -c "
import sys, json
c = json.load(sys.stdin)
print(f'TANDEMU_TOKEN={chr(39)}{c[\"auth\"][\"token\"]}{chr(39)}')
print(f'TANDEMU_API={chr(39)}{c[\"api\"][\"url\"]}{chr(39)}')
print(f'TANDEMU_ORG_ID={chr(39)}{c[\"organization\"][\"id\"]}{chr(39)}')
print(f'TANDEMU_USER_ID={chr(39)}{c[\"user\"][\"id\"]}{chr(39)}')
print(f'TANDEMU_USER_EMAIL={chr(39)}{c[\"user\"][\"email\"]}{chr(39)}')
print(f'TANDEMU_USER_NAME={chr(39)}{c[\"user\"][\"name\"]}{chr(39)}')

# Multi-team support: read teams array
teams = c.get('teams', [])
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

unset _TANDEMU_CONFIG
