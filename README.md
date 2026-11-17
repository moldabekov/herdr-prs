# herdr-prs

A **Pull requests** panel for the [Herdr](https://herdr.dev) app. It sits
beside the Files and Changes panels and has a **PRs** button in the tab bar.

It shows two lists:

- **This repo**: the open PRs of the repo your focused terminal is in. It
  follows focus the way the Changes panel does, including spaces on remote
  machines.
- **Mine**: your own open PRs across GitHub.

Each row shows:

- the PR number and title;
- the CI status: ✓ passing, ✕ failing, an amber dot for pending;
- a review badge (Approved, Changes or Review), plus Draft and Conflict
  badges;
- the branch and author (This repo) or the repo (Mine), and how long ago
  it was updated.

Click a row to open the PR in your browser.

The panel refreshes every minute while it is open, and never while it is
closed.

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

- copies `mods/gh-prs` into `~/.config/herdr-app/mods/`;
- creates the `main-prs` layout from Herdr's `main` layout;
- checks the mod;
- switches to the new layout.

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
- removes the copied mod. It only removes a folder that `install.sh`
  marked as its own.
- moves `layouts/main-prs.json` aside as `main-prs.json.removed-<time>`.

## What it never touches

It is kept small so the rest of Herdr keeps receiving its automatic
updates.

- No shipped mod is cloned or edited: `tabs`, `files`, `changes` and the
  sidebar mods all stay Herdr's.
- `keys.json` and `settings.json` are never written, so there is no
  keyboard shortcut.
- No shared state is written. Because of this, the PRs panel is not
  remembered per space: leave a space and come back, and it is closed.
  Files and Changes still remember as before.
- The only new things are `layouts/main-prs.json` and `mods/gh-prs/`.

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
  `layout-state.js`, `scripts/make-layout.mjs`) hold all the logic, and the
  tests cover them.
- **Views** (`main.js`, `button.js`, `panel.js`, `panel-view.js`) are
  checked with `herdr-app check` and in the running app with
  `herdr-app shot`.

The design and the plan are in `docs/superpowers/`.
