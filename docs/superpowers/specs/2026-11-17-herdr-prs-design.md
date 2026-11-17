# herdr-prs: a Pull requests panel for the Herdr app

Date: 2026-11-17 · Status: approved after the spec review (decisions at the end)

## Intent

A third right-side panel in the Herdr app, next to Files and Changes, that
shows open pull requests and their status. The owner wants two lists:

- **This repo**: open PRs of the repo the focused terminal is in. It follows
  focus the way the shipped Changes panel does.
- **Mine**: the owner's own open PRs across GitHub.

**Why.** The owner wants to see PR state while working, without leaving the
app.

**Atomic.** The change must touch as few of Herdr's own files as possible.
Herdr replaces its shipped layouts and mods on every start, and it stops
updating anything that gets cloned or edited. Everything else must keep
receiving Herdr's automatic updates.

## Goals

- A **PRs** button in the tab bar. It opens and closes the panel the same
  way the Files and Changes buttons do.
- Each PR row shows:
  - number and title
  - CI rollup: passing, failing, pending, or no checks
  - review decision: approved, changes requested, or review required
  - draft flag
  - merge conflict flag
  - a secondary line: branch or repo, author, and how long since the last update
- Clicking a row opens the PR in the browser.
- A refresh button. The panel also refreshes every 60 s, but only while it
  is shown.
- All of it lives in `~/src/herdr-prs`, with an install script
  that wires it into `~/.config/herdr-app`.

## Non-goals

These are not built now. Any of them can come later.

- GitHub Enterprise hosts. Only github.com is supported.
- A "review requested from me" list.
- Actions on a PR: merge, checkout, comment, or starting an agent on it.
- A keyboard shortcut. Editing `keys.json` even once freezes it, and Herdr
  stops adding its new default shortcuts.
- Placing the button correctly on Linux and Windows. There the tab bar draws
  window buttons last, so PRs would sit to their right. macOS is the target.
- herdr.dev sharing (`RECIPE.md`, `preview.png`).
- **Per-space memory for PRs.** Files and Changes still remember per space.
  The PRs panel closes when you leave a space and come back. The owner
  chose this in the review.
- **More than one GitHub account.** Mine uses only the active `gh` account
  (whichever account `gh` is set to). The owner chose this in the review.
- A Settings preview picture for `main-prs`. It shows a plain frame there.

## Anti-goals

Any of these makes the change a failure even if the panel works.

- Cloning or editing any shipped mod: `tabs`, `files`, `changes`,
  `workspace-*`, sidebar mods.
- Editing `keys.json` or `settings.json`.
- Writing any shared state another mod reads. In particular, never add
  `gh-prs` to `shared("workspace.panels")`.
- Calling the GitHub API while the panel is hidden.
- Redrawing on a timer to animate. Herdr's native animation is used instead.

## Constraints (from AGENTS.md and the code)

- **The button is hard-coded.** The Files and Changes buttons are hard-coded
  in the shipped `tabs` mod (`mods/tabs/main.js`). `tabs` only draws a
  button for the ids `files` and `changes`.
- **The panel slot.** The panel is the `panel` column in `layouts/main.json`.
  It holds the stack `panel-body`, whose children are `files` and
  `changes`. Opening a panel runs these commands:
  - `layout.select {stack:"panel-body", child}`
  - `layout.show {id:"panel"}`
  - `layout.hide {id:"panel"}` closes it.
- **Per-space memory.** `tabs` remembers each space's open panel.
  - It keeps one store for every layout, `data/tabs/store.json` (`panels`),
    so its copy in `main` and its copy in `main-prs` share it.
  - It records whatever `panel-body.active` is, including `gh-prs`.
  - It only restores ids listed in `shared("workspace.panels")` (default
    `["files","changes"]`, `mods/tabs/main.js:66-79`).
  - A stored id that isn't listed restores as closed. That is why PRs
    closes on a space switch, and why a leftover `gh-prs` entry is
    harmless in `main`: it just closes the panel.
- **Shipped layouts are read-only.**
  - Changing the layout needs a clone. `layout.clone` copies the clicks
    stored in `layouts/.state/main.json` and records `cloned_from`.
  - A clone never updates.
  - The layout's name is its file name.
- **Mods.**
  - `herdr-app check` must pass.
  - `exec` runs in the user's environment.
  - Never keep a `cx` for later use.
  - No `setTimeout`.
  - Herdr writes `jsconfig.json` and the `.d.ts` files into every mod folder.
