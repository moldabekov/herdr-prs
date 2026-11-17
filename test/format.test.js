import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime, ciStatus, badges } from "../mods/gh-prs/format.js";

const now = Date.parse("2026-11-17T12:00:00Z");
const pr = (over = {}) => ({ number: 1, title: "t", url: "u", isDraft: false, review: null, mergeable: "MERGEABLE", ci: null, updatedAt: "", branch: "b", author: "a", repo: "o/r", ...over });

test("relativeTime buckets", () => {
  assert.equal(relativeTime("2026-11-17T11:59:30Z", now), "now");
  assert.equal(relativeTime("2026-11-17T11:59:00Z", now), "1m");
  assert.equal(relativeTime("2026-11-17T11:05:00Z", now), "55m");
  assert.equal(relativeTime("2026-11-17T09:00:00Z", now), "3h");
  assert.equal(relativeTime("2026-11-10T12:00:00Z", now), "7d");
  assert.equal(relativeTime("2026-08-17T12:00:00Z", now), "3mo");
  assert.equal(relativeTime("2024-11-17T12:00:00Z", now), "2y");
});

test("relativeTime: future is now, invalid is empty", () => {
  assert.equal(relativeTime("2026-11-18T00:00:00Z", now), "now");
  assert.equal(relativeTime("garbage", now), "");
  assert.equal(relativeTime(undefined, now), "");
});

test("relativeTime accepts epoch milliseconds", () => {
  assert.equal(relativeTime(now - 5 * 60000, now), "5m");
});

test("ciStatus maps every rollup state", () => {
  assert.deepEqual(ciStatus("SUCCESS"), { kind: "pass", icon: "check.svg", color: "ansi2" });
  assert.deepEqual(ciStatus("FAILURE"), { kind: "fail", icon: "x.svg", color: "ansi1" });
  assert.deepEqual(ciStatus("ERROR"), { kind: "fail", icon: "x.svg", color: "ansi1" });
  assert.deepEqual(ciStatus("PENDING"), { kind: "pending", icon: "dot.svg", color: "working" });
  assert.deepEqual(ciStatus("EXPECTED"), { kind: "pending", icon: "dot.svg", color: "working" });
  assert.deepEqual(ciStatus(null), { kind: "none", icon: "dot.svg", color: "dim" });
  assert.deepEqual(ciStatus("WEIRD"), { kind: "none", icon: "dot.svg", color: "dim" });
});

test("badges: review first, then Draft, then Conflict", () => {
  assert.deepEqual(badges(pr({ review: "APPROVED", isDraft: true, mergeable: "CONFLICTING" })),
    [{ label: "Approved", color: "ansi2" }, { label: "Draft", color: "dim" }, { label: "Conflict", color: "ansi1" }]);
});

test("badges: each review decision", () => {
  assert.deepEqual(badges(pr({ review: "CHANGES_REQUESTED" })), [{ label: "Changes", color: "ansi1" }]);
  assert.deepEqual(badges(pr({ review: "REVIEW_REQUIRED" })), [{ label: "Review", color: "muted" }]);
});

test("badges: nothing for a plain or UNKNOWN-mergeable PR", () => {
  assert.deepEqual(badges(pr()), []);
  assert.deepEqual(badges(pr({ mergeable: "UNKNOWN" })), []);
});
