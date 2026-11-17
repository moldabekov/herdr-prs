// The PRs toggle beside the stock tab bar. Looks like the tabs mod's Files and
// Changes buttons and drives the same panel column. Whether PRs is open is kept
// globally (memory.js), in this copy's own storage; no shared state is written.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, run, theme, spaces, checking } from "herdr";
import { isPanelShown, PANEL_ID, STACK_ID, CHILD_ID } from "./layout-state.js";
import { initialMemory, observe, clicked, parseOpen } from "./memory.js";

const ICON = "mods/gh-prs/icons/pull-request.svg";
const OPEN_KEY = "open";

function readOpen() {
  try { return parseOpen(localStorage.getItem(OPEN_KEY)); } catch { return false; }
}

function saveOpen(open) {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch (error) {
    console.log(`gh-prs: couldn't remember whether PRs is open: ${error?.message ?? error}`);
  }
}

function showPanel() {
  run("layout.select", { stack: STACK_ID, child: CHILD_ID });
  run("layout.show", { id: PANEL_ID });
}

function hidePanel() {
  run("layout.hide", { id: PANEL_ID });
}

export class ButtonView {
  init() {
    this.mem = initialMemory(readOpen());
  }

  remember(mem) {
    if (mem.open !== this.mem.open) saveOpen(mem.open);
    this.mem = mem;
  }

  // Reads what the layout shows, and reopens PRs after the tab bar's per-space
  // restore closed it. Like the tabs mod, it acts from render.
  sync() {
    const shown = isPanelShown(layout());
    if (checking()) return shown;
    const space = spaces().find((s) => s.active)?.id ?? null;
    const { mem, reopen } = observe(this.mem, { space, shown, now: Date.now() });
    this.remember(mem);
    if (reopen) showPanel();
    return shown;
  }

  toggle(on) {
    this.remember(clicked(this.mem, !on, Date.now()));
    if (on) hidePanel();
    else showPanel();
  }

  render() {
    const t = theme();
    const on = this.sync();
    // A press on the button must not drag the window (the block has window_drag).
    const stop = (_e, cx) => cx.stop_propagation();
    return h_flex().size_full().items_center().pr(10).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("gh-prs-toggle").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click(() => this.toggle(on))
        .child(svg(ICON).size(14))
        .child("PRs"));
  }
}
