// Where the PRs panel lives in the layout. Pure: no host imports, so node can test it.

export const PANEL_ID = "panel";
export const STACK_ID = "panel-body";
export const CHILD_ID = "gh-prs";

export function findNode(tree, id) {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// The panel column is visible and its stack shows this mod.
export function isPanelShown(tree) {
  const panel = findNode(tree, PANEL_ID);
  if (!panel || panel.hidden) return false;
  return findNode(tree, STACK_ID)?.active === CHILD_ID;
}
