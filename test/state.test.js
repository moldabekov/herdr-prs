import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVAL_MS, initialState, applyFetch, needsRefresh } from "../mods/gh-prs/state.js";

const data = { repo: null, mine: { items: [], total: 0, error: null } };

test("interval is one minute and the first state is empty", () => {
  assert.equal(INTERVAL_MS, 60000);
  assert.deepEqual(initialState(), { data: null, at: null, problem: null, stale: false });
});

test("applyFetch: success replaces data and clears the problem", () => {
  const prev = { data: null, at: null, problem: { kind: "network", message: "x" }, stale: true };
  assert.deepEqual(applyFetch(prev, { ok: true, data }, 5000), { data, at: 5000, problem: null, stale: false });
});

test("applyFetch: network failure keeps last data and marks stale", () => {
  const loaded = applyFetch(initialState(), { ok: true, data }, 1000);
  const failed = applyFetch(loaded, { ok: false, failure: { kind: "network", message: "HTTP 502" } }, 2000);
  assert.equal(failed.data, loaded.data);
  assert.equal(failed.at, 1000);
  assert.equal(failed.stale, true);
  assert.deepEqual(failed.problem, { kind: "network", message: "HTTP 502" });
  assert.equal(loaded.stale, false);
  assert.equal(loaded.problem, null);
});

test("applyFetch: auth failure clears data", () => {
  const loaded = applyFetch(initialState(), { ok: true, data }, 1000);
  const failed = applyFetch(loaded, { ok: false, failure: { kind: "auth", message: "gh auth login" } }, 2000);
  assert.equal(failed.data, null);
  assert.equal(failed.problem.kind, "auth");
  assert.equal(failed.at, 2000);
});

test("applyFetch: missing gh clears data", () => {
  const failed = applyFetch(initialState(), { ok: false, failure: { kind: "missing-gh", message: "ENOENT" } }, 3000);
  assert.equal(failed.data, null);
  assert.equal(failed.problem.kind, "missing-gh");
});

test("applyFetch never mutates prev", () => {
  const prev = Object.freeze(initialState());
  assert.doesNotThrow(() => applyFetch(prev, { ok: true, data }, 1));
  assert.doesNotThrow(() => applyFetch(prev, { ok: false, failure: { kind: "network", message: "m" } }, 1));
});

test("needsRefresh rules", () => {
  const base = { shown: true, inFlight: false, at: 0, now: 59999, contextChanged: false };
  assert.equal(needsRefresh({ ...base, shown: false, at: null }), false);
  assert.equal(needsRefresh({ ...base, inFlight: true, at: null }), false);
  assert.equal(needsRefresh({ ...base, at: null }), true);
  assert.equal(needsRefresh(base), false);
  assert.equal(needsRefresh({ ...base, now: 60000 }), true);
  assert.equal(needsRefresh({ ...base, contextChanged: true }), true);
});

const { toSections, parseCollapsed, toggleCollapsed } = await import("../mods/gh-prs/state.js");
const prRow = { number: 1, title: "t", url: "u", isDraft: false, review: null, mergeable: "MERGEABLE", ci: null, updatedAt: "", branch: "b", author: "a", repo: "o/r" };

test("toSections: null until data arrives", () => {
  assert.equal(toSections(null, null, null, {}), null);
});

test("toSections builds This repo and Mine", () => {
  const data = { repo: { items: [prRow], total: 3, error: null }, mine: { items: [], total: 0, error: null } };
  const [repo, mine] = toSections(data, { owner: "o", name: "r" }, null, { repo: false, mine: true });
  assert.deepEqual(repo, { kind: "repo", title: "This repo", subtitle: "o/r", total: 3, items: [prRow], note: null, collapsed: false });
  assert.deepEqual(mine, { kind: "mine", title: "Mine", subtitle: null, total: 0, items: [], note: null, collapsed: true });
});

test("toSections: the folder note wins, then the section's error", () => {
  const data = { repo: null, mine: { items: [], total: 0, error: "search failed" } };
  const [repo, mine] = toSections(data, null, "No GitHub remote", {});
  assert.equal(repo.note, "No GitHub remote");
  assert.equal(repo.subtitle, null);
  assert.equal(repo.total, 0);
  assert.equal(mine.note, "search failed");
  const [repo2] = toSections({ repo: { items: [], total: 0, error: "Could not resolve" }, mine: data.mine }, { owner: "o", name: "r" }, null, {});
  assert.equal(repo2.note, "Could not resolve");
});

test("parseCollapsed tolerates junk", () => {
  assert.deepEqual(parseCollapsed('{"repo":true}'), { repo: true, mine: false });
  assert.deepEqual(parseCollapsed("not json"), { repo: false, mine: false });
  assert.deepEqual(parseCollapsed(null), { repo: false, mine: false });
  assert.deepEqual(parseCollapsed("[1]"), { repo: false, mine: false });
});

test("toggleCollapsed returns a new object", () => {
  const before = Object.freeze({ repo: false, mine: false });
  assert.deepEqual(toggleCollapsed(before, "mine"), { repo: false, mine: true });
  assert.deepEqual(before, { repo: false, mine: false });
});
