Set up Tandemu for the current developer. This skill handles authentication, configuration, and installs short-named skills for daily use.

**This skill should only be run once per machine.** Re-run to re-authenticate or update.

## Steps

### 1. Check prerequisites

```bash
command -v python3 &>/dev/null && echo "OK" || echo "MISSING: python3"
command -v curl &>/dev/null && echo "OK" || echo "MISSING: curl"
```

If any are missing, tell the developer what to install and stop.

### 2. Choose Tandemu instance

Use AskUserQuestion:
- Question: "Which Tandemu instance do you want to connect to?"
- Header: "Instance"
- Options:
  - Label: "Tandemu Cloud", Description: "Hosted at https://api.tandemu.dev (Recommended)"
  - Label: "Self-hosted", Description: "You'll provide the URL"

If **Tandemu Cloud**: set `API_URL=https://api.tandemu.dev`
If **Self-hosted**: ask for the URL, strip trailing slash.

Verify the instance is reachable:
```bash
curl -sf "${API_URL}/api/health" &>/dev/null && echo "OK" || echo "UNREACHABLE"
```

### 3. Authenticate via OAuth

Start the device auth flow:

```bash
RESPONSE=$(curl -sf -X POST "${API_URL}/api/auth/cli/initiate" -H "Content-Type: application/json")
CODE=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['code'])")
AUTH_URL=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['url'])")
echo "CODE=$CODE"
echo "URL=$AUTH_URL"
```

Tell the developer: "Open this URL in your browser to authorize: <AUTH_URL>"

Open the browser automatically:
```bash
open "$AUTH_URL" 2>/dev/null || xdg-open "$AUTH_URL" 2>/dev/null || true
```

Poll for authorization (max 150 retries, 2 seconds apart):
```bash
for i in $(seq 1 150); do
  POLL=$(curl -sf "${API_URL}/api/auth/cli/status?code=${CODE}" 2>/dev/null)
  STATUS=$(echo "$POLL" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "pending")
  if [ "$STATUS" = "authorized" ]; then
    TOKEN=$(echo "$POLL" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])")
    echo "TOKEN=$TOKEN"
    break
  elif [ "$STATUS" = "expired" ]; then
    echo "EXPIRED"
    break
  fi
  sleep 2
done
```

If expired or timed out, tell the developer and stop.

### 4. Fetch user info

```bash
ME=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/auth/me")
echo "$ME" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']['user']
print(f\"USER_ID={d['id']}\")
print(f\"USER_EMAIL={d['email']}\")
print(f\"USER_NAME={d['name']}\")
"
```

Fetch organizations and teams:
```bash
ORGS=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations")
echo "$ORGS" | python3 -c "
import json, sys
orgs = json.load(sys.stdin)['data']
for i, org in enumerate(orgs):
    print(f\"ORG_{i}_ID={org['id']}\")
    print(f\"ORG_{i}_NAME={org['name']}\")
print(f\"ORG_COUNT={len(orgs)}\")
"
```

If there are **multiple organizations**, use AskUserQuestion to let the user pick:
- Question: "Which organization do you want to connect?"
- Header: "Organization"
- Options: build dynamically from the org list (max 4). Each option:
  - Label: the org name
  - Description: the org ID

After the user picks an org, switch the token to that org:
```bash
SWITCH_RESPONSE=$(curl -sf -X POST "${API_URL}/api/auth/switch-org" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "'"$CHOSEN_ORG_ID"'"}')
NEW_TOKEN=$(echo "$SWITCH_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
TOKEN="$NEW_TOKEN"
```

Use the new `$TOKEN` for all subsequent API calls (team fetch, config writing).

If there is **one organization**, use it directly (no prompt needed).
If there are **zero organizations**, tell the developer to create one on the dashboard and stop.

Fetch teams for the chosen org:
```bash
TEAMS=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations/${ORG_ID}/teams")
echo "$TEAMS" | python3 -c "
import json, sys
teams = json.load(sys.stdin)['data']
if teams:
    print(f\"TEAM_ID={teams[0]['id']}\")
    print(f\"TEAM_NAME={teams[0]['name']}\")
else:
    print('TEAM_ID=')
    print('TEAM_NAME=')
"
```

### 5. Write configuration files

#### 5a. tandemu.json

```bash
mkdir -p ~/.claude
cat > ~/.claude/tandemu.json << EOF
{
  "auth": { "token": "${TOKEN}" },
  "user": { "id": "${USER_ID}", "email": "${USER_EMAIL}", "name": "${USER_NAME}" },
  "organization": { "id": "${ORG_ID}", "name": "${ORG_NAME}" },
  "team": { "id": "${TEAM_ID}", "name": "${TEAM_NAME}" },
  "api": { "url": "${API_URL}" }
}
EOF
```

#### 5b. settings.json (telemetry + permissions)

Derive OTEL host from API URL (strip protocol and port):
```bash
OTEL_HOST=$(echo "$API_URL" | sed 's|https://||;s|http://||' | sed 's|:.*||')
OTEL_ENDPOINT="http://${OTEL_HOST}:4318"
```

