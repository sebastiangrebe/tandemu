#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  Tandemu Installer (Developer)
#  Usage: ./install.sh
#  Alternative: In Claude Code, run /plugin marketplace add sebastiangrebe/tandemu, then /plugin install tandemu, then /tandemu:setup
#
#  Installs Claude Code skills, configures telemetry,
#  and sets up memory for your Tandemu instance.
#
#  Flags:
#    --url <url>       Set API URL (skip instance selection)
#    --token <token>   Use provided JWT (non-interactive)
#    --uninstall       Remove all Tandemu files
#    --check           Check for updates
#    --skip-prereqs    Skip prerequisite checks
# ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

CLAUDE_DIR="$HOME/.claude"
SKILLS_DIR="$CLAUDE_DIR/skills"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
VERSION_FILE="$CLAUDE_DIR/tandemu-version.txt"

# ─────────────────────────────────────────────────────────

header() {
  echo ""
  printf '%b\n' "${BOLD}  ┌─────────────────────────────────────┐${NC}"
  printf '%b\n' "${BOLD}  │                                     │${NC}"
  printf '%b\n' "${BOLD}  │       ${BLUE}Tandemu${NC}${BOLD} — AI Teammate         │${NC}"
  printf '%b\n' "${BOLD}  │                                     │${NC}"
  printf '%b\n' "${BOLD}  └─────────────────────────────────────┘${NC}"
  echo ""
}

step() { printf '%b\n' "  ${BLUE}→${NC} $1"; }
ok()   { printf '%b\n' "  ${GREEN}✓${NC} $1"; }
warn() { printf '%b\n' "  ${YELLOW}!${NC} $1"; }
fail() { printf '%b\n' "  ${RED}✗${NC} $1"; exit 1; }
dim()  { printf '%b\n' "  ${DIM}$1${NC}"; }

# ─────────────────────────────────────────────────────────
# Get plugin version from plugin.json
# ─────────────────────────────────────────────────────────

