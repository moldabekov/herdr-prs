// The panel's data over time: what a fetch result does to it, and when to fetch.
// Pure: no host imports, never mutates its inputs.

export const INTERVAL_MS = 60000;

// data: the lists; source: {repo, note} of the folder those lists describe;
// at: when data last arrived (the "updated" label); triedAt: the last attempt,
// success or not, which paces the next one.
export function initialState() {
  return { data: null, source: null, at: null, triedAt: null, problem: null, stale: false };
}

// A network hiccup keeps the last lists, and the label they belong to, on
// screen; a missing gh or a logged-out gh leaves nothing trustworthy to show.
export function applyFetch(prev, outcome, now) {
  if (outcome.ok) return { data: outcome.data, source: outcome.source ?? null, at: now, triedAt: now, problem: null, stale: false };
  const problem = { ...outcome.failure };
  if (problem.kind === "network") return { ...prev, triedAt: now, problem, stale: true };
  return { data: null, source: null, at: now, triedAt: now, problem, stale: false };
}

// Paced from the last attempt, so a failure waits a full interval like a success.
export function needsRefresh({ shown, inFlight, triedAt, now, contextChanged }) {
  if (!shown || inFlight) return false;
  return contextChanged || triedAt === null || now - triedAt >= INTERVAL_MS;
}

// The three lists as the view draws them, in this order. A folder note (no repo, no remote)
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
      kind: "review", title: "Review requested", subtitle: null,
      ...list(data.review), note: data.review?.error ?? null, collapsed: Boolean(collapsed?.review),
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
    return { repo: ok && value.repo === true, review: ok && value.review === true, mine: ok && value.mine === true };
  } catch {
    return { repo: false, review: false, mine: false };
  }
}

export function toggleCollapsed(collapsed, kind) {
  return { ...collapsed, [kind]: !collapsed[kind] };
}

// Two looks at a folder point at the same thing: the same GitHub repo, or the
// same reason there is none.
export function sameSource(a, b) {
  if (!a || !b) return false;
  if (a.repo || b.repo) return Boolean(a.repo && b.repo && a.repo.owner === b.repo.owner && a.repo.name === b.repo.name);
  return a.note === b.note;
}

// A folder change only costs a GitHub call when it lands in another repo, or
// when the interval is up anyway. The refresh button forces one.
export function shouldFetch({ source, state, now, force }) {
  if (force || state.triedAt === null || now - state.triedAt >= INTERVAL_MS) return true;
  return !sameSource(source, state.source);
}

export function latest(a, b) {
  if (a === null || a === undefined) return b ?? null;
  if (b === null || b === undefined) return a;
  return Math.max(a, b);
}
