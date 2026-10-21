/**
 * SDD-60 §3.10 and criterion 23 (the forms half) — `fudapi/rules.fudapi` and its implementations
 * in `impl/browser`, through the module generated from it: the same verdicts, codes and
 * arguments as today's validators. One change, written in the spec: `pattern` fails with
 * `{ pattern: true }` where today it carried the regex source.
 */

import { describe, expect, it } from 'vitest';
import '../impl/browser/rules.js';
import { max as maxRule, maxLength as maxLengthRule, min as minRule, minLength as minLengthRule, pattern as patternRule, required as requiredRule } from './generated/rules.browser.js';
import { email } from './generated/patterns.browser.js';
import { str, u8, arr, formOf, text } from '../src/contract/index.js';
import { max } from '../src/validators/max.js';
import { maxLength } from '../src/validators/max-length.js';
import { min } from '../src/validators/min.js';
import { minLength } from '../src/validators/min-length.js';
import { pattern } from '../src/validators/pattern.js';
import { required } from '../src/validators/required.js';
import type { AnyForm, AnyValidator, Errors } from '../src/types.js';

const ROOT = undefined as unknown as AnyForm;
const run = (v: AnyValidator<never>, value: unknown): Errors | null =>
  (v as unknown as (x: unknown, r: AnyForm) => Errors | null)(value, ROOT);

const TEXTS = ['', 'a', 'ab', 'abcd', 'abcdefgh'];
const LISTS = [[], ['a'], ['a', 'b', 'c']];
const NUMBERS = [null, -1, 0, 17, 18, 120, 121, 1.5];

describe('criterion 23: the built-in rules behave as today', () => {
  it('required: "" and null fail; false, 0 and a list do not', () => {
    for (const value of ['', null, 'x', false, true, 0, [], ['a']]) {
      expect(run(requiredRule.use(), value), String(value)).toEqual(required(value, ROOT));
    }
  });

  it('min and max, with their argument in the error', () => {
    for (const value of NUMBERS) {
      expect(run(minRule.use({ n: 18 }), value)).toEqual(min(18)(value, ROOT));
      expect(run(maxRule.use({ n: 120 }), value)).toEqual(max(120)(value, ROOT));
    }
    expect(run(minRule.use({ n: 18 }), 17)).toEqual({ min: 18 });
    expect(run(maxRule.use({ n: 120 }), 121)).toEqual({ max: 120 });
  });

  it('min-length and max-length, on texts and lists; empty is required\'s business', () => {
    for (const value of [...TEXTS, ...LISTS, null]) {
      expect(run(minLengthRule.use({ n: 3 }), value), JSON.stringify(value)).toEqual(minLength(3)(value as never, ROOT));
      expect(run(maxLengthRule.use({ n: 3 }), value), JSON.stringify(value)).toEqual(maxLength(3)(value as never, ROOT));
    }
    expect(run(minLengthRule.use({ n: 3 }), 'ab')).toEqual({ minLength: 3 });
    expect(run(maxLengthRule.use({ n: 3 }), ['a', 'b', 'c', 'd'])).toEqual({ maxLength: 3 });
  });

  it('pattern: the same verdict; the error is { pattern: true }', () => {
    const regex = /^(?:[a-z]+)$/u;
    for (const value of ['', null, 'abc', 'Abc', 'a1']) {
      const today = pattern(regex)(value, ROOT);
      expect(run(patternRule.use({ regex }), value), String(value)).toEqual(today === null ? null : { pattern: true });
    }
  });

  it('in a form, with the texts of a .fudapi', async () => {
    const f = formOf({
      name: str('', [requiredRule.use()], { messages: { required: text('Escribe el nombre.') } }),
      age: u8(17, [minRule.use({ n: 18 })], { messages: { min: text('Al menos {n} años.') } }),
      tags: arr(str, ['a'], [minLengthRule.use({ n: 2 })], { messages: { minLength: text('Al menos {n}.') } }),
    });
    expect(await f.$validate()).toBe(false);
    f.$touch();
    expect([f.name.message(), f.age.message(), f.tags.message()]).toEqual(['Escribe el nombre.', 'Al menos 18 años.', 'Al menos 2.']);
  });
});

describe('the email pattern (WHATWG)', () => {
  it.each(['ana@example.com', 'a.b+c@x-y.example', 'a@b', "o'brien@x.ie"])('accepts %s', (address) => {
    expect(email.test(address)).toBe(true);
  });

  it.each(['', 'ana', 'ana@', '@x.es', 'a b@x.es', 'a@-x.es', 'a@x-.es', 'a@x..es', 'ana@x.es extra'])('rejects %j: anchored, the whole text', (address) => {
    expect(email.test(address)).toBe(false);
  });
});
