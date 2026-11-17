import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTLE_MS, initialMemory, observe, clicked, parseOpen } from "../mods/gh-prs/memory.js";

// Plays a sequence of layout observations through observe(), collecting reopens.
function play(mem, steps) {
  let reopens = 0;
  for (const step of steps) {
    const out = observe(mem, step);
    mem = out.mem;
    if (out.reopen) reopens += 1;
  }
  return { mem, reopens };
}

test("settle window is long enough for the tab bar's restore", () => {
  assert.ok(SETTLE_MS >= 1000);
});

test("open PRs stay open across a space switch the tab bar closes", () => {
  const { mem, reopens } = play(initialMemory(true), [
    { space: "a", shown: true, now: 0 },
    { space: "b", shown: true, now: 5000 },    // switched; the tab bar has not acted yet
    { space: "b", shown: false, now: 5050 },   // the tab bar closed the panel
  ]);
  assert.equal(reopens, 1);
  assert.equal(mem.open, true);
});

test("coming back to the first space reopens too", () => {
  const { mem, reopens } = play(initialMemory(true), [
    { space: "a", shown: true, now: 0 },
    { space: "b", shown: false, now: 5000 },
    { space: "b", shown: true, now: 5100 },
    { space: "a", shown: false, now: 9000 },
  ]);
  assert.equal(reopens, 2);
  assert.equal(mem.open, true);
});

test("a reopen is sent once while waiting for it to land", () => {
  const { reopens } = play(initialMemory(true), [
    { space: "a", shown: true, now: 0 },
    { space: "b", shown: false, now: 5000 },
    { space: "b", shown: false, now: 5010 },   // other live data re-rendered first
    { space: "b", shown: false, now: 5020 },
  ]);
  assert.equal(reopens, 1);
});

test("the tab bar closing it again inside the settle window is answered again", () => {
  const { reopens } = play(initialMemory(true), [
    { space: "a", shown: true, now: 0 },
    { space: "b", shown: false, now: 5000 },
    { space: "b", shown: true, now: 5100 },
    { space: "b", shown: false, now: 5200 },
  ]);
  assert.equal(reopens, 2);
});

test("closed PRs stay closed across spaces", () => {
  const { mem, reopens } = play(initialMemory(false), [
    { space: "a", shown: false, now: 0 },
    { space: "b", shown: false, now: 5000 },
  ]);
  assert.equal(reopens, 0);
  assert.equal(mem.open, false);
});

test("the person switching to Files (no space change) closes PRs globally", () => {
  const { mem, reopens } = play(initialMemory(true), [
    { space: "a", shown: true, now: 0 },
    { space: "a", shown: false, now: 5000 },
    { space: "b", shown: false, now: 9000 },
  ]);
  assert.equal(mem.open, false);
  assert.equal(reopens, 0);
});

test("opening PRs some other way (no space change) opens it globally", () => {
  const { mem } = play(initialMemory(false), [
    { space: "a", shown: false, now: 0 },
    { space: "a", shown: true, now: 5000 },
  ]);
  assert.equal(mem.open, true);
});

test("on start, a remembered open state reopens the panel", () => {
  const { reopens } = play(initialMemory(true), [{ space: "a", shown: false, now: 0 }]);
  assert.equal(reopens, 1);
});

test("clicked records the new state so it is not read back as a second change", () => {
  let mem = play(initialMemory(false), [{ space: "a", shown: false, now: 0 }]).mem;
  mem = clicked(mem, true, 5000);
  assert.equal(mem.open, true);
  const after = play(mem, [{ space: "a", shown: true, now: 5050 }]);
  assert.equal(after.mem.open, true);
  assert.equal(after.reopens, 0);
});

test("observe and clicked never mutate their input", () => {
  const mem = Object.freeze(initialMemory(true));
  assert.doesNotThrow(() => observe(mem, { space: "a", shown: false, now: 0 }));
  assert.doesNotThrow(() => clicked(mem, false, 0));
});

test("parseOpen reads only a stored true", () => {
  assert.equal(parseOpen("true"), true);
  assert.equal(parseOpen("false"), false);
  assert.equal(parseOpen(null), false);
  assert.equal(parseOpen("junk"), false);
});
