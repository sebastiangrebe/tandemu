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
#    --target <t>      claude | opencode | cursor | codex | all
#                      (comma-separated for multiple; "both" = claude+opencode)
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

OPENCODE_DIR="$HOME/.config/opencode"
TANDEMU_OPENCODE_DIR="$HOME/.config/tandemu"
OPENCODE_VERSION_FILE="$TANDEMU_OPENCODE_DIR/version.txt"

# Lightweight targets (skill-based, no plugin packaging)
CURSOR_DIR="$HOME/.cursor"
CURSOR_VERSION_FILE="$HOME/.config/tandemu/cursor-version.txt"
CODEX_DIR="$HOME/.codex"
CODEX_VERSION_FILE="$HOME/.config/tandemu/codex-version.txt"

# Universal Tandemu config dir (shared across all agents)
TANDEMU_CONFIG_DIR="$HOME/.config/tandemu"
TANDEMU_LIB_DIR="$TANDEMU_CONFIG_DIR/lib"
TANDEMU_TASKS_DIR="$TANDEMU_CONFIG_DIR/active-tasks"

# TARGETS is set by detect_targets() or --target flag. Space-separated list.
TARGETS=""

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

# Canonicalize API response: wrap flat payloads as {success:true, data:<payload>}
# so downstream parsers can always access ['data'][...] regardless of whether
# the backend's TransformInterceptor was applied.
ensure_wrapped() {
  python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print('{\"success\": false, \"data\": null}')
    sys.exit(0)
if isinstance(d, dict) and d.get('success') is True and 'data' in d:
    print(json.dumps(d))
else:
    print(json.dumps({'success': True, 'data': d}))
" 2>/dev/null || echo '{"success": false, "data": null}'
}

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
  rm -f "$CLAUDE_DIR"/tandemu-active-task*.json
  rm -f "$CLAUDE_DIR/tandemu-memory-index-"*.md
  # Clean up memory index from Claude's memory folders
  find "$CLAUDE_DIR/projects" -name "tandemu-index.md" -delete 2>/dev/null || true
  rm -f "$VERSION_FILE"
  ok "Config removed"

  # Remove skills
  for skill in morning finish pause create standup setup; do
    rm -rf "$SKILLS_DIR/$skill"
  done
  ok "Skills removed"

  # Remove shared lib
  rm -f "$CLAUDE_DIR/lib/tandemu-env.sh"
  rm -f "$CLAUDE_DIR/lib/tandemu-session-start.sh"
  ok "Shared lib removed"

  # Remove CLAUDE.md if it's Tandemu's, or strip personality section if user has custom content
  if [ -f "$CLAUDE_DIR/CLAUDE.md" ]; then
    if grep -q "Tandemu AI Teammate" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null; then
      rm -f "$CLAUDE_DIR/CLAUDE.md"
      ok "CLAUDE.md removed"
    elif grep -qF "<!-- tandemu:personality:start -->" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null; then
      # User has their own CLAUDE.md with a Tandemu personality section — strip just that section
      python3 -c "
import re
f = '$CLAUDE_DIR/CLAUDE.md'
text = open(f).read()
text = re.sub(r'<!-- tandemu:personality:start -->.*?<!-- tandemu:personality:end -->\n*', '', text, flags=re.DOTALL)
open(f, 'w').write(text.strip() + '\n')
"
      ok "Personality section removed from CLAUDE.md"
    fi
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

  # Clean OpenCode side
  if [ -f "$OPENCODE_DIR/opencode.json" ]; then
    python3 << 'PYEOF'
import json, os
cfg_file = os.path.expanduser("~/.config/opencode/opencode.json")
try:
    with open(cfg_file) as f:
        cfg = json.load(f)
    plugins = cfg.get("plugin", [])
    cfg["plugin"] = [p for p in plugins if "tandemu" not in (p if isinstance(p, str) else p[0])]
    if not cfg["plugin"]:
        del cfg["plugin"]
    mcp = cfg.get("mcp", {})
    mcp.pop("tandemu-memory", None)
    if mcp:
        cfg["mcp"] = mcp
    elif "mcp" in cfg:
        del cfg["mcp"]
    with open(cfg_file, "w") as f:
        json.dump(cfg, f, indent=2)
except (FileNotFoundError, json.JSONDecodeError):
    pass
