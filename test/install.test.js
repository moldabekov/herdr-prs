// Runs the real install.sh and uninstall.sh against a throwaway Herdr home,
// with a stand-in herdr-app (and, when asked, a failing rsync) on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, utimesSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";

const REPO = new URL("..", import.meta.url).pathname;
const FIXTURE = new URL("./fixtures/main.json", import.meta.url).pathname;
const REAL_RSYNC = execFileSync("bash", ["-c", "command -v rsync"], { encoding: "utf8" }).trim();

const FAKE_HERDR = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$1" in
  --version) echo "herdr-app 0.1.16" ;;
  check)
    if [ -n "$FAKE_CHECK_FAIL" ]; then echo "error: boom" >&2; exit 1; fi
    echo "check passed: $2" ;;
  do)
    if [ -n "$FAKE_NOT_RUNNING" ]; then echo '{"error":"Herdr is not running"}'; exit 1; fi
    if [ "$2" = "layout.clone" ]; then cp "$HERDR_APP_HOME/layouts/main.json" "$HERDR_APP_HOME/layouts/main-prs.json"; fi
    echo '{"ok":true}' ;;
esac
`;
const FAKE_RSYNC = `#!/usr/bin/env bash
if [ -n "$FAKE_RSYNC_FAIL" ]; then echo "rsync: connection unexpectedly closed" >&2; exit 12; fi
exec "$REAL_RSYNC" "$@"
`;

function home({ main = FIXTURE } = {}) {
  const root = mkdtempSync(join(tmpdir(), "herdr-prs-install-"));
  const app = join(root, "app"), bin = join(root, "bin");
  for (const dir of [join(app, "layouts"), join(app, "mods"), join(app, "data"), bin]) mkdirSync(dir, { recursive: true });
  copyFileSync(main, join(app, "layouts", "main.json"));
  writeFileSync(join(bin, "herdr-app"), FAKE_HERDR);
  writeFileSync(join(bin, "rsync"), FAKE_RSYNC);
  chmodSync(join(bin, "herdr-app"), 0o755);
  chmodSync(join(bin, "rsync"), 0o755);
  return { root, app, bin, log: join(root, "herdr.log") };
}

function run(h, script, env = {}, during) {
  return new Promise((resolve) => {
    const child = spawn("bash", [join(REPO, "scripts", script)], {
      env: { ...process.env, PATH: `${h.bin}:${process.env.PATH}`, HERDR_APP_HOME: h.app, FAKE_LOG: h.log, REAL_RSYNC, HERDR_PRS_SETTLE_SECONDS: "0", ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    during?.();
    child.on("close", (code) => resolve({ code, out }));
  });
}

const calls = (h) => (existsSync(h.log) ? readFileSync(h.log, "utf8").trim().split("\n") : []);
const layout = (h) => join(h.app, "layouts", "main-prs.json");
const mod = (h) => join(h.app, "mods", "gh-prs");

test("install: checks the repo's mod first, then copies, derives the layout and switches", async () => {
  const h = home();
  const { code, out } = await run(h, "install.sh");
  assert.equal(code, 0, out);
  const log = calls(h);
  assert.match(log[0], /^check .*mods\/gh-prs$/);
  assert.ok(log.findIndex((l) => l.startsWith("check")) < log.findIndex((l) => l.includes("layout.clone")));
  assert.ok(log.some((l) => l.includes("layout.switch") && l.includes("main-prs")));
  assert.equal(readFileSync(join(mod(h), ".installed-by-herdr-prs"), "utf8").trim(), REPO.replace(/\/$/, ""));
  assert.ok(existsSync(join(mod(h), "main.js")));
  assert.match(readFileSync(layout(h), "utf8"), /gh-prs-button/);
});

test("install: a failing check copies nothing", async () => {
  const h = home();
  const { code } = await run(h, "install.sh", { FAKE_CHECK_FAIL: "1" });
  assert.equal(code, 1);
  assert.equal(existsSync(mod(h)), false);
  assert.equal(existsSync(layout(h)), false);
});

test("install: with Herdr closed it still installs and says how to switch", async () => {
  const h = home();
  const { code, out } = await run(h, "install.sh", { FAKE_NOT_RUNNING: "1" });
  assert.equal(code, 0, out);
  assert.match(out, /Herdr isn't running/);
  assert.match(readFileSync(layout(h), "utf8"), /gh-prs-button/);
});

test("install: a failed first copy leaves a folder a rerun can still update", async () => {
  const h = home();
  const failed = await run(h, "install.sh", { FAKE_RSYNC_FAIL: "1" });
  assert.notEqual(failed.code, 0);
  const again = await run(h, "install.sh");
  assert.equal(again.code, 0, again.out);
  assert.ok(existsSync(join(mod(h), "main.js")));
});

test("install: refuses a mods/gh-prs it did not make", async () => {
  const h = home();
  mkdirSync(mod(h));
  writeFileSync(join(mod(h), "main.js"), "// someone else's");
  const { code, out } = await run(h, "install.sh");
  assert.equal(code, 1);
  assert.match(out, /not this repo's copy/);
  assert.equal(readFileSync(join(mod(h), "main.js"), "utf8"), "// someone else's");
});

test("install: a broken main on first install switches back and removes the unpatched clone", async () => {
  const h = home();
  writeFileSync(join(h.app, "layouts", "main.json"), JSON.stringify({ id: "root", type: "row", children: [] }));
  const { code, out } = await run(h, "install.sh");
  assert.equal(code, 1);
  assert.match(out, /no node "panel"/);
  assert.equal(existsSync(layout(h)), false);
  assert.ok(calls(h).some((l) => l.includes("layout.switch") && l.includes('"main"')));
});

test("install: an old layout.error is left alone and does not fail the install", async () => {
  const h = home();
  const err = join(h.app, "layout.error");
  writeFileSync(err, "about another layout");
  const old = new Date(Date.now() - 3600_000);
  utimesSync(err, old, old);
  const { code, out } = await run(h, "install.sh");
  assert.equal(code, 0, out);
  assert.equal(readFileSync(err, "utf8"), "about another layout");
});

test("install: a layout.error Herdr writes after the patch fails the install", async () => {
  const h = home();
  const err = join(h.app, "layout.error");
  const { code, out } = await run(h, "install.sh", { HERDR_PRS_SETTLE_SECONDS: "2" }, () => {
    const watch = setInterval(() => {
      if (existsSync(layout(h)) && readFileSync(layout(h), "utf8").includes("gh-prs-button")) {
        clearInterval(watch);
        writeFileSync(err, "main-prs: unknown field");
      }
    }, 50);
  });
  assert.equal(code, 1, out);
  assert.match(out, /main-prs: unknown field/);
  assert.ok(statSync(err).isFile());
});

test("uninstall: removes the marked copy and its data, moves the layout aside", async () => {
  const h = home();
  await run(h, "install.sh");
  mkdirSync(join(h.app, "data", "gh-prs"), { recursive: true });
  writeFileSync(join(h.app, "data", "gh-prs", "store.json"), "{}");
  const { code, out } = await run(h, "uninstall.sh");
  assert.equal(code, 0, out);
  assert.equal(existsSync(mod(h)), false);
  assert.equal(existsSync(join(h.app, "data", "gh-prs")), false);
  assert.equal(existsSync(layout(h)), false);
  assert.ok(calls(h).some((l) => l.includes("layout.switch") && l.includes('"main"')));
});

test("uninstall: leaves a mods/gh-prs it did not make", async () => {
  const h = home();
  mkdirSync(mod(h));
  writeFileSync(join(mod(h), "main.js"), "// someone else's");
  const { code } = await run(h, "uninstall.sh");
  assert.equal(code, 0);
  assert.ok(existsSync(join(mod(h), "main.js")));
});
