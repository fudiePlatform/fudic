/**
 * A component's fixture file, written (SDD-53 §3.2): `fudic g spec` and the light bulb both
 * call these, so the file the terminal writes and the one the editor creates are the same.
 *
 * TypeScript checks every value through the `satisfies`; the `.fudspec` only reads the keys.
 */

import { keyOf, objectOf, type PropField } from './shape.js';

/** One fixture entry: `<key>: { … }`, with the required props that have a sample. */
export function fixtureEntry(key: string, props: readonly PropField[]): string {
  return `${keyOf(key)}: ${objectOf(props)}`;
}

/** The whole `<tag>.fixture.ts`, one entry per key, in the order given. */
export function fixtureModule(tag: string, keys: readonly string[], props: readonly PropField[]): string {
  const entries = keys.map((key) => `  ${fixtureEntry(key, props)},\n`).join('');
  return (
    `import type { $Props } from './${tag}.fud';\n` +
    '\n' +
    `export default {\n${entries}} satisfies Record<string, $Props>;\n`
  );
}
