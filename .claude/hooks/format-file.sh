#!/usr/bin/env bash
# PostToolUse (Edit|Write): format the touched file with prettier. Never blocks.
set -uo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).tool_input?.file_path??'')}catch{console.log('')}})")

[ -z "$FILE" ] && exit 0

case "$FILE" in
	*.ts|*.js|*.svelte|*.css|*.json|*.jsonc|*.md)
		cd "${CLAUDE_PROJECT_DIR:-.}" && bunx prettier --write "$FILE" >/dev/null 2>&1 || true
		;;
esac

exit 0