get_plugin_version() {
  local plugin_json="${SCRIPT_DIR}/apps/claude-plugins/.claude-plugin/plugin.json"
  if [ -f "$plugin_json" ]; then
    python3 -c "import json; print(json.load(open('$plugin_json')).get('version','unknown'))" 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

# ─────────────────────────────────────────────────────────
# Uninstall
# ─────────────────────────────────────────────────────────

do_uninstall() {
  header
  step "Removing Tandemu..."

  # Remove plugin cache and registry entries
  rm -rf "$CLAUDE_DIR/plugins/marketplaces/tandemu"
  rm -rf "$CLAUDE_DIR/plugins/cache/tandemu"*
  python3 << 'PYEOF'
import json, os
plugins_dir = os.path.expanduser("~/.claude/plugins")
for f in ["installed_plugins.json", "known_marketplaces.json"]:
    path = os.path.join(plugins_dir, f)
    try:
        with open(path) as fh:
            d = json.load(fh)
        if f == "installed_plugins.json":
            d["plugins"] = {k: v for k, v in d.get("plugins", {}).items() if "tandemu" not in k}
        else:
            d.pop("tandemu", None)
        with open(path, "w") as fh:
            json.dump(d, fh, indent=2)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
PYEOF
  ok "Plugin cache and registry cleaned"

  # Remove tandemu config
  rm -f "$CLAUDE_DIR/tandemu.json"
  rm -f "$CLAUDE_DIR/tandemu-active-task.json"
  rm -f "$CLAUDE_DIR/tandemu-memory-index-"*.md
  rm -f "$VERSION_FILE"
  ok "Config removed"

  # Remove skills
  for skill in morning finish pause create standup setup; do
    rm -rf "$SKILLS_DIR/$skill"
  done
  ok "Skills removed"

  # Remove shared lib
  rm -f "$CLAUDE_DIR/lib/tandemu-env.sh"
  ok "Shared lib removed"

  # Remove CLAUDE.md if it's Tandemu's
  if [ -f "$CLAUDE_DIR/CLAUDE.md" ] && grep -q "Tandemu AI Teammate" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null; then
    rm -f "$CLAUDE_DIR/CLAUDE.md"
    ok "CLAUDE.md removed"
  fi

  # Clean MCP config from ~/.mcp.json
  if [ -f "$HOME/.mcp.json" ]; then
    python3 << 'PYEOF'
import json, os
mcp_file = os.path.expanduser("~/.mcp.json")
try:
    with open(mcp_file) as f:
        config = json.load(f)
    if "tandemu-memory" in config.get("mcpServers", {}):
        del config["mcpServers"]["tandemu-memory"]
        if not config["mcpServers"]:
            del config["mcpServers"]
        if config:
            with open(mcp_file, "w") as f:
                json.dump(config, f, indent=2)
        else:
            os.remove(mcp_file)
except (FileNotFoundError, json.JSONDecodeError):
    pass
PYEOF
    ok "MCP config cleaned"
  fi

  # Clean legacy ~/.claude.json MCP config
  if [ -f "$HOME/.claude.json" ]; then
    python3 << 'PYEOF'
import json, os
mcp_file = os.path.expanduser("~/.claude.json")
try:
    with open(mcp_file) as f:
        config = json.load(f)
    if "tandemu-memory" in config.get("mcpServers", {}):
        del config["mcpServers"]["tandemu-memory"]
        if not config["mcpServers"]:
            del config["mcpServers"]
        if config:
            with open(mcp_file, "w") as f:
                json.dump(config, f, indent=2)
        else:
            os.remove(mcp_file)
except (FileNotFoundError, json.JSONDecodeError):
    pass
PYEOF
    ok "Legacy MCP config cleaned"
  fi

  # Clean settings.json (remove tandemu-specific env vars, permissions, hooks, and plugin entries)
  if [ -f "$CLAUDE_DIR/settings.json" ]; then
    python3 << 'PYEOF'
import json, os
settings_file = os.path.expanduser("~/.claude/settings.json")
try:
    with open(settings_file) as f:
        settings = json.load(f)
    # Remove tandemu plugin entries
    ep = settings.get("enabledPlugins", {})
    settings["enabledPlugins"] = {k: v for k, v in ep.items() if "tandemu" not in k}
    if not settings["enabledPlugins"]:
        del settings["enabledPlugins"]
    ekm = settings.get("extraKnownMarketplaces", {})
    ekm.pop("tandemu", None)
    if ekm:
        settings["extraKnownMarketplaces"] = ekm
    elif "extraKnownMarketplaces" in settings:
        del settings["extraKnownMarketplaces"]
    # Remove tandemu env vars
    env = settings.get("env", {})
    for key in list(env.keys()):
        if key.startswith("OTEL_") or key == "CLAUDE_CODE_ENABLE_TELEMETRY":
            del env[key]
    if env:
        settings["env"] = env
    elif "env" in settings:
        del settings["env"]
    # Remove tandemu permissions
    perms = settings.get("permissions", {})
    allow = perms.get("allow", [])
    allow = [p for p in allow if "tandemu" not in p.lower() and ":3001" not in p and ":4318" not in p]
    if allow:
        perms["allow"] = allow
    elif "allow" in perms:
        del perms["allow"]
    if perms:
        settings["permissions"] = perms
    elif "permissions" in settings:
        del settings["permissions"]
    # Remove tandemu hooks
    if "hooks" in settings:
        hooks = settings["hooks"]
        hooks.pop("SessionStart", None)
        if not hooks:
            del settings["hooks"]
    with open(settings_file, "w") as f:
        json.dump(settings, f, indent=2)
except (FileNotFoundError, json.JSONDecodeError):
    pass
PYEOF
    ok "Settings cleaned"
  fi

  echo ""
  printf '%b\n' "  ${GREEN}Tandemu uninstalled.${NC}"
  echo ""
  exit 0
}

# ─────────────────────────────────────────────────────────
# Check for updates
# ─────────────────────────────────────────────────────────

do_check() {
  header
  local installed="unknown"
  if [ -f "$VERSION_FILE" ]; then
    installed=$(cat "$VERSION_FILE")
  fi

  local latest
  latest=$(get_plugin_version)

  printf '%b\n' "  Installed: ${BOLD}${installed}${NC}"
  printf '%b\n' "  Available: ${BOLD}${latest}${NC}"

  if [ "$installed" = "$latest" ]; then
    ok "You're up to date"
  elif [ "$installed" = "unknown" ]; then
    warn "Version not tracked. Run install.sh to update."
  else
    warn "Update available. Run install.sh to update."
  fi
  echo ""
  exit 0
}

# ─────────────────────────────────────────────────────────
# Prerequisites
# ─────────────────────────────────────────────────────────

check_prerequisites() {
  step "Checking prerequisites..."

  if ! command -v claude &>/dev/null; then
    fail "Claude Code CLI not found. Install it first: https://code.claude.com"
  fi

  if ! command -v python3 &>/dev/null; then
    fail "python3 not found. It's required for configuration."
  fi

  if ! command -v curl &>/dev/null; then
    fail "curl not found."
  fi

  ok "All prerequisites found"
}

# ─────────────────────────────────────────────────────────
# Choose Tandemu instance
# ─────────────────────────────────────────────────────────

choose_instance() {
  echo ""
  printf '%b\n' "  ${BOLD}Which Tandemu instance do you want to connect to?${NC}"
  echo ""
  printf '%b\n' "    ${BOLD}1.${NC} Tandemu Cloud ${DIM}(Recommended)${NC}"
  dim "      Hosted at https://api.tandemu.dev"
  echo ""
  printf '%b\n' "    ${BOLD}2.${NC} Self-hosted instance"
  dim "      You'll provide the URL"
  echo ""

  read -rp "  Choose (1 or 2): " choice
  case "$choice" in
    1)
      API_URL="https://api.tandemu.dev"
      ;;
    2)
      echo ""
      read -rp "  Enter your Tandemu URL (e.g., https://tandemu.company.com): " API_URL
      API_URL="${API_URL%/}"
      ;;
    *)
      API_URL="https://api.tandemu.dev"
      ;;
  esac

  step "Checking ${API_URL}..."
  if curl -sf "${API_URL}/api/health" &>/dev/null; then
    ok "Tandemu instance is reachable"
  else
    fail "Could not reach ${API_URL}. Check the URL and try again."
  fi
}

