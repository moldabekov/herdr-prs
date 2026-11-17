// A controllable stand-in for Herdr's host module: one focused folder, a panel
// that is shown or hidden, and exec answers for git and gh that count calls.
export const control = { shown: true, space: "s1", cwd: "/w/a", ghOk: true, remotes: {} };
export const calls = { gh: 0, git: 0 };
export const commands = [];

export function reset(over = {}) {
  commands.length = 0;
  Object.assign(control, { shown: true, space: "s1", cwd: "/w/a", ghOk: true, remotes: { "/w/a": "git@github.com:o/a.git", "/w/b": "git@github.com:o/b.git" } }, over);
  Object.assign(calls, { gh: 0, git: 0 });
}

export const spaces = () => [{ id: control.space, active: true, machine: null, folder: control.cwd }];
export const panes = () => [{ pane: "p1", cwd: control.cwd }];
export const focused = () => ({ space: "s1", tab: "t1", pane: "p1", terminal: "t1", cwd: control.cwd });
export const layout = () => ({
  id: "root",
  children: [{ id: "panel", hidden: !control.shown, children: [{ id: "panel-body", type: "stack", active: "gh-prs", children: [] }] }],
});
export const theme = () => new Proxy({}, { get: () => "#000000" });
export const checking = () => false;
export const props = () => ({});
export const run = (name, args) => { commands.push({ name, args }); return null; };

function prBody(args) {
  const name = args.find((a) => a.startsWith("name="))?.slice(5);
  const pr = { number: 1, title: "t", url: `https://github.com/o/${name}/pull/1`, isDraft: false, reviewDecision: null, mergeable: "MERGEABLE", updatedAt: "2026-11-17T00:00:00Z", headRefName: "b", author: { login: "me" }, repository: { nameWithOwner: `o/${name}` }, commits: { nodes: [] } };
  const data = { viewer: { login: "me" }, mine: { issueCount: 0, nodes: [] } };
  return JSON.stringify({ data: name ? { ...data, repository: { nameWithOwner: `o/${name}`, pullRequests: { totalCount: 1, nodes: [pr] } } } : data });
}

export async function exec(cmd, args, opts = {}) {
  if (cmd === "git") {
    calls.git += 1;
    if (args[0] === "rev-parse") return { code: 0, stdout: `${opts.cwd}\n`, stderr: "" };
    const url = args[2] === "origin" ? control.remotes[opts.cwd] : undefined;
    return url ? { code: 0, stdout: `${url}\n`, stderr: "" } : { code: 2, stdout: "", stderr: "error: No such remote" };
  }
  if (cmd === "gh") {
    calls.gh += 1;
    return control.ghOk ? { code: 0, stdout: prBody(args), stderr: "" } : { code: 1, stdout: "", stderr: "dial tcp: lookup api.github.com: no such host" };
  }
  return { code: 0, stdout: "", stderr: "" };
}