PYEOF
    ok "OpenCode config cleaned"
  fi

  if [ -f "$OPENCODE_DIR/AGENTS.md" ]; then
    if grep -q "Tandemu AI Teammate" "$OPENCODE_DIR/AGENTS.md" 2>/dev/null; then
      rm -f "$OPENCODE_DIR/AGENTS.md"
      ok "AGENTS.md removed"
    elif grep -qF "<!-- tandemu:personality:start -->" "$OPENCODE_DIR/AGENTS.md" 2>/dev/null; then
      python3 -c "
import re
f = '$OPENCODE_DIR/AGENTS.md'
text = open(f).read()
text = re.sub(r'<!-- tandemu:personality:start -->.*?<!-- tandemu:personality:end -->\n*', '', text, flags=re.DOTALL)
open(f, 'w').write(text.strip() + '\n')
"
      ok "Personality section removed from AGENTS.md"
    fi
  fi

  for skill in morning finish pause create standup setup; do
    rm -rf "$OPENCODE_DIR/skills/$skill" 2>/dev/null || true
    rm -f "$OPENCODE_DIR/commands/$skill.md" 2>/dev/null || true
  done

  rm -rf "$TANDEMU_OPENCODE_DIR"

  # ── Cursor ──
  if [ -f "$CURSOR_DIR/mcp.json" ]; then
    python3 << 'PYEOF'
import json, os
f = os.path.expanduser("~/.cursor/mcp.json")
try:
    cfg = json.load(open(f))
    s = cfg.get("mcpServers", {})
    s.pop("tandemu", None)
    s.pop("tandemu-memory", None)
    if s:
        cfg["mcpServers"] = s
    elif "mcpServers" in cfg:
        del cfg["mcpServers"]
    if cfg:
        json.dump(cfg, open(f, "w"), indent=2)
    else:
        os.remove(f)
except (FileNotFoundError, json.JSONDecodeError):
    pass
PYEOF
    ok "Cursor MCP cleaned"
  fi
  rm -f "$CURSOR_DIR/rules/tandemu.mdc" 2>/dev/null || true
  for skill in morning finish pause create standup setup; do
    rm -f "$CURSOR_DIR/commands/$skill.md" 2>/dev/null || true
    rm -f "$CODEX_DIR/prompts/$skill.md" 2>/dev/null || true
  done

  # ── Codex CLI ──
  if [ -f "$CODEX_DIR/config.toml" ]; then
    python3 << 'PYEOF'
import os, re
f = os.path.expanduser("~/.codex/config.toml")
try:
    text = open(f).read()
    text = re.sub(
        r"\n?\[mcp_servers\.tandemu(\.[^\]]+)?\][^\[]*",
        "",
        text,
        flags=re.DOTALL,
    ).rstrip()
    if text:
        open(f, "w").write(text + "\n")
    else:
        os.remove(f)
except FileNotFoundError:
    pass
PYEOF
    ok "Codex MCP cleaned"
  fi
  if [ -f "$CODEX_DIR/AGENTS.md" ]; then
    if grep -q "Tandemu AI Teammate" "$CODEX_DIR/AGENTS.md" 2>/dev/null; then
      rm -f "$CODEX_DIR/AGENTS.md"
    elif grep -qF "<!-- tandemu:personality:start -->" "$CODEX_DIR/AGENTS.md" 2>/dev/null; then
      python3 -c "
import re
f = '$CODEX_DIR/AGENTS.md'
text = open(f).read()
text = re.sub(r'<!-- tandemu:personality:start -->.*?<!-- tandemu:personality:end -->\n*', '', text, flags=re.DOTALL)
open(f, 'w').write(text.strip() + '\n')
"
    fi
  fi

  rm -f "$CURSOR_VERSION_FILE" "$CODEX_VERSION_FILE" 2>/dev/null || true
  rm -rf "$TANDEMU_LIB_DIR" "$TANDEMU_TASKS_DIR" 2>/dev/null || true

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
  local latest
  latest=$(get_plugin_version)
  printf '%b\n' "  Available: ${BOLD}${latest}${NC}"
  echo ""

  local any_stale=""
  local any_installed=""

  _check_one() {
    local label="$1" file="$2"
    if [ -f "$file" ]; then
      local v
      v=$(cat "$file")
      printf '%b\n' "  ${label}: ${BOLD}${v}${NC}"
      any_installed="true"
      if [ "$v" != "$latest" ]; then any_stale="true"; fi
    fi
  }

  _check_one "Claude Code" "$VERSION_FILE"
  _check_one "OpenCode   " "$OPENCODE_VERSION_FILE"
  _check_one "Cursor     " "$CURSOR_VERSION_FILE"
  _check_one "Codex      " "$CODEX_VERSION_FILE"

  if [ -z "$any_installed" ]; then
    warn "Tandemu not installed. Run install.sh to install."
  elif [ -n "$any_stale" ]; then
    warn "Update available. Run install.sh to update."
  else
    ok "You're up to date"
  fi
  echo ""
  exit 0
}