- **Tools.**
  - `gh` 2.103 is installed and logged in to github.com. `node` and `jq` are
    available.
  - Herdr is 0.1.16 on macOS.

## Approaches

| | What | Trade-off |
|---|---|---|
| **A (picked)** | Clone only the layout: one extra child in `panel-body`, and a small button block beside the stock `tabs` block. A script regenerates the clone from the current `main`. | Every shipped mod and `keys.json` keep updating. The gap before the button is 10 px (other buttons have 3 px). |
| B | Clone the layout and `tabs`, and add the button inside the cloned tab bar. | Looks perfect, but `tabs` stops updating, and Herdr changed it on 2026-11-15. This goes against the atomic requirement. |
| C | No layout change: the panel opens as a window or pane from the palette. | Nothing freezes, but it is not a side panel like Files and Changes. |

The owner picked A, and the reason is the atomic requirement.

## Design

### Repo layout

```
herdr-prs/
  README.md                 what it is, install, uninstall, regenerate
  package.json              {"type":"module"} so node --test loads the ES modules; no dependencies
  .gitignore                mods/gh-prs/{jsconfig.json,*.d.ts}
  mods/gh-prs/              the mod; installed as a symlink
    mod.json                {"place":"none"}
    main.js                 default View: draws the button when props().button, else the panel
    panel.js, button.js     the two views (gpui-kit / herdr imports allowed)
    repo.js                 pure: git remote URL → {owner, name} | null
    github.js               pure: GraphQL query text, response → section models
    format.js               pure: relative time, status → {label, color key, icon}
    *.svg                   pull-request, check, x, dot icons
  scripts/
    make-layout.mjs         pure transform main.json → main-prs.json, plus a CLI
    install.sh, uninstall.sh
  test/                     node --test for repo.js, github.js, format.js, make-layout.mjs
```

The pure modules import nothing from `gpui-kit` or `herdr`, so node can test
them.

### Layout: `main-prs`, derived from `main`

`make-layout.mjs` reads the current `layouts/main.json` and writes
`layouts/main-prs.json`. It makes two changes, finding each place by its id:

1. It appends `{id:"gh-prs", type:"block", content:{mod:"gh-prs"}}` to the
   children of `panel-body`.
2. It replaces the block `tabs` with a row
   `{id:"tabs-row", type:"row", size:<tabs.size>, resizable:false}` that
   holds two children:
   - the original `tabs` block, with its size changed to `{weight:1}`;
   - `{id:"gh-prs-button", type:"block", size:{px:~68}, window_drag:true,
     content:{mod:"gh-prs", props:{button:true}}}`.

It keeps the existing `cloned_from` and sets its version to the running
`herdr-app --version`.

The transform is idempotent: running it on an already patched layout
changes nothing. If either anchor id is missing, it exits nonzero with a
clear message. That means Herdr changed the structure of `main`, and the
patch needs updating.

Re-running it after a Herdr update re-derives `main-prs` from the new
`main`, so the clone doesn't drift.

### Button (`props().button`)

- **Look.** It copies the `panelButton` look from `tabs`:
  - 26 px tall, `px(8)`, `gap(5)`;
  - a 14 px icon and the 12 px label "PRs";
  - `t.selected` when on;
  - a chrome background with `border_b(1)`, to continue the tab bar.
- **On.** The button is on when `panel` is shown and `panel-body.active ===
  "gh-prs"`.
- **Click.** Clicking toggles the panel with the same three commands.
  The press stops propagation so it doesn't drag the window.
- **Shared state.** The button writes no shared state. Per-space restore is
  left to `tabs`, which restores PRs as closed (see Constraints).

### Panel

- **Header.** 42 px, styled like Changes. It holds the title "Pull
  requests", the time since the last update, and a refresh icon.
- **Scroll area.** One scroll area holds two collapsible sections:
  - **This repo `owner/name`** with its count;
  - **Mine** with its count.
  - Which sections are collapsed is kept in `localStorage`.
- **Rows.** Each row is 2 lines, about 44 px:
  - Line 1: the CI icon, `#123`, the title (truncated), and badges on the
    right.
  - Line 2 (dim): in This repo, `branch · @author · 2h`; in Mine,
    `owner/repo · 2h`.
- **CI icon.**

  | Rollup | Icon |
  |---|---|
  | `SUCCESS` | ansi2 check |
  | `FAILURE` / `ERROR` | ansi1 x |
  | `PENDING` / `EXPECTED` | `t.working` dot |
  | none | dim dot |

