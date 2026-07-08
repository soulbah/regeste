#!/usr/bin/env bash
# PreToolUse (Edit|Write): block writes to protected paths.
set -euo pipefail

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).tool_input?.file_path??'')}catch{console.log('')}})")

[ -z "$FILE" ] && exit 0

case "$FILE" in
	*.dev.vars*|*.env*)
		echo "Blocked: agents never write secret files. Use 'wrangler secret put' (prod) or ask the owner to edit .dev.vars (local)." >&2
		exit 2
		;;
	*bun.lock)
		echo "Blocked: bun.lock is only modified by bun commands, never by hand." >&2
		exit 2
		;;
	*/migrations/*.sql)
		# Allow creating new migrations; block editing ones that already exist in git.
		if git -C "${CLAUDE_PROJECT_DIR:-.}" ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then
			echo "Blocked: this migration is already committed — applied migrations are append-only. Create a new corrective migration instead (see the db-migration skill)." >&2
			exit 2
		fi
		;;
	*LICENSE*)
		echo "Blocked: LICENSE changes require an explicit owner decision." >&2
		exit 2
		;;
esac

exit 0
