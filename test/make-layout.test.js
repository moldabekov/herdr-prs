import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { patchLayout, BUTTON_WIDTH_PX } from "../scripts/make-layout.mjs";
import { findNode } from "../mods/gh-prs/layout-state.js";

const main = JSON.parse(readFileSync(new URL("./fixtures/main.json", import.meta.url), "utf8"));
const SCRIPT = new URL("../scripts/make-layout.mjs", import.meta.url).pathname;

// Reverse the two edits, so the rest of the tree can be compared with main.
function unpatch(tree) {
  const walk = (node) => {
    if (node.id === "tabs-row") return walk({ ...node.children[0], size: node.size });
    const children = node.children?.filter((c) => c.id !== "gh-prs").map(walk);
    return children ? { ...node, children } : node;
  };
  const { cloned_from, ...rest } = walk(tree);
  return rest;
}

test("adds the panel child and the button block", () => {
  const out = patchLayout(main, { version: "0.1.16" });
  assert.deepEqual(findNode(out, "panel-body").children.map((c) => c.id), ["files", "changes", "gh-prs"]);
  assert.deepEqual(findNode(out, "gh-prs"), { id: "gh-prs", type: "block", content: { mod: "gh-prs" } });
  const row = findNode(out, "tabs-row");
  assert.equal(row.type, "row");
  assert.equal(row.resizable, false);
  assert.deepEqual(row.children.map((c) => c.id), ["tabs", "gh-prs-button"]);
  assert.deepEqual(row.size, { px: 42 });
  assert.deepEqual(findNode(out, "tabs").size, { weight: 1 });
  assert.equal(findNode(out, "tabs").window_drag, true);
  assert.deepEqual(findNode(out, "gh-prs-button"), {
    id: "gh-prs-button", type: "block", size: { px: BUTTON_WIDTH_PX }, window_drag: true,
    content: { mod: "gh-prs", props: { button: true } },
  });
  assert.deepEqual(out.cloned_from, { name: "main", version: "0.1.16" });
});

test("is idempotent", () => {
  assert.deepEqual(patchLayout(patchLayout(main)), patchLayout(main));
});

test("does not mutate its input", () => {
  const before = structuredClone(main);
  patchLayout(main, { version: "1" });
  assert.deepEqual(main, before);
});

test("leaves every other node untouched", () => {
  assert.deepEqual(unpatch(patchLayout(main)), main);
});

test("keeps an existing cloned_from and updates its version", () => {
  const out = patchLayout(main, { clonedFrom: { name: "main", version: "0.1.15", extra: 1 }, version: "0.1.16" });
  assert.deepEqual(out.cloned_from, { name: "main", version: "0.1.16", extra: 1 });
});

test("without a version, cloned_from keeps what it had", () => {
  assert.deepEqual(patchLayout(main, { clonedFrom: { name: "main", version: "0.1.15" } }).cloned_from, { name: "main", version: "0.1.15" });
  assert.deepEqual(patchLayout(main).cloned_from, { name: "main" });
});

test("throws a clear error when an anchor is missing", () => {
  const noStack = { ...main, children: main.children.map((c) => (c.id === "work" ? { ...c, children: [] } : c)) };
  assert.throws(() => patchLayout(noStack), /main\.json has no node "(panel|panel-body|tabs)": Herdr changed its main layout; update scripts\/make-layout\.mjs/);
  const noTabs = JSON.parse(JSON.stringify(main).replace('"id":"tabs"', '"id":"tabz"'));
  assert.throws(() => patchLayout(noTabs), /no node "tabs"/);
});

test("CLI writes the file and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "make-layout-"));
  const out = join(dir, "main-prs.json");
  writeFileSync(out, JSON.stringify({ id: "root", cloned_from: { name: "main", version: "0.0.1" } }));
  const run = spawnSync(process.execPath, [SCRIPT, new URL("./fixtures/main.json", import.meta.url).pathname, out, "--version", "9.9.9"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const text = readFileSync(out, "utf8");
  assert.ok(text.endsWith("}\n"));
  assert.match(text, /^\{\n  "/);
  const written = JSON.parse(text);
  assert.deepEqual(written.cloned_from, { name: "main", version: "9.9.9" });
  assert.ok(findNode(written, "gh-prs-button"));
});

test("CLI creates the output when it does not exist yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "make-layout-"));
  const out = join(dir, "main-prs.json");
  const run = spawnSync(process.execPath, [SCRIPT, new URL("./fixtures/main.json", import.meta.url).pathname, out], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(out));
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")).cloned_from, { name: "main" });
});

test("CLI exits 1 with the message on a broken main", () => {
  const dir = mkdtempSync(join(tmpdir(), "make-layout-"));
  const bad = join(dir, "main.json");
  writeFileSync(bad, JSON.stringify({ id: "root", type: "row", children: [] }));
  const run = spawnSync(process.execPath, [SCRIPT, bad, join(dir, "out.json")], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no node "panel"/);
  assert.equal(existsSync(join(dir, "out.json")), false);
});

test("CLI exits 1 with usage when arguments are missing", () => {
  const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /usage: node scripts\/make-layout\.mjs <main\.json> <out\.json> \[--version <v>\]/);
});

// Deferred minor: every node the mod relies on is checked.
test("throws when the panel column is missing", () => {
  const noPanel = JSON.parse(JSON.stringify(main).replace('"id":"panel"', '"id":"panelz"'));
  assert.throws(() => patchLayout(noPanel), /no node "panel"/);
});

test("throws when panel-body is not a stack", () => {
  const notStack = JSON.parse(JSON.stringify(main).replace('"id":"panel-body","type":"stack"', '"id":"panel-body","type":"column"'));
  assert.throws(() => patchLayout(notStack), /"panel-body" is not a stack/);
});