# ─────────────────────────────────────────────────────────
# Prerequisites
# ─────────────────────────────────────────────────────────

check_prerequisites() {
  step "Checking prerequisites..."

  local has_any=""
  for cli in claude opencode cursor codex; do
    command -v "$cli" &>/dev/null && has_any="true"
  done

  if [ -z "$has_any" ]; then
    fail "No supported AI agent CLI found (claude, opencode, cursor, codex). Install at least one and re-run."
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
# Target detection / selection
# ─────────────────────────────────────────────────────────

detect_targets() {
  # Honor explicit --target if set.
  if [ -n "${TARGETS:-}" ]; then
    return
  fi

  # Probe each supported agent.
  local found=()
  command -v claude &>/dev/null && found+=("claude")
  command -v opencode &>/dev/null && found+=("opencode")
  command -v cursor &>/dev/null && found+=("cursor")
  command -v codex &>/dev/null && found+=("codex")

  if [ ${#found[@]} -eq 0 ]; then
    fail "No supported AI agent CLI found. Install one of: claude, opencode, cursor, codex."
  fi

  if [ ${#found[@]} -eq 1 ]; then
    TARGETS="${found[0]}"
    return
  fi

  echo ""
  printf '%b\n' "  ${BOLD}Detected AI agents:${NC}"
  echo ""
  local i=1
  for t in "${found[@]}"; do
    case "$t" in
      claude)   printf '%b\n' "    ${BOLD}${i}.${NC} Claude Code" ;;
      opencode) printf '%b\n' "    ${BOLD}${i}.${NC} OpenCode" ;;
      cursor)   printf '%b\n' "    ${BOLD}${i}.${NC} Cursor" ;;
      codex)    printf '%b\n' "    ${BOLD}${i}.${NC} Codex CLI" ;;
    esac
    i=$((i + 1))
  done
  printf '%b\n' "    ${BOLD}a.${NC} All of the above"
  echo ""
  read -rp "  Choose (numbers, comma-separated, or 'a' for all): " choice

  if [ "$choice" = "a" ] || [ "$choice" = "A" ]; then
    TARGETS="${found[*]}"
    return
  fi

  TARGETS=""
  IFS=',' read -ra _idxs <<< "$choice"
  for raw in "${_idxs[@]}"; do
    raw="${raw// /}"
    if [[ "$raw" =~ ^[0-9]+$ ]] && [ "$raw" -ge 1 ] && [ "$raw" -le ${#found[@]} ]; then
      TARGETS="${TARGETS:+$TARGETS }${found[$((raw - 1))]}"
    fi
  done

  # Default to first detected if user typed nothing valid.
  if [ -z "$TARGETS" ]; then
    TARGETS="${found[0]}"
  fi
}

target_active() {
  case " $TARGETS " in *" $1 "*) return 0 ;; *) return 1 ;; esac
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

  RAW_RESPONSE=$(curl -sf -X POST "${API_URL}/api/auth/cli/initiate" -H "Content-Type: application/json" 2>/dev/null) || {
    fail "Could not reach Tandemu API at ${API_URL}."
  }
  RESPONSE=$(echo "$RAW_RESPONSE" | ensure_wrapped)

  CODE=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['code'])" 2>/dev/null) || CODE=""
  AUTH_URL=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['url'])" 2>/dev/null) || AUTH_URL=""

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
    POLL_RAW=$(curl -sf "${API_URL}/api/auth/cli/status?code=${CODE}" 2>/dev/null) || POLL_RAW=""
    POLL_RESPONSE=$(echo "$POLL_RAW" | ensure_wrapped)
    STATUS=$(echo "$POLL_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "pending")

    if [ "$STATUS" = "authorized" ]; then
      TOKEN=$(echo "$POLL_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null) || TOKEN=""
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
  ME_RAW=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/auth/me" 2>/dev/null) || ME_RAW=""
  ME_RESPONSE=$(echo "$ME_RAW" | ensure_wrapped)
  USER_ID=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['id'])" 2>/dev/null) || USER_ID=""
  USER_EMAIL=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['email'])" 2>/dev/null) || USER_EMAIL=""
  USER_NAME=$(echo "$ME_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['user']; print(d['name'])" 2>/dev/null) || USER_NAME=""

  ORGS_RAW=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations" 2>/dev/null) || ORGS_RAW=""
  ORGS_RESPONSE=$(echo "$ORGS_RAW" | ensure_wrapped)
  ORG_COUNT=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")

  ORG_ID=""
  ORG_NAME=""
  TEAM_ID=""
  TEAM_NAME=""

  if [ "$ORG_COUNT" -eq 1 ]; then
    ORG_ID=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null) || ORG_ID=""
    ORG_NAME=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null) || ORG_NAME=""
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
    ORG_ID=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][$idx]['id'])" 2>/dev/null) || ORG_ID=""
    ORG_NAME=$(echo "$ORGS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][$idx]['name'])" 2>/dev/null) || ORG_NAME=""

    # Switch token to the chosen org
    SWITCH_RAW=$(curl -sf -X POST "${API_URL}/api/auth/switch-org" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"organizationId": "'"$ORG_ID"'"}' 2>/dev/null) || SWITCH_RAW=""
    SWITCH_RESPONSE=$(echo "$SWITCH_RAW" | ensure_wrapped)
    NEW_TOKEN=$(echo "$SWITCH_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken') or d.get('accessToken',''))" 2>/dev/null) || NEW_TOKEN=""
    if [ -n "$NEW_TOKEN" ]; then
      TOKEN="$NEW_TOKEN"
      ok "Switched to ${ORG_NAME}"
    else
      warn "Could not switch org — using default"
    fi
  fi

  if [ -n "$ORG_ID" ]; then
    TEAMS_RAW=$(curl -sf -H "Authorization: Bearer $TOKEN" "${API_URL}/api/organizations/${ORG_ID}/teams" 2>/dev/null) || TEAMS_RAW=""
    TEAMS_RESPONSE=$(echo "$TEAMS_RAW" | ensure_wrapped)
    TEAM_COUNT=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null || echo "0")

    if [ "$TEAM_COUNT" -gt 0 ]; then
      TEAM_ID=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null) || TEAM_ID=""
      TEAM_NAME=$(echo "$TEAMS_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['name'])" 2>/dev/null) || TEAM_NAME=""
    fi
  fi
}

