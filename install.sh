#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  Tandem Installer
#  Usage: curl -fsSL https://tandem.dev/install.sh | bash
# ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

TANDEM_DIR="${TANDEM_DIR:-$HOME/.tandem}"
TANDEM_REPO="https://github.com/anthropics/tandem.git"
CLAUDE_DIR="$HOME/.claude"
SKILLS_DIR="$CLAUDE_DIR/skills"

# ─────────────────────────────────────────────────────────

header() {
  echo ""
  echo -e "${BOLD}  ┌─────────────────────────────────┐${NC}"
  echo -e "${BOLD}  │                                   │${NC}"
  echo -e "${BOLD}  │      ${BLUE}Tandem${NC}${BOLD} — AI Teammate        │${NC}"
  echo -e "${BOLD}  │                                   │${NC}"
  echo -e "${BOLD}  └─────────────────────────────────┘${NC}"
  echo ""
}

step() { echo -e "  ${BLUE}→${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
dim()  { echo -e "  ${DIM}$1${NC}"; }

# ─────────────────────────────────────────────────────────
# Prerequisites
# ─────────────────────────────────────────────────────────

check_prerequisites() {
  step "Checking prerequisites..."

  local missing=()

  if ! command -v git &>/dev/null; then
    missing+=("git")
  fi

  if ! command -v docker &>/dev/null; then
    missing+=("docker")
  fi

  if ! command -v docker compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
    missing+=("docker compose")
  fi

  if ! command -v claude &>/dev/null; then
    missing+=("claude (Claude Code CLI)")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo ""
    fail "Missing required tools: ${missing[*]}"
  fi

  # Check Docker is running
  if ! docker info &>/dev/null; then
    fail "Docker is not running. Please start Docker and try again."
  fi

  ok "All prerequisites found"
}

# ─────────────────────────────────────────────────────────
# Clone or update repo
# ─────────────────────────────────────────────────────────

setup_repo() {
  if [ -d "$TANDEM_DIR" ]; then
    step "Updating existing Tandem installation..."
    cd "$TANDEM_DIR"
    git pull --quiet origin main 2>/dev/null || warn "Could not pull latest — using existing version"
    ok "Tandem updated at $TANDEM_DIR"
  else
    step "Cloning Tandem..."
    git clone --quiet "$TANDEM_REPO" "$TANDEM_DIR" 2>/dev/null || {
      # If the repo doesn't exist yet (pre-release), create from local if available
      if [ -d "$(dirname "$0")/apps" ]; then
        step "Copying from local source..."
        cp -r "$(dirname "$0")" "$TANDEM_DIR"
      else
        fail "Could not clone Tandem repository. Check your network connection."
      fi
    }
    ok "Tandem cloned to $TANDEM_DIR"
  fi

  cd "$TANDEM_DIR"
}

# ─────────────────────────────────────────────────────────
# Start services
# ─────────────────────────────────────────────────────────

start_services() {
  step "Starting Tandem services with Docker Compose..."
  dim "This may take a few minutes on first run (downloading images + building)..."
  echo ""

  if docker compose up --build -d 2>&1 | while IFS= read -r line; do
    # Show progress dots instead of full build output
    case "$line" in
      *"Started"*|*"Running"*|*"Created"*|*"Healthy"*)
        echo -ne "${DIM}  .${NC}"
        ;;
    esac
  done; then
    echo ""
    ok "All services started"
  else
    echo ""
    fail "Failed to start services. Run 'cd $TANDEM_DIR && docker compose up --build' to see errors."
  fi

  # Wait for health
  step "Waiting for services to be ready..."
  local retries=30
  while [ $retries -gt 0 ]; do
    if curl -sf http://localhost:3001/api/health &>/dev/null; then
      break
    fi
    sleep 2
    retries=$((retries - 1))
  done

  if [ $retries -eq 0 ]; then
    fail "Services did not become healthy. Check: docker compose -f $TANDEM_DIR/docker-compose.yml ps"
  fi

  ok "Backend ready at http://localhost:3001"
  ok "Dashboard ready at http://localhost:3000"
}

# ─────────────────────────────────────────────────────────
# Apply database migrations
# ─────────────────────────────────────────────────────────

