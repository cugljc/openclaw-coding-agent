#!/bin/bash
# Install Claude Code hooks (macOS/Linux)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS="$HOME/.claude/settings.json"

echo "Installing Claude Code completion hooks..."

mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/../hooks/on-complete.sh" "$HOOKS_DIR/on-complete.sh"
chmod +x "$HOOKS_DIR/on-complete.sh"
echo "  Copied on-complete.sh → $HOOKS_DIR/"

# Register in settings.json
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

# Check if hooks already registered
if jq -e '.hooks.Stop' "$SETTINGS" >/dev/null 2>&1; then
  echo "  Hooks already registered in settings.json"
else
  HOOK_CMD="$HOOKS_DIR/on-complete.sh"
  jq --arg cmd "$HOOK_CMD" '
    .hooks //= {} |
    .hooks.Stop //= [{"hooks": []}] |
    .hooks.Stop[0].hooks += [{"type": "command", "command": $cmd, "timeout": 10}] |
    .hooks.SessionEnd //= [{"hooks": []}] |
    .hooks.SessionEnd[0].hooks += [{"type": "command", "command": $cmd, "timeout": 10}]
  ' "$SETTINGS" > "${SETTINGS}.tmp" && mv "${SETTINGS}.tmp" "$SETTINGS"
  echo "  Registered Stop + SessionEnd hooks in settings.json"
fi

echo ""
echo "Done! Hook will fire when Claude Code tasks complete."
echo "Results saved to: ~/.openclaw/agents/coding-agent/results/"
