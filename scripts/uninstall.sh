#!/usr/bin/env bash
# Removes herdr-prs from the Herdr app. Nothing in shared state needs cleaning:
# the mod never writes any, and a leftover "gh-prs" in the tab bar's per-space
# memory just restores as a closed panel. Herdr's own record of the layout's
# clicks (layouts/.state/main-prs.json) is Herdr's file and stays.
set -euo pipefail

APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MOD="$APP/mods/gh-prs"
DATA="$APP/data/gh-prs"
LAYOUT="$APP/layouts/main-prs.json"

herdr-app do layout.switch '{"name":"main"}' >/dev/null 2>&1 || echo "could not switch to main (is Herdr running?)" >&2

REMOVED=""
if [ -L "$MOD" ]; then
  rm "$MOD"
  REMOVED=1
  echo "removed link $MOD"
elif [ -f "$MOD/.installed-by-herdr-prs" ]; then
  rm -rf "$MOD"
  REMOVED=1
  echo "removed $MOD"
elif [ -e "$MOD" ]; then
  echo "left $MOD alone: it is not this repo's copy" >&2
fi

# The panel's own saved state (collapsed sections, PRs open): only with our mod.
if [ -n "$REMOVED" ] && [ -d "$DATA" ]; then
  rm -rf "$DATA"
  echo "removed the panel's saved state $DATA"
fi

if [ -f "$LAYOUT" ]; then
  KEPT="$LAYOUT.removed-$(date +%Y%m%dT%H%M%S)"
  mv "$LAYOUT" "$KEPT"
  echo "moved the layout aside to $KEPT"
fi
