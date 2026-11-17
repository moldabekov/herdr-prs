#!/usr/bin/env node
// Derives layouts/main-prs.json from Herdr's current layouts/main.json:
// one more child in the side panel's stack, and a PRs button block beside
// the stock tab bar. Everything else is main, untouched, so re-running this
// after a Herdr update brings main's changes along.

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const BUTTON_WIDTH_PX = 68;

const STACK = "panel-body";
const TABS = "tabs";
const ROW = "tabs-row";
const PANEL_CHILD = { id: "gh-prs", type: "block", content: { mod: "gh-prs" } };
const BUTTON = {
  id: "gh-prs-button", type: "block", size: { px: BUTTON_WIDTH_PX }, window_drag: true,
  content: { mod: "gh-prs", props: { button: true } },
};

function contains(node, id) {
  return node?.id === id || (node?.children ?? []).some((c) => contains(c, id));
}

function requireNode(tree, id) {
  if (!contains(tree, id)) throw new Error(`main.json has no node "${id}": Herdr changed its main layout; update scripts/make-layout.mjs`);
}

function wrapTabs(tabs) {
  return {
    id: ROW, type: "row", size: tabs.size, resizable: false,
    children: [{ ...tabs, size: { weight: 1 } }, structuredClone(BUTTON)],
  };
}

function patchNode(node) {
  if (node.id === ROW) return node; // already patched
  if (node.id === TABS) return wrapTabs(node);
  const children = node.children?.map(patchNode);
  if (node.id === STACK && !children.some((c) => c.id === PANEL_CHILD.id)) {
    return { ...node, children: [...children, structuredClone(PANEL_CHILD)] };
  }
  return children ? { ...node, children } : node;
}

export function patchLayout(main, meta = {}) {
  requireNode(main, STACK);
  requireNode(main, TABS);
  const base = meta.clonedFrom ?? main.cloned_from ?? { name: "main" };
  const clonedFrom = meta.version ? { ...base, version: meta.version } : { ...base };
  return { ...patchNode(main), cloned_from: clonedFrom };
}

function parseArgs(argv) {
  const [input, output, ...rest] = argv;
  const flag = rest.indexOf("--version");
  const version = flag >= 0 ? rest[flag + 1] : undefined;
  if (!input || !output || (flag >= 0 && !version)) throw new Error("usage: node scripts/make-layout.mjs <main.json> <out.json> [--version <v>]");
  return { input, output, version };
}

// Herdr watches layouts/: write beside the target under a hidden name, then rename.
function writeAtomic(path, text) {
  const tmp = join(dirname(path), `.${basename(path)}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

function main(argv) {
  const { input, output, version } = parseArgs(argv);
  const layout = JSON.parse(readFileSync(input, "utf8"));
  const clonedFrom = existsSync(output) ? JSON.parse(readFileSync(output, "utf8")).cloned_from : undefined;
  const patched = patchLayout(layout, { clonedFrom, version });
  writeAtomic(output, `${JSON.stringify(patched, null, 2)}\n`);
  console.log(`wrote ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