# ─────────────────────────────────────────────────────────
# OAuth: Browser-based authentication
# ─────────────────────────────────────────────────────────

do_oauth() {
  step "Starting authentication..."

  RESPONSE=$(curl -sf -X POST "${API_URL}/api/auth/cli/initiate" -H "Content-Type: application/json" 2>/dev/null) || {
    fail "Could not reach Tandemu API at ${API_URL}."
  }

  CODE=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['code'])" 2>/dev/null)
  AUTH_URL=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['url'])" 2>/dev/null)

  if [ -z "$CODE" ] || [ -z "$AUTH_URL" ]; then
    fail "Could not parse auth response."
  fi

  echo ""
  printf '%b\n' "  ${BOLD}Opening your browser to authorize...${NC}"
  echo ""
  dim "  If the browser doesn't open, visit:"
  dim "  ${AUTH_URL}"
  echo ""

  if command -v open &>/dev/null; then
    open "$AUTH_URL" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$AUTH_URL" 2>/dev/null || true
  fi

  step "Waiting for you to authorize in the browser..."
  local retries=150
  TOKEN=""
  while [ $retries -gt 0 ]; do
    POLL_RESPONSE=$(curl -sf "${API_URL}/api/auth/cli/status?code=${CODE}" 2>/dev/null) || true
    STATUS=$(echo "$POLL_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "pending")

    if [ "$STATUS" = "authorized" ]; then
      TOKEN=$(echo "$POLL_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
      break
    elif [ "$STATUS" = "expired" ]; then
      fail "Authorization expired. Please run the installer again."
    fi

    sleep 2
    retries=$((retries - 1))
  done

  if [ -z "$TOKEN" ]; then
    fail "Authorization timed out."
  fi

  ok "Authorized!"
}

# ─────────────────────────────────────────────────────────
# Fetch user, org, team info
# ─────────────────────────────────────────────────────────

fetch_user_info() {
  ME_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/auth/me" 2>/dev/null)
  USER_ID=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['id'])" 2>/dev/null)
  USER_EMAIL=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['email'])" 2>/dev/null)
  USER_NAME=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['name'])" 2>/dev/null)

  ORGS_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations" 2>/dev/null)
  ORG_COUNT=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")

  ORG_ID=""
  ORG_NAME=""
  TEAM_ID=""
  TEAM_NAME=""

  if [ "$ORG_COUNT" -eq 1 ]; then
    ORG_ID=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
    ORG_NAME=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null)
  elif [ "$ORG_COUNT" -gt 1 ]; then
    echo ""
    printf '%b\n' "  ${BOLD}You belong to multiple organizations:${NC}"
    echo ""
    echo "$ORGS_RESPONSE" | python3 -c "
import json, sys
orgs = json.load(sys.stdin)['data']
for i, org in enumerate(orgs, 1):
    print(f'    {i}. {org[\"name\"]}')
