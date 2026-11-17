// Which GitHub repo the focused folder belongs to. Pure: `exec` is passed in,
// so node can test it with a fake and the panel passes Herdr's real one.

const SEGMENT = "([A-Za-z0-9_.-]+)";
const TAIL = `${SEGMENT}\\/${SEGMENT}?\\/?$`;
const FORMS = [
  new RegExp(`^git@github\\.com:${TAIL}`),
  new RegExp(`^ssh:\\/\\/git@github\\.com\\/${TAIL}`),
  new RegExp(`^https:\\/\\/(?:[^@/]+@)?github\\.com\\/${TAIL}`),
];
// Remotes looked up in order; the first on GitHub wins (a fork's parent first).
const REMOTES = ["upstream", "origin"];

export function parseGitHubRemote(url) {
  const text = String(url ?? "").trim();
  for (const form of FORMS) {
    const match = form.exec(text);
    if (!match || !match[2]) continue;
    const name = match[2].replace(/\.git$/, "");
    return name ? { owner: match[1], name } : null;
  }
  return null;
}

async function remoteRepo(root, on, exec) {
  for (const remote of REMOTES) {
    const result = await exec("git", ["remote", "get-url", remote], { cwd: root, on });
    const repo = result.code === 0 ? parseGitHubRemote(result.stdout) : null;
    if (repo) return repo;
  }
  return null;
}

export async function resolveRepo(cwd, on, exec) {
  if (!cwd) return { repo: null, note: "No folder" };
  try {
    const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
    if (top.code !== 0) return { repo: null, note: "Not a git repository" };
    const repo = await remoteRepo(top.stdout.trim(), on, exec);
    return repo ? { repo, note: null } : { repo: null, note: "No GitHub remote" };
  } catch (error) {
    return { repo: null, note: `Can't read this folder: ${error?.message ?? error}` };
  }
}
