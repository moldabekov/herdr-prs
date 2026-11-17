// Draws the panel from a plain model. No data fetching here: panel.js owns that.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { relativeTime, ciStatus, badges, problemText } from "./format.js";

const ICONS = "mods/gh-prs/icons/";
const LIST_ID = "gh-prs-list";

function header(t, m, onRefresh) {
  const status = m.stale
    ? div().text_size(11).text_color(t.ansi1).child("Couldn't refresh")
    : div().text_size(11).text_color(t.dim).child(m.at === null ? "" : `updated ${relativeTime(m.at, m.now)}`);
  const icon = m.inFlight
    ? svg(`${ICONS}spinner.svg`).size(14).text_color(t.muted).spin(900)
    : svg(`${ICONS}refresh.svg`).size(14).text_color(t.muted);
  return h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().font_semibold().child("Pull requests"))
    .child(div().flex_1())
    .child(status)
    .child(div().id("gh-prs-refresh").size(24).flex().items_center().justify_center().rounded(6)
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onRefresh(cx)).child(icon));
}

function badge(t, b) {
  return div().px(5).rounded(4).border_1().border_color(t[b.color]).text_color(t[b.color]).text_size(10).child(b.label);
}

// Where the PR comes from; truncates. The age sits apart so a long branch never hides it.
function origin(kind, pr) {
  const parts = kind === "repo" ? [pr.branch, pr.author ? `@${pr.author}` : null] : [pr.repo];
  return parts.filter(Boolean).join(" · ");
}

function row(t, kind, pr, now, onOpen) {
  const ci = ciStatus(pr.ci);
  return v_flex().id(`pr-${kind}-${pr.url}`).flex_none().px(10).py(6).gap(2).rounded(7)
    .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onOpen(pr.url, cx))
    .child(h_flex().gap(6).items_center().min_w(0)
      .child(svg(`${ICONS}${ci.icon}`).size(12).flex_none().text_color(t[ci.color]))
      .child(div().flex_none().text_size(12).text_color(t.dim).child(`#${pr.number}`))
      .child(div().flex_1().min_w(0).truncate().child(pr.title))
      .children(badges(pr).map((b) => badge(t, b))))
    .child(h_flex().pl(18).gap(8).text_size(11).text_color(t.dim).min_w(0)
      .child(div().flex_1().min_w(0).truncate().child(origin(kind, pr)))
      .child(div().flex_none().child(relativeTime(pr.updatedAt, now))));
}

function sectionHeader(t, s, onToggle) {
  const chevron = s.collapsed ? "chevron-right.svg" : "chevron-down.svg";
  return h_flex().id(`sec-${s.kind}`).h(30).flex_none().px(8).gap(6).items_center().rounded(7)
    .cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => onToggle(s.kind, cx))
    .child(svg(`${ICONS}${chevron}`).size(12).flex_none().text_color(t.dim))
    .child(div().flex_none().text_size(12).font_semibold().child(s.title))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(s.subtitle ?? ""))
    .child(div().flex_none().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(String(s.total)));
}

function sectionBody(t, s, now, onOpen) {
  const line = (text) => div().px(10).py(4).text_size(12).text_color(t.dim).child(text);
  if (s.note) return [line(s.note)];
  if (!s.items.length) return [line("No open pull requests")];
  const rows = s.items.map((pr) => row(t, s.kind, pr, now, onOpen));
  return s.total > s.items.length ? [...rows, line(`Showing ${s.items.length} of ${s.total}`)] : rows;
}

function section(t, s, now, handlers) {
  return v_flex().flex_none().gap(1)
    .child(sectionHeader(t, s, handlers.onToggle))
    .when(!s.collapsed, (el) => el.children(sectionBody(t, s, now, handlers.onOpen)));
}

function body(t, m, handlers) {
  const center = (text) => div().p(18).text_color(t.dim).child(text);
  const problem = problemText(m.problem, Boolean(m.sections));
  if (problem) return center(problem);
  if (!m.sections) return center("Loading…");
  return div().flex_1().min_h(0).relative()
    .child(v_flex().id(LIST_ID).absolute().inset_0().overflow_y_scroll().p(6).gap(8)
      .children(m.sections.map((s) => section(t, s, m.now, handlers))))
    .child(Scrollbar.vertical(LIST_ID).absolute().inset_0());
}

// m: {now, at, stale, inFlight, problem, sections: [{kind, title, subtitle, total, items, note, collapsed}] | null, note}
export function renderPanel(t, m, handlers) {
  return v_flex().id("gh-prs").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
    .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
    .child(header(t, m, handlers.onRefresh))
    .child(body(t, m, handlers))
    .when(Boolean(m.note), (el) => el.child(div().px(14).py(6).border_t(1).border_color(t.border).text_size(11).text_color(t.ansi1).child(m.note)));
}