"
    echo ""
    read -rp "  Choose (1-${ORG_COUNT}): " org_choice
    local idx=$((org_choice - 1))
    if [ "$idx" -lt 0 ] || [ "$idx" -ge "$ORG_COUNT" ]; then
      idx=0
    fi
    ORG_ID=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][$idx]['id'])" 2>/dev/null)
    ORG_NAME=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][$idx]['name'])" 2>/dev/null)

    # Switch token to the chosen org
    SWITCH_RESPONSE=$(curl -sf -X POST "${API_URL}/api/auth/switch-org" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"organizationId": "'"$ORG_ID"'"}' 2>/dev/null)
    NEW_TOKEN=$(echo "$SWITCH_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null)
    if [ -n "$NEW_TOKEN" ]; then
      TOKEN="$NEW_TOKEN"
      ok "Switched to ${ORG_NAME}"
    else
      warn "Could not switch org — using default"
    fi
  fi

  if [ -n "$ORG_ID" ]; then
    TEAMS_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations/${ORG_ID}/teams" 2>/dev/null)
    TEAM_COUNT=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")

    if [ "$TEAM_COUNT" -gt 0 ]; then
      TEAM_ID=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
      TEAM_NAME=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null)
    fi
  fi
}

# ─────────────────────────────────────────────────────────
# Write configuration files
# ─────────────────────────────────────────────────────────

write_configs() {
  mkdir -p "$CLAUDE_DIR"

  # 1. tandemu.json
  step "Writing Tandemu config..."
  cat > "$CLAUDE_DIR/tandemu.json" << EOF
{
  "auth": { "token": "${TOKEN}" },
  "user": { "id": "${USER_ID}", "email": "${USER_EMAIL}", "name": "${USER_NAME}" },
  "organization": { "id": "${ORG_ID}", "name": "${ORG_NAME}" },
  "team": { "id": "${TEAM_ID}", "name": "${TEAM_NAME}" },
  "api": { "url": "${API_URL}" }
}
EOF
  ok "Config: ~/.claude/tandemu.json"

  # 2. settings.json — OTEL env vars + permissions
  step "Configuring telemetry and permissions..."
  OTEL_HOST=$(echo "$API_URL" | sed 's|https://||;s|http://||' | sed 's|:.*||')
  OTEL_ENDPOINT="http://${OTEL_HOST}:4318"

  python3 << PYEOF
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
    "OTEL_EXPORTER_OTLP_ENDPOINT": "${OTEL_ENDPOINT}",
    "OTEL_METRIC_EXPORT_INTERVAL": "10000",
    "OTEL_RESOURCE_ATTRIBUTES": "organization_id=${ORG_ID}",
    "OTEL_LOG_TOOL_DETAILS": "1"
})
settings["env"] = env
perms = settings.get("permissions", {})
allow = perms.get("allow", [])
api_host = "${OTEL_HOST}"
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

# SessionStart hook to pull memory index on new sessions
api_url = f"{api_host}:3001"
hooks = settings.get("hooks", {})
hooks["SessionStart"] = [
    {
        "matcher": "startup",
        "hooks": [
            {
                "type": "command",
                "command": f"bash -c 'source ~/.claude/lib/tandemu-env.sh 2>/dev/null && REPO_NAME=\$(basename \"\$(git rev-parse --show-toplevel 2>/dev/null)\") && curl -sf -H \"Authorization: Bearer \$TANDEMU_TOKEN\" \"{api_url}/api/memory/index?repo=\$REPO_NAME\" > ~/.claude/tandemu-memory-index-\${{REPO_NAME}}.md 2>/dev/null; exit 0'",
                "timeout": 10
            }
        ]
    }
]
settings["hooks"] = hooks

with open(settings_file, "w") as f:
    json.dump(settings, f, indent=2)
PYEOF
  ok "Telemetry: enabled (→ ${OTEL_ENDPOINT})"

  # 3. ~/.mcp.json — Memory MCP server (standard location)
  step "Configuring memory server..."
  MEM0_URL="http://${OTEL_HOST}:8765"

  MEM_CONFIG=$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/memory/config" 2>/dev/null)
  if [ -n "$MEM_CONFIG" ]; then
    MEM_TYPE=$(echo "$MEM_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['type'])" 2>/dev/null)
    MEM_URL=$(echo "$MEM_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])" 2>/dev/null)

    python3 << PYEOF
import json, os
mcp_file = os.path.expanduser("~/.mcp.json")
try:
    with open(mcp_file) as f:
        config = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    config = {}
servers = config.get("mcpServers", {})
servers["tandemu-memory"] = {
    "type": "${MEM_TYPE}",
    "url": "${MEM_URL}"
}
config["mcpServers"] = servers
with open(mcp_file, "w") as f:
    json.dump(config, f, indent=2)
PYEOF
    ok "Memory: enabled (→ ${MEM_URL})"
  else
    warn "Could not fetch memory config from ${API_URL}/api/memory/config — memory server not configured"
  fi

  # Migrate legacy ~/.claude.json config
  python3 << 'PYEOF'
import json, os
old_file = os.path.expanduser("~/.claude.json")
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
except (FileNotFoundError, json.JSONDecodeError):
    pass
PYEOF
}

