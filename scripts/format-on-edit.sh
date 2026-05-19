#!/usr/bin/env bash
# Called from .claude/settings.json (Claude Code PostToolUse) and
# .cursor/hooks.json (Cursor afterFileEdit). The two tools deliver the file
# path under different JSON keys, so probe the common locations.

input=$(cat)
file=$(printf '%s' "$input" | jq -r '
  .tool_input.file_path //
  .file_path //
  .filePath //
  .arguments.file_path //
  empty
' 2>/dev/null) || file=""

[ -z "$file" ] && exit 0

case "$file" in
  *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.json|*.md|*.yaml|*.yml|*.html|*.css|*.scss)
    if [ -x ./node_modules/.bin/prettier ]; then
      ./node_modules/.bin/prettier --write --log-level=error "$file" >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
