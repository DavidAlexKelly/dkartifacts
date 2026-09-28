/**
 * Hierarchies: flattening, expanding and filtering.
 *
 * A tree is rendered as a flat list of visible rows — that is what makes it
 * virtualisable and what makes keyboard navigation possible — so the work is
 * turning nested data plus an expansion set into that list. Pure, and the
 * three behaviours worth being sure about are all here:
 *
 *   1. Filtering keeps ANCESTORS of a match. A search that hides the parent of
 *      the matching node shows a row floating at the wrong indent level, which
 *      is the commonest complaint about hand-rolled tree filters.
 *   2. Expanding to reveal a node expands every ancestor, not just its parent.
 *   3. A node with children that are all filtered out is no longer expandable,
 *      or you get a chevron that does nothing.
 */

export interface TreeNode<T> {
  id: string;
  children?: TreeNode<T>[];
  data: T;
}

export interface FlatRow<T> {
  node: TreeNode<T>;
  /** 0 for a root. Used for the indent. */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Ancestor ids, root first — for `expandTo` and for breadcrumbs. */
  path: string[];
}

/**
 * The visible rows, in order.
 *
 * `expanded` is a `Set` rather than a map of booleans: the question is only
 * ever "is this one open", and a set cannot drift out of step with the tree
 * when nodes are added or removed.
 */
export function flattenTree<T>(
  nodes: readonly TreeNode<T>[],
  expanded: ReadonlySet<string>,
): FlatRow<T>[] {
  const rows: FlatRow<T>[] = [];

  const walk = (level: readonly TreeNode<T>[], depth: number, path: string[]): void => {
    for (const node of level) {
      const children = node.children ?? [];
      const isExpanded = expanded.has(node.id);
      rows.push({
        node,
        depth,
        hasChildren: children.length > 0,
        expanded: isExpanded && children.length > 0,
        path,
      });
      if (isExpanded && children.length > 0) {
        walk(children, depth + 1, [...path, node.id]);
      }
    }
  };

  walk(nodes, 0, []);
  return rows;
}

/** Toggle one node, returning a new set. */
export function toggleNode(expanded: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** Every id in the tree that has children — for "expand all". */
export function expandableIds<T>(nodes: readonly TreeNode<T>[]): Set<string> {
  const ids = new Set<string>();
  const walk = (level: readonly TreeNode<T>[]): void => {
    for (const node of level) {
      if ((node.children ?? []).length > 0) {
        ids.add(node.id);
        walk(node.children ?? []);
      }
    }
  };
  walk(nodes);
  return ids;
}

/**
 * Expand everything needed to make a node visible.
 *
 * Every ancestor, not just the parent — revealing a node four levels down by
 * opening only its parent leaves it as hidden as it was.
 */
export function expandTo<T>(
  nodes: readonly TreeNode<T>[],
  id: string,
  expanded: ReadonlySet<string> = new Set(),
): Set<string> {
  const next = new Set(expanded);

  const walk = (level: readonly TreeNode<T>[], ancestors: string[]): boolean => {
    for (const node of level) {
      if (node.id === id) {
        for (const ancestor of ancestors) {
          next.add(ancestor);
        }
        return true;
      }
      if (walk(node.children ?? [], [...ancestors, node.id])) {
        return true;
      }
    }
    return false;
  };

  walk(nodes, []);
  return next;
}

/**
 * The subtree of nodes matching a predicate, with their ancestors kept.
 *
 * A match keeps its whole line of descent — otherwise a matching leaf appears
 * at the wrong indent with no context — and a node that matches keeps all of
 * its own children, because having found "Finance" you want to see what is in
 * it.
 */
export function filterTree<T>(
  nodes: readonly TreeNode<T>[],
  matches: (node: TreeNode<T>) => boolean,
): TreeNode<T>[] {
  const keep = (node: TreeNode<T>): TreeNode<T> | null => {
    if (matches(node)) {
      return node;
    }
    const children = (node.children ?? [])
      .map(keep)
      .filter((child): child is TreeNode<T> => child != null);
    if (children.length === 0) {
      return null;
    }
    return { ...node, children };
  };

  return nodes.map(keep).filter((node): node is TreeNode<T> => node != null);
}

/** Count of nodes in a (sub)tree, including the roots themselves. */
export function countNodes<T>(nodes: readonly TreeNode<T>[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);
}

/**
 * Keyboard movement in a tree, following the ARIA treegrid conventions.
 *
 * Right opens a closed node and steps into an open one; Left closes an open
 * node and steps out of a closed one. That asymmetry is what makes a tree
 * navigable with two keys, and it is always the part that is missing.
 */
export interface TreeKeyResult {
  /** Row to move to, or `null` to stay. */
  index: number | null;
  /** Expansion set to apply, or `null` for no change. */
  expanded: Set<string> | null;
}

export function treeKey<T>(
  rows: readonly FlatRow<T>[],
  index: number,
  key: string,
  expanded: ReadonlySet<string>,
): TreeKeyResult {
  const row = rows[index];
  const none: TreeKeyResult = { index: null, expanded: null };

  switch (key) {
    case "ArrowDown":
      return { index: Math.min(rows.length - 1, index + 1), expanded: null };
    case "ArrowUp":
      return { index: Math.max(0, index - 1), expanded: null };
    case "Home":
      return { index: 0, expanded: null };
    case "End":
      return { index: rows.length - 1, expanded: null };
    case "ArrowRight": {
      if (row == null || !row.hasChildren) {
        return none;
      }
      if (!row.expanded) {
        return { index: null, expanded: toggleNode(expanded, row.node.id) };
      }
      return { index: Math.min(rows.length - 1, index + 1), expanded: null };
    }
    case "ArrowLeft": {
      if (row == null) {
        return none;
      }
      if (row.expanded) {
        return { index: null, expanded: toggleNode(expanded, row.node.id) };
      }
      // Step out: the parent is the nearest row above at a shallower depth.
      for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
        const above = rows[candidate];
        if (above != null && above.depth < row.depth) {
          return { index: candidate, expanded: null };
        }
      }
      return none;
    }
    default:
      return none;
  }
}