# ─────────────────────────────────────────────────────────
# Install skills + shared lib
# ─────────────────────────────────────────────────────────

install_assets() {
  step "Installing shared config loader..."

  local skills_src=""

  if [ -d "${SCRIPT_DIR}/apps/claude-plugins/lib" ]; then
    skills_src="${SCRIPT_DIR}/apps/claude-plugins"
  else
    fail "Run install.sh from the Tandemu repo directory."
  fi

  # Install shared lib (skills source it for config)
  mkdir -p "$CLAUDE_DIR/lib"
  cp -r "$skills_src/lib"/* "$CLAUDE_DIR/lib/"
  ok "Config loader installed"

  # Skills are distributed via the plugin marketplace — no need to copy them.
  # Users install via: /plugin marketplace add sebastiangrebe/tandemu && /plugin install tandemu
  ok "Skills available via plugin marketplace"
}

# ─────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────

print_done() {
  echo ""
  printf '%b\n' "${BOLD}  ┌───────────────────────────────────────────┐${NC}"
  printf '%b\n' "${BOLD}  │                                             │${NC}"
  printf '%b\n' "${BOLD}  │   ${GREEN}Tandemu installed successfully!${NC}${BOLD}           │${NC}"
  printf '%b\n' "${BOLD}  │                                             │${NC}"
  printf '%b\n' "${BOLD}  └───────────────────────────────────────────┘${NC}"
  echo ""
  printf '%b\n' "  ${BOLD}Connected as:${NC}"
  printf '%b\n' "    Account       ${BLUE}${USER_NAME}${NC} (${USER_EMAIL})"
  if [ -n "$ORG_NAME" ]; then
    printf '%b\n' "    Organization  ${BLUE}${ORG_NAME}${NC}"
  else
    printf '%b\n' "    Organization  ${YELLOW}Not set up yet${NC} — visit the dashboard"
  fi
  if [ -n "$TEAM_NAME" ]; then
    printf '%b\n' "    Team          ${BLUE}${TEAM_NAME}${NC}"
  fi
  printf '%b\n' "    API           ${BLUE}${API_URL}${NC}"
  printf '%b\n' "    Telemetry     ${GREEN}enabled${NC}"
  printf '%b\n' "    Memory        ${GREEN}enabled${NC}"
  echo ""
  printf '%b\n' "  ${BOLD}Get started:${NC}"
  echo ""
  printf '%b\n' "    ${GREEN}\$ cd your-project${NC}"
  printf '%b\n' "    ${GREEN}\$ claude${NC}"
  printf '%b\n' "    ${GREEN}> /morning${NC}"
  echo ""
  printf '%b\n' "  ${BOLD}Available skills:${NC}"
  printf '%b\n' "    ${GREEN}/morning${NC}   — Pick a task and start working"
  printf '%b\n' "    ${GREEN}/finish${NC}    — Complete task, measure work, send telemetry"
  printf '%b\n' "    ${GREEN}/pause${NC}     — Pause current task, switch to another"
  printf '%b\n' "    ${GREEN}/standup${NC}   — Generate a team standup report"
  echo ""
  printf '%b\n' "  ${BOLD}Manage:${NC}"
  dim "    Re-authenticate:  ./install.sh"
  dim "    Check updates:    ./install.sh --check"
  dim "    Uninstall:        ./install.sh --uninstall"
  echo ""
}

# ─────────────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────────────

NONINTERACTIVE=""
DO_UNINSTALL=""
DO_CHECK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) API_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; NONINTERACTIVE="true"; shift 2 ;;
    --skip-prereqs) SKIP_PREREQS="true"; shift ;;
    --uninstall) DO_UNINSTALL="true"; shift ;;
    --check) DO_CHECK="true"; shift ;;
    *) shift ;;
  esac
done

# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────

main() {
  # Handle --uninstall and --check early
  if [ "${DO_UNINSTALL:-}" = "true" ]; then
    do_uninstall
  fi

  if [ "${DO_CHECK:-}" = "true" ]; then
    do_check
  fi

  header

  if [ "${SKIP_PREREQS:-}" != "true" ]; then
    check_prerequisites
  fi

  if [ -z "${API_URL:-}" ]; then
    choose_instance
  else
    step "Using API: ${API_URL}"
    ok "Instance configured"
  fi

  if [ "${NONINTERACTIVE:-}" = "true" ] && [ -n "${TOKEN:-}" ]; then
    step "Using provided token..."
    fetch_user_info
    ok "Authorized as ${USER_NAME} (${USER_EMAIL})"
  else
    do_oauth
    fetch_user_info
  fi

  write_configs
  install_assets
  print_done
}

main "$@"
