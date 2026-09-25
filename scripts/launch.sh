#!/bin/bash
# Shared by the double-click *.command files: finds Node, then runs scripts/control.mjs.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
printf '\033]0;Finish The Word!\007'
if ! command -v node >/dev/null 2>&1; then
  echo "This needs Node.js. Install it from https://nodejs.org, then double-click again."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi
exec node scripts/control.mjs "$@"
