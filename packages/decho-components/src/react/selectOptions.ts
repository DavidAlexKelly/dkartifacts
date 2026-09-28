/**
 * Filtering, grouping and summarising a list of options.
 *
 * Shared by `Select` and `MultiSelect`, and pure, so the behaviour that is
 * usually buried in a render function is testable: which options a search
 * matches, what order groups come out in, and what the trigger says when four
 * things are selected.
 */

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** A second line in the list — what choosing it means. */
  description?: string;
  /** Options sharing a group are rendered under one heading. */
  group?: string;
  disabled?: boolean;
}

/**
 * The options a query matches.
 *
 * Matches the label *or* the description, because a user searching a list of
 * SAP tables types "customer" and the label is "KNA1". Substring rather than
 * prefix for the same reason — prefix matching on codes finds nothing.
 *
 * Case- and accent-insensitive: `localeCompare` is the wrong tool (it orders,
 * it does not match), so the comparison normalises away diacritics instead.
 * Without that, "Müller" is unfindable by typing "Muller", which in this
 * estate is most of a vendor list.
 */
export function filterOptions<V extends string, O extends SelectOption<V>>(
  options: readonly O[],
  query: string,
): O[] {
  const needle = fold(query);
  if (needle === "") {
    return [...options];
  }
  return options.filter((option) => {
    const haystack = `${fold(option.label)} ${fold(option.description ?? "")} ${fold(option.value)}`;
    return haystack.includes(needle);
  });
}

/** Lower-cased and stripped of diacritics, for comparison only. */
export function fold(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // The combining marks block: what NFD split the accents into.
    .replace(/[\u0300-\u036f]/g, "");
}

export interface OptionGroup<O> {
  /** `null` for the ungrouped options. */
  name: string | null;
  options: O[];
}

/**
 * Options in groups, in first-appearance order.
 *
 * First appearance rather than alphabetical: the caller has already chosen an
 * order (usually "most used first"), and re-sorting it silently is the kind of
 * helpfulness that makes a list feel random. Ungrouped options stay where they
 * are rather than being swept to the end.
 */
export function groupOptions<O extends { group?: string }>(options: readonly O[]): OptionGroup<O>[] {
  const groups: OptionGroup<O>[] = [];
  const byName = new Map<string | null, OptionGroup<O>>();
  for (const option of options) {
    const name = option.group ?? null;
    let group = byName.get(name);
    if (group == null) {
      group = { name, options: [] };
      byName.set(name, group);
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
}

/**
 * What a multi-select's trigger says.
 *
 * Names the selection while it is short enough to be useful, then counts. The
 * estate's versions show either a count from the first item ("1 selected",
 * which is less informative than the item's own name) or an ever-growing list
 * that pushes the field's clear button off the end of the row.
 */
export function summariseSelection<V extends string>(
  options: readonly SelectOption<V>[],
  selected: readonly V[],
  options_: { maxNamed?: number; noun?: string } = {},
): string {
  const maxNamed = options_.maxNamed ?? 2;
  const noun = options_.noun ?? "selected";
  const labels = selected
    .map((value) => options.find((option) => option.value === value)?.label)
    .filter((label): label is string => label != null);

  if (labels.length === 0) {
    return "";
  }
  if (labels.length <= maxNamed) {
    return labels.join(", ");
  }
  return `${labels.length} ${noun}`;
}
