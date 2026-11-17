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

// The two lists as the view draws them. A folder note (no repo, no remote)
// explains This repo better than an empty list, so it wins over the API error.
export function toSections(data, repo, repoNote, collapsed) {
  if (!data) return null;
  const list = (s) => ({ total: s?.total ?? 0, items: s?.items ?? [] });
  return [
    {
      kind: "repo", title: "This repo", subtitle: repo ? `${repo.owner}/${repo.name}` : null,
      ...list(data.repo), note: repoNote ?? data.repo?.error ?? null, collapsed: Boolean(collapsed?.repo),
    },
    {
      kind: "mine", title: "Mine", subtitle: null,
      ...list(data.mine), note: data.mine?.error ?? null, collapsed: Boolean(collapsed?.mine),
    },
  ];
}

export function parseCollapsed(text) {
  try {
    const value = JSON.parse(text);
    const ok = Boolean(value) && typeof value === "object" && !Array.isArray(value);
    return { repo: ok && value.repo === true, mine: ok && value.mine === true };
  } catch {
    return { repo: false, mine: false };
  }
}

export function toggleCollapsed(collapsed, kind) {
  return { ...collapsed, [kind]: !collapsed[kind] };
}
