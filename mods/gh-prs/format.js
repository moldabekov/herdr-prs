// How a PR's state reads on screen. Colors are theme key names; icons are file
// names under mods/gh-prs/icons/. Pure: no host imports.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const STEPS = [
  { below: HOUR, unit: MINUTE, suffix: "m" },
  { below: DAY, unit: HOUR, suffix: "h" },
  { below: 30 * DAY, unit: DAY, suffix: "d" },
  { below: 365 * DAY, unit: 30 * DAY, suffix: "mo" },
  { below: Infinity, unit: 365 * DAY, suffix: "y" },
];

export function relativeTime(when, nowMs) {
  const at = typeof when === "number" ? when : Date.parse(when);
  if (Number.isNaN(at)) return "";
  const age = nowMs - at;
  if (age < MINUTE) return "now";
  const step = STEPS.find((s) => age < s.below);
  return `${Math.floor(age / step.unit)}${step.suffix}`;
}

const CI = {
  SUCCESS: { kind: "pass", icon: "check.svg", color: "ansi2" },
  FAILURE: { kind: "fail", icon: "x.svg", color: "ansi1" },
  ERROR: { kind: "fail", icon: "x.svg", color: "ansi1" },
  PENDING: { kind: "pending", icon: "dot.svg", color: "working" },
  EXPECTED: { kind: "pending", icon: "dot.svg", color: "working" },
};
const NO_CI = { kind: "none", icon: "dot.svg", color: "dim" };

export function ciStatus(state) {
  return { ...(CI[state] ?? NO_CI) };
}

const REVIEW = {
  APPROVED: { label: "Approved", color: "ansi2" },
  CHANGES_REQUESTED: { label: "Changes", color: "ansi1" },
  REVIEW_REQUIRED: { label: "Review", color: "muted" },
};

export function badges(pr) {
  return [
    REVIEW[pr.review],
    pr.isDraft ? { label: "Draft", color: "dim" } : null,
    pr.mergeable === "CONFLICTING" ? { label: "Conflict", color: "ansi1" } : null,
  ].filter(Boolean).map((b) => ({ ...b }));
}
