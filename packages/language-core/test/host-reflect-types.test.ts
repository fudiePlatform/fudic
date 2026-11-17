/**
 * SDD-86 §3.6, criterion 25 — a prop reflected on the host is an attribute with an expression on
 * the identity tag, and the editor holds its value to what an attribute can carry: a scalar.
 *
 * Measured with the real checker over the projected corpus: a string, a number, a boolean and
 * `null` / `undefined` pass; an object, an array or a function is a type error, on the `.fud`.
 * The name is the author's (§8.1 decision 10): `variant`, as in the spec's own example, or a
 * `data-*`.
 */
import { describe, expect, it } from 'vitest';
import { typecheckCorpus } from './typecheck.js';

const FILE = 'sdd86/app-reflect.fud';
const NAMES = ['variant', 'data-variant'] as const;

/** A component that reflects `value` (declared as `type`) in the attribute `name` of its own tag. */
const component = (name: string, type: string, value = 'variant'): string =>
  [
    '@code {',
    `  const { variant } = props<{ variant: ${type} }>();`,
    '}',
    `<app-reflect role="group" ${name}="@${value}">`,
    '  <template shadowrootmode="open"><p>x</p></template>',
    '</app-reflect>',
    '',
  ].join('\n');

const complaints = (source: string) => typecheckCorpus({ [FILE]: source }).filter((d) => d.fud === FILE);

for (const name of NAMES) {
  describe(`${name}: a scalar reflects (§3.6)`, () => {
    it.each([
      ["'default' | 'highlight'"],
      ['string'],
      ['number'],
      ['bigint'],
      ['boolean'],
      ['string | null'],
      ['number | undefined'],
    ])('%s: no complaint', (type) => {
      expect(complaints(component(name, type))).toEqual([]);
    });
  });

  describe(`${name}: anything else is a type error in the editor (criterion 25)`, () => {
    it.each([['{ a: number }'], ['string[]'], ['() => void'], ['Date']])('%s', (type) => {
      const found = complaints(component(name, type));
      expect(found.length).toBeGreaterThan(0);
      // On the `.fud`, where the author wrote it.
      expect(found.some((d) => d.sourceText !== undefined && d.sourceText.includes('variant'))).toBe(true);
    });

    it('an object literal written in place', () => {
      expect(complaints(component(name, 'string', '({ a: 1 })')).length).toBeGreaterThan(0);
    });
  });
}