- **Badges.**

  | State | Badge |
  |---|---|
  | `APPROVED` | "Approved" in ansi2 |
  | `CHANGES_REQUESTED` | "Changes" in ansi1 |
  | `REVIEW_REQUIRED` | "Review" in muted |
  | draft | "Draft" in dim |
  | `mergeable === "CONFLICTING"` | "Conflict" in ansi1 |

- **Limits.** Each list shows at most 30 PRs. When there are more, a footer
  says "Showing 30 of N".
- **Click.** Clicking a row runs `exec("open", [url])`.
- **Theme.** All colors come from `theme()`.

### Data

**Context.** Context comes from the same `location()` that Changes uses: the
focused pane's cwd and machine. The steps:

1. `exec("git", ["rev-parse","--show-toplevel"], {cwd, on})`.
2. `git remote get-url upstream`, falling back to `origin`, also with
   `{cwd, on}`.
3. `repo.js` parses the URL. It accepts `git@github.com:o/r(.git)`,
   `ssh://git@github.com/o/r`, and `https://github.com/o/r(.git)`. Any other
   host gives null.
4. The result is cached per `{cwd, on}` key.

Preferring `upstream` makes a fork show its parent repo's PRs. That was my
call.

**Fetch.** Each refresh is one local call:

```
gh api graphql -f query=<text> [-f owner= -f name=]
```

- Use `-f`, not `-F`: `-F` converts values to other types, so a repo named
  `123` would be sent as a number.
- It runs on the Mac, even for remote spaces.
- The query text is built in `github.js`. It includes the `repository`
  block only when a GitHub repo was found.
- It asks for `viewer{login}` and two lists:
  - `repository{pullRequests(states:OPEN, first:30, orderBy:UPDATED_AT
    DESC){totalCount nodes{...pr}}}`
  - `search(query:"is:pr is:open author:@me archived:false
    sort:updated-desc", type:ISSUE, first:30){issueCount nodes{...pr}}}`
- The `pr` fragment holds: number, title, url, isDraft, reviewDecision,
  mergeable, updatedAt, headRefName, author{login},
  repository{nameWithOwner}, and
  `commits(last:1){nodes{commit{statusCheckRollup{state}}}}`.
- The `exec` timeout is 20 s.

**When it refreshes.** "Shown" means `layout()` has `panel` not hidden and
`panel-body.active === "gh-prs"`. A PR of yours in the current repo appears
in both lists, which is intended.

- When the panel becomes shown and its data is older than 60 s.
- Every 60 s while shown, from a `cx.timer.every`, which skips the refresh
  while the panel is hidden.
- When the focused repo changes. This is detected in `render`, the way
  Changes does it.
- When the refresh button is clicked.
- Only one request runs at a time. A result for an outdated context is
  dropped.

**Errors.** Each one is shown where it happens, and the panel never goes
blank:

| Problem | What the panel shows |
|---|---|
| `gh` won't start | "Install the GitHub CLI (gh) to see pull requests" |
| Not logged in (nonzero exit, stderr mentions auth) | "Run `gh auth login` in a terminal" |
| No git repo / not on GitHub | That line inside This repo. Mine still loads. |
| The repo can't be accessed (a GraphQL error on `repository`) | The error inside This repo. Mine still shows its data. `stdout` is parsed even when the exit code is nonzero. |
| Network or timeout | The last good data stays. The header shows "Couldn't refresh". |

### Install

`install.sh` is idempotent. `HERDR_APP_HOME` defaults to
`~/.config/herdr-app`. It runs these steps in order:

1. Symlink `mods/gh-prs` to the repo's `mods/gh-prs`. If a real folder
   already sits there, it refuses.
2. If `layouts/main-prs.json` doesn't exist, it runs
   `herdr-app do layout.clone '{"name":"main","as":"main-prs"}'`, which
   copies the clicks. If the app isn't running, it writes the file
   directly.
3. It runs `node scripts/make-layout.mjs` and checks that `layout.error`
   stays absent.
4. It runs `herdr-app check` on the mod.
5. It runs `herdr-app do layout.switch '{"name":"main-prs"}'`.

`uninstall.sh` switches to `main`, removes the symlink, and moves
`main-prs.json` aside as `main-prs.json.removed-<time>`. It has no shared
state to clean up. Any `gh-prs` entries left in `tabs`'s store restore as a
closed panel.

