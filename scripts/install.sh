#!/usr/bin/env bash
# Wires herdr-prs into the Herdr app. Safe to re-run: it syncs the mod from
# this repo, and after a Herdr update it re-derives layouts/main-prs.json from
# the new layouts/main.json.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MOD="$APP/mods/gh-prs"
LAYOUT="$APP/layouts/main-prs.json"
ERRORS="$APP/layout.error"
# Marks a mod folder as this repo's copy; hidden, so Herdr ignores it.
MARKER=".installed-by-herdr-prs"
# How long Herdr gets to reject the new layout; it applies edits within a second.
SETTLE_SECONDS="${HERDR_PRS_SETTLE_SECONDS:-2}"
[[ "$SETTLE_SECONDS" =~ ^[0-9]+$ ]] || SETTLE_SECONDS=2

need() { command -v "$1" >/dev/null || { echo "$1 is not on PATH" >&2; exit 1; }; }
need herdr-app
need node
need rsync
command -v gh >/dev/null || echo "warning: gh is not on PATH; the panel will ask you to install it" >&2

# `herdr-app do` only answers while Herdr runs.
herdr_do() { herdr-app do "$@" >/dev/null 2>&1; }

# A first install that fails after cloning must not leave the person on an
# unpatched copy of main that never updates.
CREATED=""
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "$CREATED" ]; then
    herdr_do layout.switch '{"name":"main"}' || true
    rm -f "$LAYOUT"
    echo "removed the unpatched $LAYOUT and went back to main; fix the error above and run install.sh again" >&2
  fi
}
trap on_exit EXIT

# 1. The mod must load before anything in Herdr's home changes.
herdr-app check "$REPO/mods/gh-prs"

# 2. The mod, copied: Herdr loads a symlinked mod folder but never reloads it.
[ -L "$MOD" ] && rm "$MOD"
if [ -e "$MOD" ] && [ ! -f "$MOD/$MARKER" ]; then
  echo "refusing: $MOD exists and is not this repo's copy; move it aside first" >&2
  exit 1
fi
mkdir -p "$MOD"
# The marker goes first, so a copy that fails half way can be retried.
echo "$REPO" > "$MOD/$MARKER"
rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' --exclude "$MARKER" "$REPO/mods/gh-prs/" "$MOD/"
echo "copied the mod to $MOD"

# 3. The layout: a real clone the first time, so main's clicks (sizes, theme) come along.
if [ ! -f "$LAYOUT" ]; then
  CREATED=1
  if ! herdr_do layout.clone '{"name":"main","as":"main-prs"}' || [ ! -f "$LAYOUT" ]; then
    echo "Herdr isn't running; writing the layout without main's clicks"
    cp "$APP/layouts/main.json" "$LAYOUT"
  fi
fi

# 4. Patch it from the current main, then give Herdr a moment to reject it.
VERSION="$(herdr-app --version | awk '{print $2}')"
START_MS="$(node -p 'Date.now()')"
node "$REPO/scripts/make-layout.mjs" "$APP/layouts/main.json" "$LAYOUT" --version "$VERSION"
newer_error() {
  [ -f "$ERRORS" ] && node -e 'process.exit(require("fs").statSync(process.argv[1]).mtimeMs >= Number(process.argv[2]) ? 0 : 1)' "$ERRORS" "$START_MS"
}
TRIES=$((SETTLE_SECONDS * 5))
for ((i = 0; i <= TRIES; i++)); do
  if newer_error; then
    echo "Herdr rejected the layout:" >&2
    cat "$ERRORS" >&2
    exit 1
  fi
  if [ "$i" -lt "$TRIES" ]; then sleep 0.2; fi
done

# 5. Show it.
if herdr_do layout.switch '{"name":"main-prs"}'; then
  echo "switched to main-prs (ctrl-shift-l cycles layouts)"
else
  echo "Herdr isn't running: open it and pick main-prs with ctrl-shift-l"
fi
