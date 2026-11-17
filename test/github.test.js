import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMIT, MINE_QUERY, buildQuery, ghArgs, parseResponse, classifyFailure } from "../mods/gh-prs/github.js";

// Shape captured from the real API on 2026-11-17.
const node = (over = {}) => ({
  number: 42, title: "chore(deps): bump the base image", url: "https://github.com/acme/website/pull/42",
  isDraft: false, reviewDecision: null, mergeable: "MERGEABLE", updatedAt: "2026-11-17T09:00:00Z",
  headRefName: "deps/base-image", author: { login: "octocat" },
  repository: { nameWithOwner: "acme/website" },
  commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
  ...over,
});
const response = (data, errors) => JSON.stringify(errors ? { data, errors } : { data });

test("limit and the Mine search string are fixed", () => {
  assert.equal(LIMIT, 30);
  assert.equal(MINE_QUERY, "is:pr is:open author:@me archived:false sort:updated-desc");
});

test("buildQuery includes repository only when asked", () => {
  assert.match(buildQuery(true), /repository\(owner:\s*\$owner,\s*name:\s*\$name\)/);
  assert.match(buildQuery(true), /\$owner:\s*String!/);
  assert.doesNotMatch(buildQuery(false), /repository\(|\$owner/);
  assert.match(buildQuery(false), /mine:\s*search\(query:\s*\$mine/);
  assert.match(buildQuery(false), /viewer\s*\{\s*login/);
});

test("buildQuery asks for 30 of each list and the status fields", () => {
  const q = buildQuery(true);
  assert.equal((q.match(/first:\s*30/g) ?? []).length, 2);
  for (const field of ["reviewDecision", "mergeable", "isDraft", "statusCheckRollup", "headRefName", "nameWithOwner"]) assert.match(q, new RegExp(field));
});

test("ghArgs passes every value with -f, never -F", () => {
  const a = ghArgs({ owner: "1acme", name: "123" });
  assert.ok(!a.includes("-F"));
  assert.deepEqual(a.slice(0, 2), ["api", "graphql"]);
  assert.ok(a.includes("owner=1acme") && a.includes("name=123"));
  assert.ok(a.includes(`mine=${MINE_QUERY}`));
  assert.ok(a.includes(`query=${buildQuery(true)}`));
  assert.equal(a.filter((s) => s === "-f").length, 4);
});

test("ghArgs without a repo sends no owner or name", () => {
  const a = ghArgs(null);
  assert.equal(a.some((s) => s.startsWith("owner=") || s.startsWith("name=")), false);
  assert.ok(a.includes(`query=${buildQuery(false)}`));
});

test("parseResponse maps PR nodes", () => {
  const out = parseResponse(response({
    viewer: { login: "octocat" },
    repository: { nameWithOwner: "o/r", pullRequests: { totalCount: 2, nodes: [
      node({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] }, reviewDecision: "APPROVED" }),
      node({ number: 7, isDraft: true, mergeable: "CONFLICTING", author: null }),
    ] } },
    mine: { issueCount: 1, nodes: [node()] },
  }));
  assert.deepEqual(out.repo.items[0], {
    number: 42, title: "chore(deps): bump the base image", url: "https://github.com/acme/website/pull/42",
    isDraft: false, review: "APPROVED", mergeable: "MERGEABLE", ci: "SUCCESS", updatedAt: "2026-11-17T09:00:00Z",
    branch: "deps/base-image", author: "octocat", repo: "acme/website",
  });
  assert.equal(out.repo.items[1].ci, null);
  assert.equal(out.repo.items[1].author, null);
  assert.equal(out.repo.items[1].isDraft, true);
  assert.equal(out.repo.items[1].mergeable, "CONFLICTING");
  assert.equal(out.repo.total, 2);
  assert.equal(out.repo.error, null);
  assert.equal(out.mine.total, 1);
});

test("parseResponse gives repo null when no repository was asked", () => {
  const out = parseResponse(response({ viewer: { login: "me" }, mine: { issueCount: 0, nodes: [] } }));
  assert.equal(out.repo, null);
  assert.deepEqual(out.mine, { items: [], total: 0, error: null });
});

test("parseResponse keeps mine when repository errors", () => {
  const out = parseResponse(response(
    { viewer: { login: "me" }, repository: null, mine: { issueCount: 1, nodes: [node()] } },
    [{ path: ["repository"], message: "Could not resolve to a Repository with the name 'o/gone'." }],
  ));
  assert.deepEqual(out.repo, { items: [], total: 0, error: "Could not resolve to a Repository with the name 'o/gone'." });
  assert.equal(out.mine.items.length, 1);
  assert.equal(out.mine.error, null);
});

test("parseResponse puts a mine error on mine", () => {
  const out = parseResponse(response({ viewer: { login: "me" }, mine: null }, [{ path: ["mine"], message: "search failed" }]));
  assert.deepEqual(out.mine, { items: [], total: 0, error: "search failed" });
});

test("parseResponse reports total beyond the page", () => {
  const nodes = Array.from({ length: 30 }, (_, i) => node({ number: i + 1 }));
  const out = parseResponse(response({ viewer: { login: "me" }, mine: { issueCount: 45, nodes } }));
  assert.equal(out.mine.items.length, 30);
  assert.equal(out.mine.total, 45);
});

test("parseResponse skips search nodes that are not pull requests", () => {
  const out = parseResponse(response({ viewer: { login: "me" }, mine: { issueCount: 1, nodes: [{}, node()] } }));
  assert.equal(out.mine.items.length, 1);
});

test("parseResponse throws the first error when data is absent", () => {
  assert.throws(() => parseResponse(JSON.stringify({ errors: [{ message: "API rate limit exceeded" }] })), /rate limit/);
});

test("parseResponse throws on invalid JSON", () => {
  assert.throws(() => parseResponse("not json"));
});

test("classifyFailure: an Error that is not a timeout means gh is missing", () => {
  assert.equal(classifyFailure(new Error("spawn gh ENOENT")).kind, "missing-gh");
});

test("classifyFailure: a timeout is a network failure", () => {
  assert.deepEqual(classifyFailure(new Error("timed out after 20000 ms")), { kind: "network", message: "timed out after 20000 ms" });
  assert.equal(classifyFailure(new Error("Timeout")).kind, "network");
});

test("classifyFailure: an auth prompt is auth", () => {
  assert.equal(classifyFailure({ code: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login" }).kind, "auth");
  assert.equal(classifyFailure({ code: 1, stdout: "", stderr: "HTTP 401: Bad credentials" }).kind, "auth");
});

test("classifyFailure: anything else is network with the first stderr line", () => {
  assert.deepEqual(classifyFailure({ code: 1, stdout: "", stderr: "\nHTTP 502: Bad Gateway\nmore" }), { kind: "network", message: "HTTP 502: Bad Gateway" });
  assert.deepEqual(classifyFailure({ code: 3, stdout: "", stderr: "" }), { kind: "network", message: "gh exited 3" });
});

test("outcomeFromExec: JSON stdout is data, even with a nonzero exit", async () => {
  const { outcomeFromExec } = await import("../mods/gh-prs/github.js");
  const stdout = JSON.stringify({ data: { viewer: { login: "me" }, repository: null, mine: { issueCount: 0, nodes: [] } }, errors: [{ path: ["repository"], message: "gone" }] });
  const out = outcomeFromExec({ code: 1, stdout, stderr: "gh: gone" });
  assert.equal(out.ok, true);
  assert.equal(out.data.repo.error, "gone");
});

test("outcomeFromExec: unreadable JSON is a network failure", async () => {
  const { outcomeFromExec } = await import("../mods/gh-prs/github.js");
  assert.deepEqual(outcomeFromExec({ code: 0, stdout: '{"errors":[{"message":"API rate limit exceeded"}]}', stderr: "" }),
    { ok: false, failure: { kind: "network", message: "API rate limit exceeded" } });
});

test("outcomeFromExec: no JSON goes through classifyFailure", async () => {
  const { outcomeFromExec } = await import("../mods/gh-prs/github.js");
  assert.deepEqual(outcomeFromExec({ code: 4, stdout: "", stderr: "please run:  gh auth login" }),
    { ok: false, failure: { kind: "auth", message: "please run:  gh auth login" } });
});

// Review Important #2: a revoked token answers 401 with a JSON body on stdout.
test("outcomeFromExec: a 401 JSON body with a nonzero exit is auth", async () => {
  const { outcomeFromExec } = await import("../mods/gh-prs/github.js");
  const out = outcomeFromExec({ code: 1, stdout: '{"message":"Bad credentials","documentation_url":"https://docs.github.com/rest","status":"401"}', stderr: "gh: Bad credentials (HTTP 401)" });
  assert.equal(out.ok, false);
  assert.equal(out.failure.kind, "auth");
});

test("parseResponse uses a REST-style message when there is no data", () => {
  assert.throws(() => parseResponse('{"message":"Bad credentials","status":"401"}'), /Bad credentials/);
});

// Review: one inaccessible PR (a SAML org) must not blank the whole list.
test("parseResponse keeps a section whose data came back next to a nested error", () => {
  const out = parseResponse(response(
    { viewer: { login: "me" }, mine: { issueCount: 4, nodes: [node({ number: 1 }), node({ number: 2 }), node({ number: 3 }), null] } },
    [{ path: ["mine", "nodes", 3], message: "Resource protected by organization SAML enforcement." }],
  ));
  assert.equal(out.mine.error, null);
  assert.deepEqual(out.mine.items.map((p) => p.number), [1, 2, 3]);
  assert.equal(out.mine.total, 4);
});
