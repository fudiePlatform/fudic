/**
 * The judge (SDD-83 §3.10): what the data says of a compat key, and whether it passes a level. It
 * knows no language — a detector turns code into keys, this says whether a key is new — and it is
 * quiet when in doubt: a key the table does not have passes (§5, «better silent than wrong»).
 *
 * It judges each KEY, not the feature (§3.5): popover as a whole is newer than the `popover`
 * attribute, and the attribute is what an author writes.
 */

import { AS_OF, CORE, CSS_UNITS, FEATURES, TAG_INTERFACES } from './data.generated.js';
import { TABLE } from './table.generated.js';
import { cutoff, type Target } from './level.js';

/** `TABLE`, parsed. */
interface Table {
  readonly support: readonly string[];
  readonly status: readonly (readonly [number | readonly number[], string | null, number])[];
  readonly keys: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly functions: Readonly<Record<string, readonly string[]>>;
}

let parsed: Table | undefined;

/** The table of keys, parsed the first time a key is asked: importing the judge does not pay for it. */
function table(): Table {
  return (parsed ??= JSON.parse(TABLE) as Table);
}

/** A core browser of Baseline: Chrome, Edge, Firefox and Safari, on desktop and mobile. */
export type CoreBrowser = (typeof CORE)[number];

/** The core browsers, in the order the data lists them. */
export const CORE_BROWSERS: readonly CoreBrowser[] = CORE;

/** What the data says of one compat key. */
export interface KeyStatus {
  readonly key: string;
  /** Its web-features id; the first one when it belongs to several. */
  readonly feature: string;
  /** Every feature it belongs to: two for the few keys `audio` and `video` share. */
  readonly features: readonly string[];
  /** When it reached every core browser, `YYYY-MM-DD`; null when it has not yet. */
  readonly newly: string | null;
  /** The first version of each core browser that has it; a browser without it is absent. */
  readonly support: Readonly<Partial<Record<CoreBrowser, string>>>;
}

/** What the data says of `key`, or undefined when the table does not have it. */
export function status(key: string): KeyStatus | undefined {
  const { keys, status: statuses, support: rows } = table();
  const at = key.lastIndexOf('.');
  const leaves = own(keys, key.slice(0, at));
  const index = leaves === undefined ? undefined : own(leaves, key.slice(at + 1));
  if (index === undefined) return undefined;
  const [features, newly, row] = statuses[index]!;
  const ids = (typeof features === 'number' ? [features] : features).map((f) => FEATURES[f]![0]);
  const versions = rows[row]!.split(' ');
  const support: Partial<Record<CoreBrowser, string>> = {};
  CORE.forEach((browser, i) => {
    if (versions[i] !== '-') support[browser] = versions[i]!;
  });
  return { key, feature: ids[0]!, features: ids, newly, support };
}

/**
 * Whether `key` passes `target`: it reached every core browser by the level's date, or one of its
 * features is in `allow` (ids already followed through their redirects). A key the table does not
 * have passes.
 */
export function passes(
  key: string,
  target: Target,
  allow: ReadonlySet<string> = new Set(),
  asOf: string = AS_OF,
): boolean {
  const found = status(key);
  if (found === undefined || found.features.some((id) => allow.has(id))) return true;
  return found.newly !== null && found.newly <= cutoff(target, asOf);
}

/** The first of `candidates` the table has: a detector's keys, most specific first. */
export function firstKnown(candidates: readonly string[]): string | undefined {
  return candidates.find((key) => status(key) !== undefined);
}

/** Every key of a CSS function or type by its name (`light-dark`); empty when the table has none. */
export function cssFunctionKeys(name: string): readonly string[] {
  return own(table().functions, name.toLowerCase()) ?? [];
}

/** The key of a CSS unit (`dvh`), case-insensitive; undefined for a unit as old as its type. */
export function cssUnitKey(unit: string): string | undefined {
  return own(CSS_UNITS, unit.toLowerCase());
}

/** The DOM interface of an HTML tag: `HTMLDivElement` for `div`, `HTMLElement` when it has none of its own. */
export function tagInterface(tag: string): string {
  return own(TAG_INTERFACES, tag.toLowerCase()) ?? 'HTMLElement';
}

/** `record[key]`, only when it is the record's own: `toString` is not a CSS function. */
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
