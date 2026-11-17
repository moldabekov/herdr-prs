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
