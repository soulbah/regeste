#!/usr/bin/env bash
# Stop hook: if source files changed this session, typecheck + lint must pass before stopping.
set -uo pipefail

INPUT=$(cat)
ACTIVE=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).stop_hook_active===true?'1':'0')}catch{console.log('0')}})")
[ "$ACTIVE" = "1" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only run when TS/Svelte sources were actually modified.
CHANGED=$(git status --porcelain -- 'src' 2>/dev/null | grep -cE '\.(ts|svelte)$' || true)
[ "${CHANGED:-0}" = "0" ] && exit 0

OUT=$(bun run check 2>&1)
if [ $? -ne 0 ]; then
	echo "svelte-check FAILED — source files were modified this session. Fix these before stopping (or tell the owner explicitly why you are stopping with a broken build):" >&2
	echo "$OUT" | tail -40 >&2
	exit 2
fi

OUT=$(bun run lint 2>&1)
if [ $? -ne 0 ]; then
	echo "lint FAILED — fix before stopping:" >&2
	echo "$OUT" | tail -40 >&2
	exit 2
fi

exit 0
