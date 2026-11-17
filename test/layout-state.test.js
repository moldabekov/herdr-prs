import { test } from "node:test";
import assert from "node:assert/strict";
import { findNode, isPanelShown, PANEL_ID, STACK_ID, CHILD_ID } from "../mods/gh-prs/layout-state.js";

const panel = { id: "panel", hidden: false, children: [{ id: "panel-body", type: "stack", active: "gh-prs", children: [] }] };
const tree = { id: "root", children: [panel] };
const withPanel = (changes) => ({ ...tree, children: [{ ...panel, ...changes }] });
const withActive = (active) => withPanel({ children: [{ ...panel.children[0], active }] });

test("ids match the main layout and the mod name", () => {
  assert.deepEqual([PANEL_ID, STACK_ID, CHILD_ID], ["panel", "panel-body", "gh-prs"]);
});

test("findNode finds nested ids and returns null for missing", () => {
  assert.equal(findNode(tree, "panel-body").type, "stack");
  assert.equal(findNode(tree, "root"), tree);
  assert.equal(findNode(tree, "nope"), null);
  assert.equal(findNode(null, "panel"), null);
});

test("isPanelShown is true for a visible panel with gh-prs active", () => {
  assert.equal(isPanelShown(tree), true);
});

test("isPanelShown is false when the panel is hidden", () => {
  assert.equal(isPanelShown(withPanel({ hidden: true })), false);
});

test("isPanelShown is false when another child is active", () => {
  assert.equal(isPanelShown(withActive("files")), false);
});

test("isPanelShown is false without a panel or a tree", () => {
  assert.equal(isPanelShown({ id: "root", children: [] }), false);
  assert.equal(isPanelShown(null), false);
});