apply_migrations() {
  step "Applying database migrations..."

  for migration in "$TANDEM_DIR"/packages/database/src/migrations/*.sql; do
    if [ -f "$migration" ]; then
      docker exec -i tandem-postgres-1 psql -U tandem -d tandem < "$migration" 2>/dev/null || true
    fi
  done

  ok "Database migrations applied"
}

# ─────────────────────────────────────────────────────────
# Install skills globally
# ─────────────────────────────────────────────────────────

install_skills() {
  step "Installing Tandem skills for Claude Code..."

  mkdir -p "$SKILLS_DIR"

  local skills_src="$TANDEM_DIR/apps/claude-plugins/skills"

  if [ ! -d "$skills_src" ]; then
    warn "Skills directory not found at $skills_src — skipping"
    return
  fi

  for skill_dir in "$skills_src"/*/; do
    local skill_name
    skill_name=$(basename "$skill_dir")
    local target="$SKILLS_DIR/$skill_name"

    # Remove old version if exists
    rm -rf "$target"

    # Copy skill
    cp -r "$skill_dir" "$target"
  done

  local count
  count=$(ls -1d "$SKILLS_DIR"/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')
  ok "$count skills installed to $SKILLS_DIR"

  dim "Skills available in all Claude Code sessions:"
  for skill_dir in "$SKILLS_DIR"/*/; do
    local name
    name=$(basename "$skill_dir")
    local desc
    desc=$(sed -n 's/^description: //p' "$skill_dir/SKILL.md" 2>/dev/null | head -c 60)
    dim "  /$name — $desc"
  done
}

# ─────────────────────────────────────────────────────────
# Print instructions
# ─────────────────────────────────────────────────────────

print_instructions() {
  echo ""
  echo -e "${BOLD}  ┌─────────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}  │                                               │${NC}"
  echo -e "${BOLD}  │   ${GREEN}Tandem installed successfully!${NC}${BOLD}              │${NC}"
  echo -e "${BOLD}  │                                               │${NC}"
  echo -e "${BOLD}  └─────────────────────────────────────────────┘${NC}"
  echo ""
  echo -e "  ${BOLD}Services running:${NC}"
  echo -e "    Dashboard   ${BLUE}http://localhost:3000${NC}"
  echo -e "    API         ${BLUE}http://localhost:3001${NC}"
  echo -e "    Telemetry   ${BLUE}http://localhost:4317${NC} (gRPC) / ${BLUE}:4318${NC} (HTTP)"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo ""
  echo -e "    ${BOLD}1.${NC} Register at ${BLUE}http://localhost:3000/register${NC}"
  echo -e "       Create your account and set up your organization."
  echo ""
  echo -e "    ${BOLD}2.${NC} Connect Tandem to Claude Code:"
  echo ""
  echo -e "       ${DIM}Open any project and run:${NC}"
  echo -e "       ${GREEN}\$ cd your-project${NC}"
  echo -e "       ${GREEN}\$ claude${NC}"
  echo -e "       ${GREEN}> /tandem${NC}"
  echo ""
  echo -e "       ${DIM}This will open your browser to authorize the CLI${NC}"
  echo -e "       ${DIM}and save your config to ~/.claude/tandem.json${NC}"
  echo ""
  echo -e "    ${BOLD}3.${NC} Start using Tandem skills:"
  echo ""
  echo -e "       ${GREEN}/morning${NC}   — Pick a task from your sprint"
  echo -e "       ${GREEN}/finish${NC}    — Wrap up and move to the next task"
  echo -e "       ${GREEN}/standup${NC}   — Generate a team standup report"
  echo -e "       ${GREEN}/blockers${NC}  — See what's slowing the team down"
  echo ""
  echo -e "  ${BOLD}Manage:${NC}"
  echo -e "    Stop:     ${DIM}cd $TANDEM_DIR && docker compose down${NC}"
  echo -e "    Start:    ${DIM}cd $TANDEM_DIR && docker compose up -d${NC}"
  echo -e "    Logs:     ${DIM}cd $TANDEM_DIR && docker compose logs -f${NC}"
  echo -e "    Update:   ${DIM}curl -fsSL https://tandem.dev/install.sh | bash${NC}"
  echo -e "    Uninstall:${DIM} rm -rf $TANDEM_DIR $SKILLS_DIR/{tandem,morning,finish,standup,blockers}${NC}"
  echo ""
}

# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────

main() {
  header
  check_prerequisites
  setup_repo
  start_services
  apply_migrations
  install_skills
  print_instructions
}

main "$@"