To regenerate after a Herdr update, run `install.sh` again.

## Testing

- **Unit tests** (`node --test`, at least 80% coverage of the pure modules):
  - URL parsing for every remote form, including non-GitHub hosts;
  - GraphQL response → section models: all rollup and review states,
    draft, conflict, a missing repository, errors alongside partial data;
  - relative time;
  - the layout transform: the output shape, idempotence, missing anchors,
    and that every other node is untouched (a deep-equal against `main`
    with the two edits reverted).
- **Check:** `herdr-app check ~/.config/herdr-app/mods/gh-prs` passes.
- **In the app:**
  - after install, `herdr-app status` shows `main-prs` with no errors;
  - `herdr-app shot` shows the PRs button and the open panel with both
    lists;
  - Files and Changes still restore per space;
  - a space that last had PRs open comes back with the panel closed, and
    shows no error toast;
  - switching to stock `main` shows no error and no panel popping open;
  - the Files and Changes buttons still work;
  - `shared.json` never gains `gh-prs`.

## Risks, verified first in the plan

1. **Symlinks.** Herdr may not load, or may not watch, a symlinked mod
   folder. The fallback is for `install.sh` to copy instead, plus a
   `--link` flag for development.
2. **`author:@me` in GraphQL search.** If GitHub doesn't accept it, the
   panel fetches `viewer.login` first.
3. **Restoring a space whose stored panel is `gh-prs`.** In both layouts,
   `tabs` should close the panel quietly, because `want` is null and only
   `layout.hide` runs. This needs confirming in the app.

## Decisions from the spec review (2026-11-17)

- **The reviewer's finding.** Adding `gh-prs` to `workspace.panels` would
  leak into stock `main`, because `tabs` keeps one store for every layout.
  `main` would run `layout.select` on a child it doesn't have and open the
  panel on Files. Uninstall couldn't clean that up while the app runs.
  **Owner's decision:** no per-space memory for PRs, and shared state stays
  untouched.
- **Accounts.** `gh` has a second github.com account whose token is
  invalid. **Owner's decision:** Mine covers the active account only.
- **Checked and clean, no change needed:**
  - Every repo under `~/src` uses a `git@github.com:` or
    `https://github.com/` remote. The GitLab repos get the "not on GitHub"
    line.
  - Forks use `origin` for the parent, so "upstream, else origin" picks the
    parent.
  - Nothing depends on the layout being named `main`.

## Left to the builder

- Exact pixel sizes: the button block width, row heights, and icon art.
  Tune them with `herdr-app shot`.
- The README wording.

## Changes after the build (2026-11-17)

- **The PRs panel is global, not per space.** This is the owner's request,
  and it replaces the "no per-space memory" decision above.
  - The PRs button keeps one open/closed state in its own storage
    (`localStorage`, under `data/gh-prs/`). Still no shared state.
  - For 1.5 s after a space switch, a closed PRs panel is the stock tab
    bar's per-space restore, and the button reopens it.
  - Outside that window, a change is the person's, and it becomes the
    global state: a click, picking Files or Changes, or closing the panel.
  - While PRs is open, it wins over a space's remembered Files or Changes.
  - The panel may blink for a frame on a switch.
- **The review's deferred minors are fixed:**
  - same-repo folder changes skip the GitHub call;
  - only `https://github.com` links are opened;
  - unexpected refresh errors are shown and paced;
  - `make-layout.mjs` checks every node it relies on;
  - install checks first and writes its marker before copying;
  - install reports when Herdr isn't running, and undoes a failed first
    install;
  - install keeps Herdr's `layout.error` and waits a bounded,
    configurable time;
  - uninstall removes `data/gh-prs/`;
  - the README's pending colour is described correctly.

## Review requested list (2026-11-17)

- **Order.** The panel shows three lists: This repo, Review requested,
  Mine.
- **Query.** Review requested is
  `is:pr is:open review-requested:@me archived:false sort:updated-desc`.
  - It includes requests to a team the person is on.
  - GitHub drops the person from the requested reviewers once they have
    reviewed, so a PR leaves the list then.
- **Fetching.** It rides in the same single GraphQL call, as a third
  `search` aliased `review`, with the same 30-PR limit and the same
  per-list errors.
- **Rows.** The second line is `repo · @author · age`: for a review, who
  asked matters.
- **Collapse state.** Collapsing is remembered per list, as before, now
  including `review`.
