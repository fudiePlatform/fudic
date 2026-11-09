/**
 * The `{n}` of `max-size` in its text, with its unit (SDD-81 §3.2): `Como mucho {n}.` with
 * `max-size 2mb` reads `Como mucho 2 MB.`, not `Como mucho 2097152.`
 *
 * Written into the text when the module is emitted: the size is a literal of the use, so there is
 * nothing to work out at runtime, and the server's `detail` and the form's message say the same.
 * Base 1024, as the sizes were read (`2mb` is 2097152 bytes) and as the file systems the user
 * chooses from show them.
 */

import type { Literal } from './ast.js';

const UNITS: readonly (readonly [string, number])[] = [
  ['GB', 1024 ** 3],
  ['MB', 1024 ** 2],
  ['KB', 1024],
];

/** `2097152` → `2 MB`, `1536` → `1.5 KB`, `300` → `300 bytes`. Two decimals at most. */
export function sizeText(bytes: number): string {
  const [unit, size] = UNITS.find(([, s]) => bytes >= s) ?? ['bytes', 1];
  return `${String(Math.round((bytes / size) * 100) / 100)} ${unit}`;
}

/** The text of a rule use, its `{n}` sized when the rule is `max-size` with a number. */
export function withSize(rule: string, text: string, args: readonly Literal[]): string {
  const n = args[0];
  return rule === 'max-size' && n?.kind === 'number' ? text.replace(/\{n\}/gu, sizeText(n.value)) : text;
}