# ─────────────────────────────────────────────────────────
# Write configuration files
# ─────────────────────────────────────────────────────────

configure_claude() {
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
    "mcp__tandemu-memory",
]
for p in tandemu_perms:
    if p not in allow:
        allow.append(p)
perms["allow"] = allow
settings["permissions"] = perms

# SessionStart hook: updates personality in ~/.claude/CLAUDE.md (global) and outputs repo memory index
api_url = f"{api_host}:3001"
hooks = settings.get("hooks", {})
hooks["SessionStart"] = [
    {
        "matcher": "startup",
        "hooks": [
            {
                "type": "command",
                "command": "bash ~/.claude/lib/tandemu-session-start.sh",
                "timeout": 15
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

  MEM_CONFIG=$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/memory/config" 2>/dev/null) || MEM_CONFIG=""
  if [ -n "$MEM_CONFIG" ]; then
    MEM_TYPE=$(echo "$MEM_CONFIG" | python3 -c "import json,sys; d=json.load(sys.stdin); d=d.get('data',d) if isinstance(d,dict) and 'data' in d else d; print(d.get('type',''))" 2>/dev/null) || MEM_TYPE=""
    MEM_URL=$(echo "$MEM_CONFIG" | python3 -c "import json,sys; d=json.load(sys.stdin); d=d.get('data',d) if isinstance(d,dict) and 'data' in d else d; print(d.get('url',''))" 2>/dev/null) || MEM_URL=""

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
# OpenCode target: write auth, deep-merge opencode.json, AGENTS.md
# ─────────────────────────────────────────────────────────

configure_opencode() {
  mkdir -p "$TANDEMU_OPENCODE_DIR"
  mkdir -p "$OPENCODE_DIR"

  # 1. ~/.config/tandemu/auth.json — credentials read by the OpenCode plugin
  step "Writing Tandemu config (OpenCode)..."
  cat > "$TANDEMU_OPENCODE_DIR/auth.json" << EOF
{
  "auth": { "token": "${TOKEN}" },
  "user": { "id": "${USER_ID}", "email": "${USER_EMAIL}", "name": "${USER_NAME}" },
  "organization": { "id": "${ORG_ID}", "name": "${ORG_NAME}" },
  "team": { "id": "${TEAM_ID}", "name": "${TEAM_NAME}" },
  "teams": [{ "id": "${TEAM_ID}", "name": "${TEAM_NAME}" }],
  "api": { "url": "${API_URL}" }
}
EOF
  ok "Config: ~/.config/tandemu/auth.json"

  # 2. Memory MCP URL from API
  step "Configuring memory server (OpenCode)..."
  local mem_type="" mem_url=""
  local mem_config
  mem_config=$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/memory/config" 2>/dev/null || true)
  if [ -n "$mem_config" ]; then
    mem_type=$(echo "$mem_config" | python3 -c "import json,sys; d=json.load(sys.stdin); d=d.get('data',d) if isinstance(d,dict) and 'data' in d else d; print(d.get('type',''))" 2>/dev/null) || mem_type=""
    mem_url=$(echo "$mem_config" | python3 -c "import json,sys; d=json.load(sys.stdin); d=d.get('data',d) if isinstance(d,dict) and 'data' in d else d; print(d.get('url',''))" 2>/dev/null) || mem_url=""
  fi

  # 3. Deep-merge opencode.json: plugin entry + mcp.tandemu-memory + permissions
  TANDEMU_TOKEN="$TOKEN" \
  TANDEMU_MEM_TYPE="$mem_type" \
  TANDEMU_MEM_URL="$mem_url" \
  python3 << 'PYEOF'
import json, os
cfg_file = os.path.expanduser("~/.config/opencode/opencode.json")
try:
    with open(cfg_file) as f:
        cfg = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    cfg = {}

cfg.setdefault("$schema", "https://opencode.ai/config.json")

plugins = cfg.get("plugin", [])
# Drop legacy plugin name (renamed in 0.4.1)
plugins = [p for p in plugins if p != "@tandemu/opencode-plugin"]
if "@sebastiangrebe/opencode-plugin" not in plugins:
    plugins.append("@sebastiangrebe/opencode-plugin")
cfg["plugin"] = plugins

mem_type = os.environ.get("TANDEMU_MEM_TYPE", "")
mem_url = os.environ.get("TANDEMU_MEM_URL", "")
token = os.environ.get("TANDEMU_TOKEN", "")
if mem_type and mem_url and token:
    mcp = cfg.get("mcp", {})
    # OpenCode expects "local" (stdio) or "remote" (http). Tandemu memory is HTTP.
    # Bake token into headers — opencode's MCP HTTP client doesn't read shell-env
    # hook output, and `{env:...}` interpolation needs the var set in opencode's
    # process env (not reliable across launchers). Token is no more sensitive
    # than ~/.config/tandemu/auth.json, which already lives next to this file.
    # Disable OAuth probing — server uses static bearer auth, not OAuth.
    mcp["tandemu-memory"] = {
        "type": "remote",
        "url": mem_url,
        "headers": {
            "Authorization": f"Bearer {token}"
        },
        "enabled": True,
        "oauth": False,
    }
    cfg["mcp"] = mcp

with open(cfg_file, "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF
  if [ -n "$mem_url" ]; then
    ok "Memory: enabled (→ $mem_url)"
  else
    warn "Could not fetch memory config — memory MCP not configured"
  fi
  ok "OpenCode config merged: ~/.config/opencode/opencode.json"

  # 4. AGENTS.md — write personality file with markers (plugin updates it on session start)
  step "Installing personality file..."
  local agents_md="$OPENCODE_DIR/AGENTS.md"
  local repo_agents="${SCRIPT_DIR}/apps/skills/AGENTS.md"
  if [ -f "$repo_agents" ]; then
    if [ -f "$agents_md" ] && ! grep -qF "Tandemu AI Teammate" "$agents_md" 2>/dev/null; then
      # User already has a custom AGENTS.md — only add personality markers if missing
      if ! grep -qF "<!-- tandemu:personality:start -->" "$agents_md" 2>/dev/null; then
        printf '\n<!-- tandemu:personality:start -->\n<!-- tandemu:personality:end -->\n' >> "$agents_md"
      fi
    else
      cp "$repo_agents" "$agents_md"
    fi
    ok "AGENTS.md installed"
  else
    warn "Source AGENTS.md not found at $repo_agents — skipping"
  fi
}

# ─────────────────────────────────────────────────────────
# Install skills + shared lib
# ─────────────────────────────────────────────────────────

install_assets_claude() {
  step "Installing shared config loader (Claude Code)..."

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

  # Track installed plugin version for --check
  local plugin_manifest="${skills_src}/.claude-plugin/plugin.json"
  if [ -f "$plugin_manifest" ]; then
    python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$plugin_manifest" \
      > "$VERSION_FILE" 2>/dev/null || true
  fi
}

install_assets_opencode() {
  step "Installing skills and commands (OpenCode)..."

  local skills_src="${SCRIPT_DIR}/apps/skills"
  local plugin_src="${SCRIPT_DIR}/apps/opencode-plugin"
  if [ ! -d "$skills_src" ] || [ ! -d "$plugin_src" ]; then
    fail "Run install.sh from the Tandemu repo directory."
  fi

  # Install skills into ~/.config/opencode/skills/
  mkdir -p "$OPENCODE_DIR/skills"
  for skill in morning finish pause create standup setup; do
    if [ -d "$skills_src/$skill" ]; then
      mkdir -p "$OPENCODE_DIR/skills/$skill"
      cp "$skills_src/$skill/SKILL.md" "$OPENCODE_DIR/skills/$skill/SKILL.md"
    fi
  done
  ok "Skills installed → $OPENCODE_DIR/skills/"

  # Install command shims into ~/.config/opencode/commands/
  mkdir -p "$OPENCODE_DIR/commands"
  if [ -d "$plugin_src/files/commands" ]; then
    cp "$plugin_src/files/commands"/*.md "$OPENCODE_DIR/commands/" 2>/dev/null || true
    ok "Commands installed → $OPENCODE_DIR/commands/"
  fi

  # Track installed version
  local plugin_manifest="${SCRIPT_DIR}/apps/opencode-plugin/package.json"
  if [ -f "$plugin_manifest" ]; then
    python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$plugin_manifest" \
      > "$OPENCODE_VERSION_FILE" 2>/dev/null || true
  fi
}

# ─────────────────────────────────────────────────────────
# Shared helpers for lightweight (MCP-first) targets
# ─────────────────────────────────────────────────────────

# Drop the canonical AGENTS.md template at the given path. If the destination
# already has user content, only ensure that the personality markers exist so
# session-start hooks can update the section in-place. Idempotent.
write_agents_md() {
  local dest="$1"
  local repo_agents="${SCRIPT_DIR}/apps/skills/AGENTS.md"
  if [ ! -f "$repo_agents" ]; then
    warn "Source AGENTS.md not found at $repo_agents — skipping"
    return 1
  fi
  mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ] && ! grep -qF "Tandemu AI Teammate" "$dest" 2>/dev/null; then
    if ! grep -qF "<!-- tandemu:personality:start -->" "$dest" 2>/dev/null; then
      printf '\n<!-- tandemu:personality:start -->\n<!-- tandemu:personality:end -->\n' >> "$dest"
    fi
  else
    cp "$repo_agents" "$dest"
  fi
}

# Install universal env loader + tasks dir at ~/.config/tandemu/. Skills source
# this loader to read auth from whichever per-agent config file exists. Active
# task files also live here so skills work identically across agents.
install_universal_lib() {
  step "Installing universal config loader..."
  mkdir -p "$TANDEMU_LIB_DIR" "$TANDEMU_TASKS_DIR"
  # Skills still write task files at ~/.claude/tandemu-active-task-*.json for
  # back-compat with existing installs. Ensure the dir exists on all targets.
  mkdir -p "$HOME/.claude" 2>/dev/null || true
  cat > "$TANDEMU_LIB_DIR/tandemu-env.sh" << 'LOADER_EOF'
#!/bin/sh
# Tandemu env loader — sourced by skills. Probes per-agent auth files in order
# until one is found, then exports TANDEMU_* env vars for the calling shell.

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
  echo "ERROR: Tandemu not configured. Run install.sh to set up." >&2
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
LOADER_EOF
  chmod 644 "$TANDEMU_LIB_DIR/tandemu-env.sh"
  ok "Loader installed: ~/.config/tandemu/lib/tandemu-env.sh"
}

# Copy the daily-use SKILL.md files into <commands_dir>/<name>.md verbatim.
# Used by Cursor + Codex install paths so /morning, /finish etc. fire as
# native slash commands the same way they do on Claude Code + OpenCode.
# `setup` is deliberately excluded — it writes Claude-only state
# (~/.claude/settings.json, CLAUDE.md, SessionStart hooks, ~/.mcp.json
# migration) and would corrupt a real Claude install if run elsewhere.
install_skills_to() {
  local dest_dir="$1"
  local skills_src="${SCRIPT_DIR}/apps/skills"
  if [ ! -d "$skills_src" ]; then
    warn "Source skills dir not found at $skills_src — skipping"
    return 1
  fi
  mkdir -p "$dest_dir"
  for skill in morning finish pause create standup; do
    if [ -f "$skills_src/$skill/SKILL.md" ]; then
      cp "$skills_src/$skill/SKILL.md" "$dest_dir/$skill.md"
    fi
  done
}

# Resolve the combined Tandemu MCP URL from the backend (handles SaaS/self-host).
# Sets $TANDEMU_MCP_URL. Falls back to ${API_URL}/api/memory/mcp on error.
fetch_mcp_url() {
  local cfg
  cfg=$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/memory/config" 2>/dev/null || true)
  TANDEMU_MCP_URL=""
  if [ -n "$cfg" ]; then
    TANDEMU_MCP_URL=$(echo "$cfg" | python3 -c "import json,sys
d=json.load(sys.stdin)
d=d.get('data',d) if isinstance(d,dict) and 'data' in d else d
print(d.get('url',''))" 2>/dev/null) || TANDEMU_MCP_URL=""
  fi
  if [ -z "$TANDEMU_MCP_URL" ]; then
    TANDEMU_MCP_URL="${API_URL}/api/memory/mcp"
  fi
}

# ─────────────────────────────────────────────────────────
# Cursor target: register MCP server + drop AGENTS.md / rules
# ─────────────────────────────────────────────────────────

configure_cursor() {
  mkdir -p "$CURSOR_DIR" "$HOME/.config/tandemu"

  step "Writing Tandemu config (Cursor)..."
  cat > "$HOME/.config/tandemu/cursor-auth.json" << EOF
{
  "auth": { "token": "${TOKEN}" },
  "user": { "id": "${USER_ID}", "email": "${USER_EMAIL}", "name": "${USER_NAME}" },
  "organization": { "id": "${ORG_ID}", "name": "${ORG_NAME}" },
  "team": { "id": "${TEAM_ID}", "name": "${TEAM_NAME}" },
  "api": { "url": "${API_URL}" }
}
EOF
  ok "Config: ~/.config/tandemu/cursor-auth.json"

  step "Configuring Tandemu MCP (Cursor)..."
  fetch_mcp_url

  TANDEMU_TOKEN="$TOKEN" \
  TANDEMU_MCP_URL="$TANDEMU_MCP_URL" \
  python3 << 'PYEOF'
import json, os
cfg_file = os.path.expanduser("~/.cursor/mcp.json")
try:
    with open(cfg_file) as f:
        cfg = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    cfg = {}
servers = cfg.get("mcpServers", {})
servers["tandemu"] = {
    "url": os.environ["TANDEMU_MCP_URL"],
    "headers": {"Authorization": f"Bearer {os.environ['TANDEMU_TOKEN']}"},
}
cfg["mcpServers"] = servers
with open(cfg_file, "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF
  ok "MCP: enabled (→ ${TANDEMU_MCP_URL})"
}

install_assets_cursor() {
  step "Installing personality + rules + skills (Cursor)..."

  # Global rule mirrors AGENTS.md content. Cursor reads .mdc rules from
  # ~/.cursor/rules/ globally and from <project>/.cursor/rules/ per-project.
  mkdir -p "$CURSOR_DIR/rules"
  write_agents_md "$CURSOR_DIR/rules/tandemu.mdc" || true
  ok "Rule installed: ~/.cursor/rules/tandemu.mdc"

  # Slash commands. Cursor reads custom commands from ~/.cursor/commands/.
  install_skills_to "$CURSOR_DIR/commands"
  ok "Skills installed → ~/.cursor/commands/ (/morning, /finish, /pause, /create, /standup, /setup)"

  local v
  v=$(get_plugin_version)
  mkdir -p "$(dirname "$CURSOR_VERSION_FILE")"
  echo "$v" > "$CURSOR_VERSION_FILE"
}

# ─────────────────────────────────────────────────────────
# Codex CLI target: skills + AGENTS.md + universal lib
# ─────────────────────────────────────────────────────────

configure_codex() {
  mkdir -p "$CODEX_DIR" "$HOME/.config/tandemu"

  step "Writing Tandemu config (Codex CLI)..."
  cat > "$HOME/.config/tandemu/codex-auth.json" << EOF
{
  "auth": { "token": "${TOKEN}" },
  "user": { "id": "${USER_ID}", "email": "${USER_EMAIL}", "name": "${USER_NAME}" },
  "organization": { "id": "${ORG_ID}", "name": "${ORG_NAME}" },
  "team": { "id": "${TEAM_ID}", "name": "${TEAM_NAME}" },
  "api": { "url": "${API_URL}" }
}
EOF
  ok "Config: ~/.config/tandemu/codex-auth.json"

  step "Configuring Tandemu MCP (Codex CLI)..."
  fetch_mcp_url

  # Codex reads ~/.codex/config.toml. Merge a [mcp_servers.tandemu] entry,
  # preserving any other servers and unrelated config the user has set.
  TANDEMU_TOKEN="$TOKEN" \
  TANDEMU_MCP_URL="$TANDEMU_MCP_URL" \
  python3 << 'PYEOF'
import os, re

cfg_file = os.path.expanduser("~/.codex/config.toml")
url = os.environ["TANDEMU_MCP_URL"]
token = os.environ["TANDEMU_TOKEN"]

block = (
    "\n[mcp_servers.tandemu]\n"
    f'url = "{url}"\n'
    "[mcp_servers.tandemu.headers]\n"
    f'Authorization = "Bearer {token}"\n'
)

text = ""
if os.path.exists(cfg_file):
    with open(cfg_file) as f:
        text = f.read()

# Strip existing tandemu sections so re-running stays idempotent.
text = re.sub(
    r"\n?\[mcp_servers\.tandemu(\.[^\]]+)?\][^\[]*",
    "",
    text,
    flags=re.DOTALL,
).rstrip()

text = (text + "\n" + block) if text else block.lstrip()

with open(cfg_file, "w") as f:
    f.write(text)
PYEOF
  ok "MCP: enabled (→ ${TANDEMU_MCP_URL})"
}

install_assets_codex() {
  step "Installing personality + skills (Codex CLI)..."
  write_agents_md "$CODEX_DIR/AGENTS.md" || true
  ok "AGENTS.md installed: ~/.codex/AGENTS.md"

  # Slash commands. Codex CLI reads custom prompts from ~/.codex/prompts/.
  install_skills_to "$CODEX_DIR/prompts"
  ok "Skills installed → ~/.codex/prompts/ (/morning, /finish, /pause, /create, /standup, /setup)"

  local v
  v=$(get_plugin_version)
  mkdir -p "$(dirname "$CODEX_VERSION_FILE")"
  echo "$v" > "$CODEX_VERSION_FILE"
}

# ─────────────────────────────────────────────────────────
# Per-target dispatchers
# ─────────────────────────────────────────────────────────

write_configs() {
  if target_active claude; then configure_claude; fi
  if target_active opencode; then configure_opencode; fi
  if target_active cursor; then configure_cursor; fi
  if target_active codex; then configure_codex; fi
}

install_assets() {
  install_universal_lib
  if target_active claude; then install_assets_claude; fi
  if target_active opencode; then install_assets_opencode; fi
  if target_active cursor; then install_assets_cursor; fi
  if target_active codex; then install_assets_codex; fi
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
  if target_active claude; then
    printf '%b\n' "    ${GREEN}\$ claude${NC}        ${DIM}# slash commands: /morning /finish /pause /standup${NC}"
  fi
  if target_active opencode; then
    printf '%b\n' "    ${GREEN}\$ opencode${NC}      ${DIM}# slash commands: /morning /finish /pause /standup${NC}"
  fi
  if target_active cursor; then
    printf '%b\n' "    ${GREEN}\$ cursor .${NC}      ${DIM}# slash commands: /morning /finish /pause /standup${NC}"
  fi
  if target_active codex; then
    printf '%b\n' "    ${GREEN}\$ codex${NC}         ${DIM}# slash commands: /morning /finish /pause /standup${NC}"
  fi
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
    --url=*) API_URL="${1#*=}"; shift ;;
    --token) TOKEN="$2"; NONINTERACTIVE="true"; shift 2 ;;
    --token=*) TOKEN="${1#*=}"; NONINTERACTIVE="true"; shift ;;
    --target|--target=*)
      if [ "$1" = "--target" ]; then
        target_val="$2"; shift 2
      else
        target_val="${1#*=}"; shift
      fi
      # Accept comma-separated list ("cursor,codex") or single value.
      # Special tokens: "both" (legacy alias for claude+opencode), "all".
      case "$target_val" in
        all) TARGETS="claude opencode cursor codex" ;;
        both) TARGETS="claude opencode" ;;
        *)
          IFS=',' read -ra _t_arr <<< "$target_val"
          TARGETS=""
          for t in "${_t_arr[@]}"; do
            t="${t// /}"
            case "$t" in
              claude|opencode|cursor|codex)
                TARGETS="${TARGETS:+$TARGETS }$t"
                ;;
              *)
                fail "Invalid --target: $t (expected: claude|opencode|cursor|codex|all|both)"
                ;;
            esac
          done
          ;;
      esac
      ;;
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

  detect_targets
  step "Installing for: ${TARGETS}"

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
