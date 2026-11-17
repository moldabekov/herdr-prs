// The PRs toggle beside the stock tab bar. Looks like the tabs mod's Files and
// Changes buttons and drives the same panel column. Writes no shared state.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, run, theme } from "herdr";
import { isPanelShown, PANEL_ID, STACK_ID, CHILD_ID } from "./layout-state.js";

const ICON = "mods/gh-prs/icons/pull-request.svg";

function toggle(on) {
  if (on) {
    run("layout.hide", { id: PANEL_ID });
    return;
  }
  run("layout.select", { stack: STACK_ID, child: CHILD_ID });
  run("layout.show", { id: PANEL_ID });
}

export class ButtonView {
  init() {}

  render() {
    const t = theme();
    const on = isPanelShown(layout());
    // A press on the button must not drag the window (the block has window_drag).
    const stop = (_e, cx) => cx.stop_propagation();
    return h_flex().size_full().items_center().pr(10).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("gh-prs-toggle").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click(() => toggle(on))
        .child(svg(ICON).size(14))
        .child("PRs"));
  }
}
