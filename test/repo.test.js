import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGitHubRemote, resolveRepo } from "../mods/gh-prs/repo.js";

// Answers each git call by its joined args; records every call it gets.
function fakeExec(table) {
  const calls = [];
  const exec = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const answer = table[args.join(" ")];
    if (answer instanceof Error) throw answer;
    return answer ?? { code: 2, stdout: "", stderr: "error: No such remote" };
  };
  return { exec, calls };
}

const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const TOP = "rev-parse --show-toplevel";
const UPSTREAM = "remote get-url upstream";
const ORIGIN = "remote get-url origin";

test("parseGitHubRemote accepts the three forms", () => {
  assert.deepEqual(parseGitHubRemote("git@github.com:1acme/1acme-platform.git"), { owner: "1acme", name: "1acme-platform" });
  assert.deepEqual(parseGitHubRemote("ssh://git@github.com/a.b/c.d.git\n"), { owner: "a.b", name: "c.d" });
  assert.deepEqual(parseGitHubRemote("https://github.com/o/r/"), { owner: "o", name: "r" });
  assert.deepEqual(parseGitHubRemote("  https://github.com/o/r.git  "), { owner: "o", name: "r" });
});

test("parseGitHubRemote accepts credentials in an https remote", () => {
  assert.deepEqual(parseGitHubRemote("https://me@github.com/o/r.git"), { owner: "o", name: "r" });
});

test("parseGitHubRemote strips .git only at the end", () => {
  assert.deepEqual(parseGitHubRemote("git@github.com:o/my.git.tools.git"), { owner: "o", name: "my.git.tools" });
});

test("parseGitHubRemote rejects other hosts and malformed URLs", () => {
  assert.equal(parseGitHubRemote("git@gitlab.com:o/r.git"), null);
  assert.equal(parseGitHubRemote("https://github.com.evil.io/o/r"), null);
  assert.equal(parseGitHubRemote("https://github.com/o"), null);
  assert.equal(parseGitHubRemote("https://github.com/o/r/extra"), null);
  assert.equal(parseGitHubRemote(""), null);
  assert.equal(parseGitHubRemote(undefined), null);
});

test("resolveRepo: no cwd → No folder, no exec calls", async () => {
  const { exec, calls } = fakeExec({});
  assert.deepEqual(await resolveRepo(null, null, exec), { repo: null, note: "No folder" });
  assert.equal(calls.length, 0);
});

test("resolveRepo: not a repo → Not a git repository", async () => {
  const { exec } = fakeExec({ [TOP]: { code: 128, stdout: "", stderr: "fatal: not a git repository" } });
  assert.deepEqual(await resolveRepo("/tmp", null, exec), { repo: null, note: "Not a git repository" });
});

test("resolveRepo prefers a GitHub upstream", async () => {
  const { exec } = fakeExec({ [TOP]: ok("/w/r\n"), [UPSTREAM]: ok("git@github.com:parent/r.git\n"), [ORIGIN]: ok("git@github.com:me/r.git\n") });
  assert.deepEqual(await resolveRepo("/w/r/src", null, exec), { repo: { owner: "parent", name: "r" }, note: null });
});

test("resolveRepo: upstream on GitLab, origin on GitHub → origin", async () => {
  const { exec } = fakeExec({ [TOP]: ok("/w/r\n"), [UPSTREAM]: ok("git@gitlab.com:x/r.git\n"), [ORIGIN]: ok("https://github.com/me/r\n") });
  assert.deepEqual(await resolveRepo("/w/r", null, exec), { repo: { owner: "me", name: "r" }, note: null });
});

test("resolveRepo: no GitHub remote → No GitHub remote", async () => {
  const { exec } = fakeExec({ [TOP]: ok("/w/r\n"), [ORIGIN]: ok("git@gitlab.com:x/r.git\n") });
  assert.deepEqual(await resolveRepo("/w/r", null, exec), { repo: null, note: "No GitHub remote" });
});

test("resolveRepo runs remote lookups in the repo root", async () => {
  const { exec, calls } = fakeExec({ [TOP]: ok("/w/r\n"), [ORIGIN]: ok("git@github.com:o/r.git") });
  await resolveRepo("/w/r/deep/dir", null, exec);
  assert.equal(calls[0].opts.cwd, "/w/r/deep/dir");
  assert.ok(calls.slice(1).every((c) => c.opts.cwd === "/w/r"));
  assert.ok(calls.every((c) => c.cmd === "git"));
});

test("resolveRepo passes `on` to every git call", async () => {
  const { exec, calls } = fakeExec({ [TOP]: ok("/w/r\n"), [ORIGIN]: ok("git@github.com:o/r.git") });
  await resolveRepo("/w/r", "vps", exec);
  assert.ok(calls.length >= 2);
  assert.ok(calls.every((c) => c.opts.on === "vps"));
});

test("resolveRepo turns an unreachable machine into a note", async () => {
  const { exec } = fakeExec({ [TOP]: new Error("cannot reach vps: no answer within 20 s") });
  assert.deepEqual(await resolveRepo("/w/r", "vps", exec), { repo: null, note: "Can't read this folder: cannot reach vps: no answer within 20 s" });
});
