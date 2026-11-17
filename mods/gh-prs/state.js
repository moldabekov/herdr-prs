// The panel's data over time: what a fetch result does to it, and when to fetch.
// Pure: no host imports, never mutates its inputs.

export const INTERVAL_MS = 60000;

export function initialState() {
  return { data: null, at: null, problem: null, stale: false };
}

// A network hiccup keeps the last lists on screen; a missing gh or a logged-out
// gh means there is nothing trustworthy left to show.
export function applyFetch(prev, outcome, now) {
  if (outcome.ok) return { data: outcome.data, at: now, problem: null, stale: false };
  const problem = { ...outcome.failure };
  if (problem.kind === "network") return { ...prev, problem, stale: true };
  return { data: null, at: now, problem, stale: false };
}

export function needsRefresh({ shown, inFlight, at, now, contextChanged }) {
  if (!shown || inFlight) return false;
  return contextChanged || at === null || now - at >= INTERVAL_MS;
}
