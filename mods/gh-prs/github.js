// The one GraphQL call per refresh, and reading its answer. Pure: no host imports.

export const LIMIT = 30;
export const MINE_QUERY = "is:pr is:open author:@me archived:false sort:updated-desc";
// Includes requests to a team you are on; GitHub drops you once you have reviewed.
export const REVIEW_QUERY = "is:pr is:open review-requested:@me archived:false sort:updated-desc";

const FRAGMENT = `fragment pr on PullRequest {
  number title url isDraft reviewDecision mergeable updatedAt headRefName
  author { login }
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
}`;

const REPOSITORY = `repository(owner: $owner, name: $name) {
    nameWithOwner
    pullRequests(states: OPEN, first: ${LIMIT}, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount nodes { ...pr }
    }
  }`;

export function buildQuery(withRepo) {
  const vars = withRepo ? "$mine: String!, $review: String!, $owner: String!, $name: String!" : "$mine: String!, $review: String!";
  return `query(${vars}) {
  viewer { login }
  ${withRepo ? REPOSITORY : ""}
  review: search(query: $review, type: ISSUE, first: ${LIMIT}) { issueCount nodes { ...pr } }
  mine: search(query: $mine, type: ISSUE, first: ${LIMIT}) { issueCount nodes { ...pr } }
}
${FRAGMENT}`;
}

// -f sends every value as a string; -F would turn a repo named "123" into a number.
export function ghArgs(repo) {
  const base = ["api", "graphql", "-f", `query=${buildQuery(Boolean(repo))}`, "-f", `mine=${MINE_QUERY}`, "-f", `review=${REVIEW_QUERY}`];
  return repo ? [...base, "-f", `owner=${repo.owner}`, "-f", `name=${repo.name}`] : base;
}

function toRow(node) {
  return {
    number: node.number,
    title: node.title,
    url: node.url,
    isDraft: Boolean(node.isDraft),
    review: node.reviewDecision ?? null,
    mergeable: node.mergeable ?? "UNKNOWN",
    ci: node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
    updatedAt: node.updatedAt,
    branch: node.headRefName,
    author: node.author?.login ?? null,
    repo: node.repository?.nameWithOwner,
  };
}

function section(nodes, total, error) {
  if (error) return { items: [], total: 0, error };
  return { items: (nodes ?? []).filter((n) => n && typeof n.number === "number").map(toRow), total: total ?? 0, error: null };
}

// An error only stands for a whole section when that section came back empty;
// one inaccessible PR (a SAML org) arrives as a null node beside the others.
function errorFor(errors, key, value) {
  if (value) return null;
  return errors.find((e) => e?.path?.[0] === key)?.message ?? null;
}

export function parseResponse(stdout) {
  const body = JSON.parse(stdout);
  const errors = Array.isArray(body.errors) ? body.errors : [];
  if (!body.data) throw new Error(errors[0]?.message ?? body.message ?? "GitHub returned no data");
  const { data } = body;
  const repoError = errorFor(errors, "repository", data.repository);
  const asked = "repository" in data || repoError !== null;
  const prs = data.repository?.pullRequests;
  return {
    repo: asked ? section(prs?.nodes, prs?.totalCount, repoError) : null,
    review: section(data.review?.nodes, data.review?.issueCount, errorFor(errors, "review", data.review)),
    mine: section(data.mine?.nodes, data.mine?.issueCount, errorFor(errors, "mine", data.mine)),
  };
}

// gh prints the GraphQL body on stdout even when it exits 1 for a partial error
// (an unknown repo), so JSON on stdout is read first. JSON without data on a
// failed exit (a 401 body) is gh's error: classify it from stderr.
export function outcomeFromExec(result) {
  if (!String(result?.stdout ?? "").trimStart().startsWith("{")) return { ok: false, failure: classifyFailure(result) };
  try {
    return { ok: true, data: parseResponse(result.stdout) };
  } catch (error) {
    if (result.code !== 0) return { ok: false, failure: classifyFailure(result) };
    return { ok: false, failure: { kind: "network", message: error.message } };
  }
}

// Only GitHub's own PR pages go to the browser.
export function isGitHubUrl(url) {
  return typeof url === "string" && /^https:\/\/github\.com\/[^\s]+$/.test(url);
}

const TIMEOUT = /time(d)?\s?out/i;
const AUTH = /auth login|not logged in|authentication|HTTP 401/i;

export function classifyFailure(failure) {
  if (failure instanceof Error) {
    return { kind: TIMEOUT.test(failure.message) ? "network" : "missing-gh", message: failure.message };
  }
  const stderr = String(failure?.stderr ?? "");
  const first = stderr.split("\n").map((l) => l.trim()).find(Boolean);
  if (AUTH.test(stderr)) return { kind: "auth", message: first ?? "Not logged in to GitHub" };
  return { kind: "network", message: first ?? `gh exited ${failure?.code}` };
}
