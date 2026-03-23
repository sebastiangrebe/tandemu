#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  Tandemu Installer (Developer)
#  Usage: curl -fsSL https://tandemu.dev/install.sh | bash
#
#  Installs Claude Code skills, configures telemetry,
#  and sets up memory for your Tandemu instance.
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
TANDEMU_DATA_DIR="$HOME/.tandemu"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

# Where to download skills + MCP server from
TANDEMU_RELEASE_URL="${TANDEMU_RELEASE_URL:-https://github.com/anthropics/tandemu/releases/latest/download}"

# ─────────────────────────────────────────────────────────

header() {
  echo ""
  printf '%b\n' "${BOLD}  ┌────────────────────────────────────┐${NC}"
  printf '%b\n' "${BOLD}  │                                      │${NC}"
  printf '%b\n' "${BOLD}  │      ${BLUE}Tandemu${NC}${BOLD} — AI Teammate          │${NC}"
  printf '%b\n' "${BOLD}  │                                      │${NC}"
  printf '%b\n' "${BOLD}  └────────────────────────────────────┘${NC}"
  echo ""
}

step() { printf '%b\n' "  ${BLUE}→${NC} $1"; }
ok()   { printf '%b\n' "  ${GREEN}✓${NC} $1"; }
warn() { printf '%b\n' "  ${YELLOW}!${NC} $1"; }
fail() { printf '%b\n' "  ${RED}✗${NC} $1"; exit 1; }
dim()  { printf '%b\n' "  ${DIM}$1${NC}"; }

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
  dim "      Hosted at https://app.tandemu.dev"
  echo ""
  printf '%b\n' "    ${BOLD}2.${NC} Self-hosted instance"
  dim "      You'll provide the URL"
  echo ""

  read -rp "  Choose (1 or 2): " choice
  case "$choice" in
    1)
      API_URL="https://app.tandemu.dev"
      ;;
    2)
      echo ""
      read -rp "  Enter your Tandemu URL (e.g., https://tandemu.company.com): " API_URL
      # Strip trailing slash
      API_URL="${API_URL%/}"
      ;;
    *)
      API_URL="https://app.tandemu.dev"
      ;;
  esac

  # Verify the instance is reachable
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

  # Open browser
  if command -v open &>/dev/null; then
    open "$AUTH_URL" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$AUTH_URL" 2>/dev/null || true
  fi

  # Poll for authorization
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

  # Get user info
  ME_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/auth/me" 2>/dev/null)
  USER_ID=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['id'])" 2>/dev/null)
  USER_EMAIL=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['email'])" 2>/dev/null)
  USER_NAME=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['name'])" 2>/dev/null)

  # Get organizations (first one if exists)
  ORGS_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations" 2>/dev/null)
  ORG_COUNT=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")

  ORG_ID=""
  ORG_NAME=""
  TEAM_ID=""
  TEAM_NAME=""

  if [ "$ORG_COUNT" -gt 0 ]; then
    ORG_ID=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
    ORG_NAME=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null)

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
  mkdir -p "$TANDEMU_DATA_DIR"

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
  SETTINGS_FILE="$CLAUDE_DIR/settings.json"
  OTEL_HOST=$(echo "$API_URL" | sed 's|https\?://||' | sed 's|:.*||')
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
    "OTEL_RESOURCE_ATTRIBUTES": "organization_id=${ORG_ID}"
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
with open(settings_file, "w") as f:
    json.dump(settings, f, indent=2)
PYEOF
  ok "Telemetry: enabled (→ ${OTEL_ENDPOINT})"

  # 3. ~/.claude.json — OpenMemory MCP server
  step "Configuring memory server..."
  MCP_FILE="$HOME/.claude.json"
  MEM0_URL="http://${OTEL_HOST}:8765"

  python3 << PYEOF
import json, os
mcp_file = os.path.expanduser("~/.claude.json")
try:
    with open(mcp_file) as f:
        config = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    config = {}
servers = config.get("mcpServers", {})
servers["tandemu-memory"] = {
    "type": "url",
    "url": "${MEM0_URL}/mcp/tandemu/sse/${USER_ID}"
}
config["mcpServers"] = servers
with open(mcp_file, "w") as f:
    json.dump(config, f, indent=2)
PYEOF
  ok "Memory: enabled (→ ${MEM0_URL})"
}

# ─────────────────────────────────────────────────────────
# Install skills + MCP server
# ─────────────────────────────────────────────────────────

install_assets() {
  mkdir -p "$SKILLS_DIR"
  mkdir -p "$TANDEMU_DATA_DIR"

  step "Downloading Tandemu skills and MCP server..."

  local skills_src=""
  local mcp_src=""

  if [ -d "${SCRIPT_DIR}/apps/claude-plugins/skills" ]; then
    # Running from the repo directly
    skills_src="${SCRIPT_DIR}/apps/claude-plugins/skills"
    mcp_src="${SCRIPT_DIR}/apps/mcp-server"
  else
    # Download from release
    # TODO: implement release artifact download
    fail "Release download not yet implemented. Run install.sh from the Tandemu repo directory."
  fi

  # Install skills (skip /tandemu — its logic is in this script)
  for skill_dir in "$skills_src"/*/; do
    local skill_name
    skill_name=$(basename "$skill_dir")
    [ "$skill_name" = "tandemu" ] && continue
    rm -rf "$SKILLS_DIR/$skill_name"
    cp -r "$skill_dir" "$SKILLS_DIR/$skill_name"
  done

  # Copy CLAUDE.md to user's global claude dir
  if [ -f "${SCRIPT_DIR}/apps/claude-plugins/CLAUDE.md" ]; then
    cp "${SCRIPT_DIR}/apps/claude-plugins/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
    ok "CLAUDE.md installed (personality + memory)"
  fi

  local count
  count=$(ls -1d "$SKILLS_DIR"/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')
  ok "$count skills installed"

  ok "Memory server: OpenMemory MCP (connects to Tandemu instance)"
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
  printf '%b\n' "    ${GREEN}/blockers${NC}  — See what's slowing the team down"
  echo ""
  printf '%b\n' "  ${BOLD}Re-authenticate:${NC}"
  dim "    Run this script again"
  echo ""
}

# ─────────────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────────────

NONINTERACTIVE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) API_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; NONINTERACTIVE="true"; shift 2 ;;
    --skip-prereqs) SKIP_PREREQS="true"; shift ;;
    *) shift ;;
  esac
done

# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────

main() {
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
    # Non-interactive: token provided, fetch user info directly
    step "Using provided token..."
    ME_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/auth/me" 2>/dev/null) || {
      fail "Token is invalid or API is unreachable."
    }
    USER_ID=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['id'])" 2>/dev/null)
    USER_EMAIL=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['email'])" 2>/dev/null)
    USER_NAME=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['name'])" 2>/dev/null)

    ORGS_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations" 2>/dev/null)
    ORG_COUNT=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")
    ORG_ID=""; ORG_NAME=""; TEAM_ID=""; TEAM_NAME=""

    if [ "$ORG_COUNT" -gt 0 ]; then
      ORG_ID=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
      ORG_NAME=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null)
      TEAMS_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations/${ORG_ID}/teams" 2>/dev/null)
      TEAM_COUNT=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")
      if [ "$TEAM_COUNT" -gt 0 ]; then
        TEAM_ID=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
        TEAM_NAME=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null)
      fi
    fi
    ok "Authorized as ${USER_NAME} (${USER_EMAIL})"
  else
    do_oauth
  fi

  write_configs
  install_assets
  print_done

}

main "$@"