Merge into existing settings.json (don't overwrite other settings):
```bash
python3 << 'PYEOF'
import json, os
settings_file = os.path.expanduser("~/.claude/settings.json")
try:
    with open(settings_file) as f:
        settings = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    settings = {}

env = settings.get("env", {})
env.update({
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": os.environ.get("OTEL_ENDPOINT", "http://localhost:4318"),
    "OTEL_METRIC_EXPORT_INTERVAL": "10000",
    "OTEL_RESOURCE_ATTRIBUTES": f"organization_id={os.environ.get('ORG_ID', '')}"
})
settings["env"] = env

perms = settings.get("permissions", {})
allow = perms.get("allow", [])
api_host = os.environ.get("OTEL_HOST", "localhost")
tandemu_perms = [
    "Edit(~/.claude/tandemu*)",
    "Write(~/.claude/tandemu*)",
    "Bash(cat > ~/.claude/tandemu*)",
    "Bash(rm ~/.claude/tandemu*)",
    "Bash(rm -f ~/.claude/tandemu*)",
    f"Bash(curl*{api_host}:3001*)",
    f"Bash(curl*{api_host}:4318*)",
]
for p in tandemu_perms:
    if p not in allow:
        allow.append(p)
perms["allow"] = allow
settings["permissions"] = perms

with open(settings_file, "w") as f:
    json.dump(settings, f, indent=2)
print("OK")
PYEOF
```

#### 5c. MCP memory config (~/.mcp.json)

Fetch the memory config from the API (returns the correct URL for both self-hosted OpenMemory and Mem0 Cloud):

```bash
MEM_CONFIG=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/memory/config")
MEM_TYPE=$(echo "$MEM_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['type'])" 2>/dev/null)
MEM_URL=$(echo "$MEM_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])" 2>/dev/null)
```

If the API returns a config, write it to `~/.mcp.json`:

```bash
python3 << 'PYEOF'
import json, os
mcp_file = os.path.expanduser("~/.mcp.json")
mem_type = os.environ.get("MEM_TYPE", "")
mem_url = os.environ.get("MEM_URL", "")
if not mem_url:
    print("SKIP: no memory config from API")
    exit(0)
try:
    with open(mcp_file) as f:
        config = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    config = {}
servers = config.get("mcpServers", {})
servers["tandemu-memory"] = {
    "type": "sse",
    "url": mem_url
}
config["mcpServers"] = servers
with open(mcp_file, "w") as f:
    json.dump(config, f, indent=2)
print("OK")
PYEOF
```

If the API doesn't return a memory config, skip this step and tell the developer that memory is not configured for this instance.

Also migrate legacy config if it exists:
```bash
python3 << 'PYEOF'
import json, os
# Migrate from ~/.claude.json to ~/.mcp.json if needed
old_file = os.path.expanduser("~/.claude.json")
new_file = os.path.expanduser("~/.mcp.json")
try:
    with open(old_file) as f:
        old = json.load(f)
    if "tandemu-memory" in old.get("mcpServers", {}):
        del old["mcpServers"]["tandemu-memory"]
        if not old["mcpServers"]:
            del old["mcpServers"]
        if old:
            with open(old_file, "w") as f:
                json.dump(old, f, indent=2)
        else:
            os.remove(old_file)
        print("MIGRATED")
    else:
        print("NO_MIGRATION")
except (FileNotFoundError, json.JSONDecodeError):
    print("NO_MIGRATION")
PYEOF
```

### 6. Install short-named skills

Copy skills from the plugin directory to `~/.claude/skills/` for short invocation names.

The plugin root is available at `${CLAUDE_PLUGIN_ROOT}` if running as a plugin skill. If not available, detect the repo directory:

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  # Fallback: find the tandemu repo
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [ -d "$REPO_ROOT/apps/claude-plugins/skills" ]; then
    PLUGIN_ROOT="$REPO_ROOT/apps/claude-plugins"
  fi
fi

if [ -z "$PLUGIN_ROOT" ] || [ ! -d "$PLUGIN_ROOT/skills" ]; then
  echo "WARN: Could not find plugin skills directory. Short-named skills not installed."
  echo "You can still use /tandemu:morning, /tandemu:finish, etc."
else
  mkdir -p ~/.claude/skills ~/.claude/lib
  # Copy shared lib
  [ -d "$PLUGIN_ROOT/lib" ] && cp -r "$PLUGIN_ROOT/lib"/* ~/.claude/lib/
  # Copy skills (skip setup — it's only needed once)
  for skill_dir in "$PLUGIN_ROOT/skills"/*/; do
    skill_name=$(basename "$skill_dir")
    [ "$skill_name" = "setup" ] && continue
    rm -rf ~/.claude/skills/$skill_name
    cp -r "$skill_dir" ~/.claude/skills/$skill_name
  done
  echo "OK"
fi
```

### 7. Write version file

```bash
VERSION=$(cat "${PLUGIN_ROOT}/.claude-plugin/plugin.json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown")
echo "$VERSION" > ~/.claude/tandemu-version.txt
```

### 8. Copy CLAUDE.md

```bash
if [ -f "$PLUGIN_ROOT/CLAUDE.md" ]; then
  cp "$PLUGIN_ROOT/CLAUDE.md" ~/.claude/CLAUDE.md
  echo "OK"
fi
```

### 9. Show summary

Tell the developer:

```
Tandemu installed!

Connected as: <USER_NAME> (<USER_EMAIL>)
Organization: <ORG_NAME>
Team: <TEAM_NAME>
API: <API_URL>
Telemetry: enabled
Memory: enabled

⚠️  Please restart Claude Code to activate the memory server.
   Type /exit, then reopen claude.

Available skills:
  /morning   — Pick a task and start working
  /finish    — Complete task, measure work, send telemetry
  /pause     — Pause current task, switch to another
  /standup   — Generate a team standup report
  /blockers  — See what's slowing the team down

After restarting, get started with:
  > /morning
```

### Notes

- This skill is idempotent — safe to re-run for re-authentication or updates
- The OAuth poll loop runs in bash, not interactively — the developer authorizes in their browser
- Settings.json is merged, not overwritten — other settings are preserved
- Short-named skills are copies, not symlinks — they work independently of the plugin
- Legacy `~/.claude.json` MCP config is migrated to `~/.mcp.json` automatically
