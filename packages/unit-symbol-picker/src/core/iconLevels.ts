/**
 * Turning one icon list into one control per level of the hierarchy.
 *
 * The entity block is a tree — entity, entity type, entity subtype, two digits
 * each — and a flat dropdown of every leaf is unusable at this size: two
 * thousand rows, several dozen of them called "Radio", scrolled past in a
 * single native list. Three short controls that narrow each other are the same
 * data in the shape it actually has.
 *
 * This lives in core, with no React in it, because it is the part worth
 * testing: which options belong at which level, and which of them the current
 * code has selected. The component is then a rendering of the answer.
 */

import type { SidcOption } from "./fields.js";

/**
 * An icon option that knows where it sits in the hierarchy.
 *
 * `path` is what the generated tables carry. Without it the label is split on
 * " : ", which is how the flat form spells the same thing — so a consumer that
 * only has joined labels still gets a cascade rather than a wall.
 */
export interface HierarchicalSidcOption extends SidcOption {
  /** Entity, type, subtype labels — outermost first. */
  path?: string[];
  /** Draws nothing of its own; exists to parent the level below. */
  abstract?: boolean;
}

/** One control: what to call it, what it offers, and what is chosen. */
export interface IconLevel {
  label: string;
  /** The selected option's code, or "" when this level has not been narrowed. */
  value: string;
  options: HierarchicalSidcOption[];
  /**
   * The code to return to when the user clears this level — its parent's code.
   * Absent on the first level, which has nothing above it.
   */
  resetTo?: string;
}

const LEVEL_LABELS = ["Main icon", "Type", "Subtype"];

/** The hierarchy this option sits in, however the caller expressed it. */
export function iconPath(option: HierarchicalSidcOption): string[] {
  return option.path ?? option.label.split(" : ");
}

/**
 * The levels to show for `entity`, given everything the symbol set offers.
 *
 * Narrowing is by code prefix, because that IS the standard's structure: the
 * six digits are entity, type and subtype in pairs, so `1211xx` is a type of
 * `12xxxx`. The generated tables always contain a row for each parent — there
 * is a test for it — which is what makes a level's selection expressible as one
 * of its own options.
 *
 * A list with no hierarchy in it comes back as a single level containing
 * everything, which is the old flat behaviour and the right answer for the
 * handful of starter icons.
 */
export function iconLevels(
  options: HierarchicalSidcOption[],
  entity: string,
): IconLevel[] {
  if (options.length === 0) {
    return [];
  }

  const depthOf = (option: HierarchicalSidcOption): number => iconPath(option).length;
  const atDepth = (depth: number): HierarchicalSidcOption[] =>
    options.filter((option) => depthOf(option) === depth);

  if (!options.some((option) => depthOf(option) > 1)) {
    return [
      {
        label: LEVEL_LABELS[0],
        value: options.some((option) => option.code === entity) ? entity : "",
        options,
      },
    ];
  }

  const levels: IconLevel[] = [];

  const entities = atDepth(1);
  const entityValue =
    entities.find((option) => option.code.slice(0, 2) === entity.slice(0, 2))?.code ?? "";
  levels.push({ label: LEVEL_LABELS[0], value: entityValue, options: entities });
  if (entityValue === "") {
    // The code names an entity this table does not have. Offering a Type
    // control under it would be offering the types of something else.
    return levels;
  }

  const types = atDepth(2).filter(
    (option) => option.code.slice(0, 2) === entity.slice(0, 2),
  );
  if (types.length === 0) {
    return levels;
  }
  const typeValue =
    types.find((option) => option.code.slice(0, 4) === entity.slice(0, 4))?.code ?? "";
  levels.push({
    label: LEVEL_LABELS[1],
    value: typeValue,
    options: types,
    resetTo: entityValue,
  });
  if (typeValue === "") {
    return levels;
  }

  const subTypes = atDepth(3).filter(
    (option) => option.code.slice(0, 4) === entity.slice(0, 4),
  );
  if (subTypes.length === 0) {
    return levels;
  }
  levels.push({
    label: LEVEL_LABELS[2],
    value: subTypes.find((option) => option.code === entity)?.code ?? "",
    options: subTypes,
    resetTo: typeValue,
  });
  return levels;
}
