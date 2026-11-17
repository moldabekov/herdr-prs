// Drives the real panel.js with a stand-in host. Covers the review findings
// that live in the panel's wiring: retry pacing (#1), the label staying with
// its data (#4), and never calling GitHub while hidden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/host-loader.mjs", import.meta.url);
const host = await import("./support/fake-herdr.js");
const { PanelView } = await import("../mods/gh-prs/panel.js");

const settle = () => new Promise((r) => setTimeout(r, 30));
let clock = 1_000_000;
Date.now = () => clock;

// A cx whose notify re-renders, the way Herdr redraws after cx.notify().
function mount() {
  const view = new PanelView();
  let tick = null, alive = true;
  const cx = {
    timer: { every: (_ms, fn) => { tick = fn; } },
    spawn: (fn) => { Promise.resolve().then(() => fn(cx)); },
    notify: () => { setImmediate(() => { if (alive) view.render(cx); }); },
  };
  view.init({}, cx);
  view.render(cx);
  return { view, tick: () => tick(cx), stop: () => { alive = false; } };
}

test("offline from the start: one gh call, not a retry loop", async () => {
  host.reset({ ghOk: false });
  const panel = mount();
  await settle(); await settle();
  panel.stop();
  assert.equal(host.calls.gh, 1);
  assert.equal(panel.view.state.problem.kind, "network");
});

test("network drop after a load: one call per tick, old lists kept", async () => {
  host.reset();
  const panel = mount();
  await settle();
  assert.equal(host.calls.gh, 1);
  host.control.ghOk = false;
  clock += 60_000;
  panel.tick();
  await settle(); await settle();
  assert.equal(host.calls.gh, 2);
  assert.equal(panel.view.state.stale, true);
  assert.notEqual(panel.view.state.data, null);
  clock += 15_000; // the next tick, too soon after the failed try
  panel.tick();
  await settle();
  panel.stop();
  assert.equal(host.calls.gh, 2);
});

test("a failed fetch for a new repo keeps the old repo's label with its lists", async () => {
  host.reset();
  const panel = mount();
  await settle();
  host.control.ghOk = false;
  host.control.cwd = "/w/b";
  panel.view.render({ ...{}, timer: { every() {} }, spawn: (fn) => Promise.resolve().then(() => fn({ notify() {} })), notify() {} });
  await settle(); await settle();
  panel.stop();
  assert.equal(panel.view.state.source.repo.name, "a");
  assert.match(panel.view.state.data.repo.items[0].url, /\/o\/a\//);
});

test("hidden panel: no git or gh calls, even on a tick", async () => {
  host.reset({ shown: false });
  const panel = mount();
  clock += 120_000;
  panel.tick();
  await settle();
  panel.stop();
  assert.deepEqual(host.calls, { gh: 0, git: 0 });
});
