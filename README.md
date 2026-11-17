# herdr-prs

A **Pull requests** panel for the [Herdr](https://herdr.dev) app. It sits
beside the Files and Changes panels and has a **PRs** button in the tab bar.

It shows three lists:

- **This repo**: the open PRs of the repo your focused terminal is in. It
  follows focus the way the Changes panel does, including spaces on remote
  machines.
- **Review requested**: open PRs waiting for your review, including
  requests to a team you're on. A PR leaves the list once you've reviewed
  it.
- **Mine**: your own open PRs across GitHub.

Each row shows:

- the PR number and title;
- the CI status: ✓ passing, ✕ failing, a dot in your theme's "working"
  colour for pending, a dim dot when the PR has no checks;
- a review badge (Approved, Changes or Review), plus Draft and Conflict
  badges;
- where it comes from: the branch and author (This repo), the repo and
  author (Review requested), or the repo (Mine); and how long ago it was
  updated.

Click a row to open the PR in your browser.

The panel refreshes every minute while it is open, and never while it is
closed. Moving to another folder of the same repo doesn't call GitHub
again; the refresh button always does.

**Open or closed is global.** Open PRs once and it stays open as you move
between spaces, until you close it or pick Files or Changes in the tab bar.
While PRs is open it takes the side panel in every space, so a space's
remembered Files or Changes panel doesn't come back. On a space switch the
panel can blink for a frame: the stock tab bar closes it, and the PRs
button opens it again.

## Requirements

- macOS, with the Herdr app 0.1.16 or later
- [`gh`](https://cli.github.com), logged in (`gh auth login`). The panel
  uses the active account.
- `node` and `rsync` on `PATH`. They are only needed to install.

## Install

```sh
bash scripts/install.sh
```

This script:

- checks the mod (`herdr-app check`) before it changes anything;
- copies `mods/gh-prs` into `~/.config/herdr-app/mods/`;
- creates the `main-prs` layout from Herdr's `main` layout;
- waits up to 2 seconds for Herdr to reject the layout
  (`HERDR_PRS_SETTLE_SECONDS` changes the wait);
- switches to the new layout. If Herdr isn't running, it says so; pick
  `main-prs` with `ctrl-shift-l` when you open Herdr.

If a first install fails after creating the layout, the script removes the
unfinished layout and switches back to `main`.

`ctrl-shift-l` cycles layouts, so you can get back to `main` at any time.

**Run it again** when you change the mod, and after a Herdr update. Herdr
does not reload a symlinked mod folder, so the mod is copied rather than
linked. A Herdr update can change `main`; re-running rebuilds `main-prs`
from the new `main`. If Herdr's `main` changes its structure, the script
stops with a clear message instead of writing a broken layout.

`HERDR_APP_HOME` points the scripts at another Herdr home.

## Uninstall

```sh
bash scripts/uninstall.sh
```

This script:

- switches to `main`;
- removes the copied mod, and the panel's saved state in `data/gh-prs/`.
  It only removes a mod folder that `install.sh` marked as its own.
- moves `layouts/main-prs.json` aside as `main-prs.json.removed-<time>`.

## What it never touches

It is kept small so the rest of Herdr keeps receiving its automatic
updates.

- No shipped mod is cloned or edited: `tabs`, `files`, `changes` and the
  sidebar mods all stay Herdr's.
- `keys.json` and `settings.json` are never written, so there is no
  keyboard shortcut.
- No shared state is written. The PRs button keeps "open or closed" in its
  own storage, and Files and Changes still remember per space as before.
- Install adds `layouts/main-prs.json` and `mods/gh-prs/`. Herdr then
  writes two files of its own for them:
  - `layouts/.state/main-prs.json`: the layout's clicks, copied from
    `main`;
  - `data/gh-prs/`: whether PRs is open, and which sections you collapsed.

  Uninstall removes `data/gh-prs/`. It leaves `layouts/.state/main-prs.json`,
  which is Herdr's own file and harmless.

## Limits

- Only github.com. GitHub Enterprise hosts are not supported.
- Each list shows at most 30 PRs, with a "Showing 30 of N" footer.
- On Linux and Windows, the PRs button would sit to the right of the window
  buttons.

## Develop

```sh
npm test            # unit tests (node --test, no dependencies)
npm run coverage    # with an 80% line threshold
```

- **Pure modules** (`repo.js`, `github.js`, `format.js`, `state.js`,
  `memory.js`, `layout-state.js`, `scripts/make-layout.mjs`) hold the
  logic, and unit tests cover them.
- **`panel.js` and `button.js`** are driven by tests through a stand-in
  host: `test/support/host-loader.mjs` points their `herdr` and `gpui-*`
  imports at small fakes.
- **The install scripts** run in tests against a throwaway Herdr home,
  with a stand-in `herdr-app`.
- **The drawing** (`panel-view.js`, `main.js`) is checked with
  `herdr-app check` and in the running app with `herdr-app shot`.

The design and the plan are in `docs/superpowers/`.
