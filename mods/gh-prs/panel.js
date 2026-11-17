// The Pull requests panel: follows the focused folder like Changes does, fetches
// both lists in one gh call, and only talks to GitHub while it is shown.
import { spaces, panes, focused, exec, layout, theme, checking } from "herdr";
import { isPanelShown } from "./layout-state.js";
import { resolveRepo } from "./repo.js";
import { ghArgs, outcomeFromExec, classifyFailure } from "./github.js";
import { initialState, applyFetch, needsRefresh, toSections, parseCollapsed, toggleCollapsed } from "./state.js";
import { staleText } from "./format.js";
import { renderPanel } from "./panel-view.js";

const GH_TIMEOUT_MS = 20000;
// How often to ask needsRefresh; it alone decides, so a fetch is 60–75 s apart.
const TICK_MS = 15000;
const COLLAPSED_KEY = "collapsed";

// Same as the shipped Changes panel: the focused pane's folder and machine.
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}
const key = () => JSON.stringify(location());

async function fetchPrs(repo) {
  try {
    return outcomeFromExec(await exec("gh", ghArgs(repo), { timeout: GH_TIMEOUT_MS }));
  } catch (error) {
    return { ok: false, failure: classifyFailure(error) };
  }
}

function readCollapsed() {
  try { return parseCollapsed(localStorage.getItem(COLLAPSED_KEY)); } catch { return parseCollapsed(null); }
}

export class PanelView {
  init(_props, cx) {
    this.state = initialState();
    this.inFlight = false;
    this.context = undefined;
    this.note = null;
    this.collapsed = readCollapsed();
    cx.timer.every(TICK_MS, (cx) => { if (this.due(Date.now())) this.refresh(cx); });
  }

  due(now) {
    return needsRefresh({ shown: isPanelShown(layout()), inFlight: this.inFlight, triedAt: this.state.triedAt, now, contextChanged: key() !== this.context });
  }

  refresh(cx) {
    if (this.inFlight || checking()) return;
    const context = key(), { cwd, on } = location();
    this.inFlight = true;
    this.context = context;
    cx.spawn(async (cx) => {
      try {
        const resolved = await resolveRepo(cwd, on, exec);
        const outcome = await fetchPrs(resolved.repo);
        // Focus moved to another folder meanwhile: drop it; render asks again.
        if (key() !== context) return;
        this.state = applyFetch(this.state, { ...outcome, source: resolved }, Date.now());
      } finally {
        this.inFlight = false;
        cx.notify();
      }
    });
  }

  open(url, cx) {
    this.note = null;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("open", [url]);
        if (r.code !== 0) this.note = `Couldn't open the browser: ${r.stderr.trim() || `open exited ${r.code}`}`;
      } catch (error) {
        this.note = `Couldn't open the browser: ${error?.message ?? error}`;
      }
      cx.notify();
    });
  }

  toggle(kind, cx) {
    this.collapsed = toggleCollapsed(this.collapsed, kind);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(this.collapsed)); } catch { /* per-viewer nicety only */ }
    cx.notify();
  }

  render(cx) {
    const now = Date.now();
    if (this.due(now)) this.refresh(cx);
    const { data, source, at, stale, problem } = this.state;
    return renderPanel(theme(), {
      now, at, stale, problem, inFlight: this.inFlight, note: this.note ?? staleText(this.state),
      sections: toSections(data, source?.repo ?? null, source?.note ?? null, this.collapsed),
    }, {
      onRefresh: (cx) => { this.refresh(cx); cx.notify(); },
      onOpen: (url, cx) => this.open(url, cx),
      onToggle: (kind, cx) => this.toggle(kind, cx),
    });
  }
}
