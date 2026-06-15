#!/usr/bin/env bash
# run-local.sh — unattended daily KT generator for cron (alternative to interactive /loop).
#
# Flow: Claude Code (headless) authors ONLY today's day file from the prompt; then THIS script
# deterministically validates, rebuilds the manifest, and commits/pushes. Keeping validate + git
# in the shell (not the model) means a malformed or unsourced day never reaches the repo.
#
# Cron example (08:30 daily):
#   30 8 * * *  /home/shivam-pansuriya/Documents/arkbase/scripts/run-local.sh >> "$HOME/.arkbase-loop.log" 2>&1
#
# NOTE: headless Claude needs permission to use web tools + Write. Adjust CLAUDE_FLAGS below to taste.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
DATE="$(date -u +%F)"

# Author the file only — no shell from the model; this script handles validate/build/commit.
PROMPT="Follow scripts/daily-kt-prompt.md sections 0 through 4 to research and WRITE the single file content/days/${DATE}.json (today, UTC). Use web tools to verify every fact with real sources. Do NOT run any shell/git commands and do NOT edit other files — only create that one JSON file, then stop."

CLAUDE_FLAGS="${CLAUDE_FLAGS:---permission-mode acceptEdits}"

echo "[$(date -u +%FT%TZ)] generating $DATE ..."
claude -p "$PROMPT" $CLAUDE_FLAGS

echo "[validate] $DATE"
node scripts/validate-day.mjs "$DATE"          # exits non-zero (and aborts) if invalid/unsourced

echo "[build-index]"
node scripts/build-index.mjs

if [[ -n "$(git status --porcelain content/)" ]]; then
  git add content/
  git commit -m "kt: ${DATE}"
  git push
  echo "[done] pushed $DATE — Render will auto-deploy."
else
  echo "[skip] no content changes."
fi
