#!/bin/sh
# Sync standalone Tandemu skills from plugin to ~/.claude/skills/
# Runs on SessionStart — silent, fast, no output unless updating.

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
[ -z "$PLUGIN_ROOT" ] && exit 0

VERSION_FILE="$HOME/.claude/tandemu-version.txt"
PLUGIN_VERSION=$(python3 -c "import json; print(json.load(open('$PLUGIN_ROOT/.claude-plugin/plugin.json')).get('version',''))" 2>/dev/null)
[ -z "$PLUGIN_VERSION" ] && exit 0

INSTALLED_VERSION=""
[ -f "$VERSION_FILE" ] && INSTALLED_VERSION=$(cat "$VERSION_FILE")

# Skip if versions match
[ "$PLUGIN_VERSION" = "$INSTALLED_VERSION" ] && exit 0

# Sync skills (skip setup — it's the plugin entry point)
for skill_dir in "$PLUGIN_ROOT/skills"/*/; do
  skill_name=$(basename "$skill_dir")
  [ "$skill_name" = "setup" ] && continue
  rm -rf "$HOME/.claude/skills/$skill_name"
  cp -r "$skill_dir" "$HOME/.claude/skills/$skill_name"
done

# Sync shared lib
[ -d "$PLUGIN_ROOT/lib" ] && {
  mkdir -p "$HOME/.claude/lib"
  cp -r "$PLUGIN_ROOT/lib"/* "$HOME/.claude/lib/"
}

# Sync CLAUDE.md (only if it's Tandemu's)
if [ -f "$PLUGIN_ROOT/CLAUDE.md" ]; then
  if [ ! -f "$HOME/.claude/CLAUDE.md" ] || grep -q "Tandemu AI Teammate" "$HOME/.claude/CLAUDE.md" 2>/dev/null; then
    cp "$PLUGIN_ROOT/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
  fi
fi

# Update version
echo "$PLUGIN_VERSION" > "$VERSION_FILE"
