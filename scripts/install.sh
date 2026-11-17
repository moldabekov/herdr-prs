#!/usr/bin/env bash
# Wires herdr-prs into the Herdr app. Safe to re-run: it syncs the mod from
# this repo, and after a Herdr update it re-derives layouts/main-prs.json from
# the new layouts/main.json.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MOD="$APP/mods/gh-prs"
LAYOUT="$APP/layouts/main-prs.json"
# Marks a mod folder as this repo's copy; hidden, so Herdr ignores it.
MARKER=".installed-by-herdr-prs"

command -v herdr-app >/dev/null || { echo "herdr-app is not on PATH" >&2; exit 1; }
command -v node >/dev/null || { echo "node is not on PATH" >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is not on PATH" >&2; exit 1; }
command -v gh >/dev/null || echo "warning: gh is not on PATH; the panel will ask you to install it" >&2

# 1. The mod, copied: Herdr loads a symlinked mod folder but never reloads it.
[ -L "$MOD" ] && rm "$MOD"
if [ -e "$MOD" ] && [ ! -f "$MOD/$MARKER" ]; then
  echo "refusing: $MOD exists and is not this repo's copy; move it aside first" >&2
  exit 1
fi
mkdir -p "$MOD"
rsync -a --delete --exclude jsconfig.json --exclude '*.d.ts' --exclude "$MARKER" "$REPO/mods/gh-prs/" "$MOD/"
echo "$REPO" > "$MOD/$MARKER"
echo "copied the mod to $MOD"

# 2. The layout: a real clone the first time, so main's clicks (sizes, theme) come along.
if [ ! -f "$LAYOUT" ]; then
  if ! herdr-app do layout.clone '{"name":"main","as":"main-prs"}' >/dev/null; then
    echo "herdr-app is not running; writing the layout without main's clicks"
    cp "$APP/layouts/main.json" "$LAYOUT"
  fi
fi

# 3. Patch it from the current main.
VERSION="$(herdr-app --version | awk '{print $2}')"
rm -f "$APP/layout.error"
node "$REPO/scripts/make-layout.mjs" "$APP/layouts/main.json" "$LAYOUT" --version "$VERSION"
sleep 2
if [ -f "$APP/layout.error" ]; then
  echo "Herdr rejected the layout:" >&2
  cat "$APP/layout.error" >&2
  exit 1
fi

# 4. The mod must load.
herdr-app check "$MOD"

# 5. Show it.
herdr-app do layout.switch '{"name":"main-prs"}' >/dev/null
echo "switched to main-prs (ctrl-shift-l cycles layouts)"
