// Drives the real button.js with a stand-in host: the PRs open/closed state is
// global, so a space switch that closes the panel gets it reopened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./support/host-loader.mjs", import.meta.url);
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const host = await import("./support/fake-herdr.js");
const { ButtonView } = await import("../mods/gh-prs/button.js");

const names = () => host.commands.map((c) => `${c.name}:${c.args.child ?? c.args.id}`);
const mount = () => { const v = new ButtonView(); v.init({}, {}); v.render(); return v; };
const later = (ms) => { const real = Date.now(); Date.now = () => real + ms; };

test("remembered open: a space switch that closes PRs reopens it", () => {
  host.reset();
  store.set("open", "true");
  mount();
  host.commands.length = 0;
  const view = mount();
  host.control.space = "s2";
  host.control.shown = false;
  view.render();
  assert.deepEqual(names(), ["layout.select:gh-prs", "layout.show:panel"]);
});

test("remembered closed: a space switch leaves the panel alone", () => {
  host.reset({ shown: false });
  store.set("open", "false");
  const view = mount();
  host.control.space = "s2";
  view.render();
  assert.deepEqual(host.commands, []);
});

test("clicking PRs open remembers it, clicking it closed forgets it", () => {
  host.reset({ shown: false });
  store.set("open", "false");
  const view = mount();
  view.toggle(false);
  assert.equal(store.get("open"), "true");
  assert.deepEqual(names(), ["layout.select:gh-prs", "layout.show:panel"]);
  host.commands.length = 0;
  view.toggle(true);
  assert.equal(store.get("open"), "false");
  assert.deepEqual(names(), ["layout.hide:panel"]);
});

test("switching to Files in the same space closes PRs globally", () => {
  host.reset();
  store.set("open", "true");
  const view = mount();
  later(5000);
  host.control.shown = false; // Files now shows instead; same space
  view.render();
  assert.equal(store.get("open"), "false");
  assert.deepEqual(host.commands, []);
});
