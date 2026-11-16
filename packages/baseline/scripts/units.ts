/**
 * Every CSS unit the detector asks about, and the compat key that says when it arrived. Written by
 * hand: the data has a key per unit, or per family of units, but no index from what an author types
 * (`100dvh`) to the key (`…viewport_percentage_units_dynamic`). Lowercase, because CSS units are
 * case-insensitive. A test of the package checks that every key exists in the data.
 *
 * `px`, `%`, `s`, `ms`, `cm`, `in`… are absent on purpose: they have no key of their own, because
 * they are as old as the type they belong to.
 */

const LENGTH = 'css.types.length';

/** The units with a key of their own under `css.types.length`. */
const OWN_LENGTH = ['cap', 'ch', 'em', 'ex', 'ic', 'lh', 'rcap', 'rch', 'rem', 'rex', 'ric', 'rlh', 'vb', 'vi', 'vh', 'vmax', 'vmin', 'vw'];

/** The families: one key for every unit of the family. */
const FAMILIES: readonly (readonly [key: string, units: readonly string[]])[] = [
  [`${LENGTH}.viewport_percentage_units_dynamic`, ['dvh', 'dvw', 'dvi', 'dvb', 'dvmin', 'dvmax']],
  [`${LENGTH}.viewport_percentage_units_large`, ['lvh', 'lvw', 'lvi', 'lvb', 'lvmin', 'lvmax']],
  [`${LENGTH}.viewport_percentage_units_small`, ['svh', 'svw', 'svi', 'svb', 'svmin', 'svmax']],
  [`${LENGTH}.container_query_length_units`, ['cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax']],
];

/** The units whose key is their own name under another type. */
const OTHERS: readonly (readonly [type: string, units: readonly string[]])[] = [
  ['css.types.angle', ['deg', 'grad', 'rad', 'turn']],
  ['css.types.resolution', ['dpcm', 'dpi', 'dppx', 'x']],
];

export const UNITS: Readonly<Record<string, string>> = Object.fromEntries([
  ...OWN_LENGTH.map((unit) => [unit, `${LENGTH}.${unit}`]),
  // `Q`, the quarter-millimetre, is the one key spelled in uppercase.
  ['q', `${LENGTH}.Q`],
  ...FAMILIES.flatMap(([key, units]) => units.map((unit) => [unit, key])),
  ...OTHERS.flatMap(([type, units]) => units.map((unit) => [unit, `${type}.${unit}`])),
]);
