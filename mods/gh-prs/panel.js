// Placeholder panel (Task 6); the real one replaces it in Task 7.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";

export class PanelView {
  init() {}

  render() {
    const t = theme();
    return v_flex().id("gh-prs").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Pull requests")))
      .child(div().p(14).text_color(t.dim).child("Loading…"));
  }
}
