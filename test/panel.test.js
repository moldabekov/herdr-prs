// Drives the real panel.js with a stand-in host. Covers the review findings
// that live in the panel's wiring: retry pacing (#1), the label staying with
// its data (#4), and never calling GitHub while hidden.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/host-loader.mjs", import.meta.url);
const host = await import("./support/fake-herdr.js");
const { PanelView } = await import("../mods/gh-prs/panel.js");

const settle = () => new Promise((r) => setTimeout(r, 30));
let clock = 1_000_000;
Date.now = () => clock;

// A cx whose notify re-renders, the way Herdr redraws after cx.notify().
// Every mounted panel is stopped after its test, pass or fail, and a runaway
// render loop is cut off, so a regression fails instead of hanging the run.
const MAX_RENDERS = 500;
const mounted = [];
afterEach(() => { mounted.splice(0).forEach((p) => p.stop()); });

function mount() {
  const view = new PanelView();
  let tick = null, alive = true, renders = 0;
  const cx = {
    timer: { every: (_ms, fn) => { tick = fn; } },
    spawn: (fn) => { Promise.resolve().then(() => fn(cx)); },
    notify: () => { setImmediate(() => { if (alive && ++renders < MAX_RENDERS) view.render(cx); }); },
  };
  view.init({}, cx);
  view.render(cx);
  const panel = { view, tick: () => tick(cx), stop: () => { alive = false; } };
  mounted.push(panel);
  return panel;
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
  assert.deepEqual(host.calls, { gh: 0, git: 0, open: 0 });
});

// Deferred minor: a cd inside the same repo must not refetch.
test("moving to a subfolder of the same repo does not call GitHub again", async () => {
  host.reset();
  const panel = mount();
  await settle();
  assert.equal(host.calls.gh, 1);
  host.control.cwd = "/w/a/sub";
  panel.view.render({ timer: { every() {} }, spawn: (fn) => Promise.resolve().then(() => fn({ notify() {} })), notify() {} });
  await settle(); await settle();
  panel.stop();
  assert.equal(host.calls.gh, 1);
  assert.ok(host.calls.git > 2); // it did look at the new folder
});

test("the refresh button fetches even when nothing is due", async () => {
  host.reset();
  const panel = mount();
  await settle();
  panel.view.refresh({ spawn: (fn) => Promise.resolve().then(() => fn({ notify() {} })), notify() {} }, true);
  await settle(); await settle();
  panel.stop();
  assert.equal(host.calls.gh, 2);
});

// Deferred minor: only GitHub links reach the browser.
test("open() refuses a link that is not https://github.com", async () => {
  host.reset();
  const panel = mount();
  await settle();
  const cx = { spawn: (fn) => Promise.resolve().then(() => fn({ notify() {} })), notify() {} };
  panel.view.open("file:///etc/passwd", cx);
  await settle();
  assert.equal(host.calls.open, 0);
  assert.match(panel.view.note, /Not a GitHub link/);
  panel.view.open("https://github.com/o/a/pull/1", cx);
  await settle();
  panel.stop();
  assert.equal(host.calls.open, 1);
});

// Deferred minor: an unexpected error is shown and paced, not swallowed or looped.
test("an unexpected error in a refresh is shown and does not retry at once", async () => {
  host.reset();
  const panel = mount();
  await settle();
  host.control.ghOk = false;
  panel.view.state = new Proxy(panel.view.state, { ownKeys() { throw new Error("boom"); } });
  clock += 60_000;
  panel.tick();
  await settle(); await settle();
  assert.equal(host.calls.gh, 2);
  assert.match(panel.view.note, /Couldn't update pull requests: boom/);
  clock += 15_000;
  panel.tick();
  await settle();
  panel.stop();
  assert.equal(host.calls.gh, 2);
});
