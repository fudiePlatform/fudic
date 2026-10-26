/**
 * SDD-60 §3.7, §3.11 — a `rule` of a `.fudapi`: `.check` answers a verdict, the error and its
 * arguments come from the declaration, and `runs server` / `async` mark the validator as today.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { isAsync } from '../../src/async-flag.js';
import { isServerOnly } from '../../src/server-flag.js';
import { camel, loadingFile, resetRegistry, rule, str, formOf, text } from '../../src/contract/index.js';
import type { AnyForm, Errors } from '../../src/types.js';

afterEach(() => {
  loadingFile(undefined);
  resetRegistry();
});

/** Runs a validator with no form around it. */
const run = (v: unknown, value: unknown): Errors | null | Promise<Errors | null> =>
  (v as (x: unknown, root: AnyForm) => Errors | null)(value, undefined as unknown as AnyForm);

describe('camel', () => {
  it('is the key a code takes in an error map', () => {
    expect(camel('nif-unique')).toBe('nifUnique');
    expect(camel('min-length')).toBe('minLength');
    expect(camel('a-2b')).toBe('a2b');
    expect(camel('required')).toBe('required');
  });
});

describe('the verdict', () => {
  it('true passes; false fails with the first code, `true` without parameters', () => {
    const r = rule<string>({ id: 'rules/nif', name: 'nif-letter', fails: [['nif-letter', []]] });
    r.check((v) => v.endsWith('Z'));
    const v = r.use();
    expect(run(v, '1Z')).toBeNull();
    expect(run(v, '1A')).toEqual({ nifLetter: true });
  });

  it('one parameter is the payload, as `{ min: 18 }` today', () => {
    const r = rule<number, { n: number }>({ id: '@fudic/forms/rules', name: 'min', fails: [['min', ['n']]] });
    r.check((v, p) => v >= p.n);
    expect(run(r.use({ n: 18 }), 17)).toEqual({ min: 18 });
    expect(run(r.use({ n: 18 }), 18)).toBeNull();
  });

  it('several parameters travel as an object', () => {
    const r = rule<number, { low: number; high: number }>({
      id: 'rules/range',
      name: 'between',
      fails: [['out-of-range', ['low', 'high']]],
    });
    r.check((v, p) => v >= p.low && v <= p.high);
    expect(run(r.use({ low: 1, high: 3 }), 9)).toEqual({ outOfRange: { low: 1, high: 3 } });
  });

  it('a code fails with that one; an unknown code falls back to the first', () => {
    const r = rule<string, {}, 'too-short' | 'too-long'>({
      id: 'rules/size',
      name: 'size',
      fails: [
        ['too-short', []],
        ['too-long', []],
      ],
    });
    r.check((v) => (v.length < 2 ? 'too-short' : v.length > 4 ? 'too-long' : true));
    const v = r.use();
    expect(run(v, 'a')).toEqual({ tooShort: true });
    expect(run(v, 'abcdef')).toEqual({ tooLong: true });
    expect(run(v, 'abc')).toBeNull();
    resetRegistry();
    r.check(() => 'other' as 'too-long');
    expect(run(v, 'x')).toEqual({ tooShort: true });
  });

  it('a promised verdict is awaited', async () => {
    const r = rule<string>({ id: 'rules/alias', name: 'alias-taken', fails: [['alias-taken', []]], server: true, async: true });
    r.check(async (v) => v !== 'ana');
    const v = r.use();
    expect(await run(v, 'ana')).toEqual({ aliasTaken: true });
    expect(await run(v, 'eva')).toBeNull();
  });
});

describe('the marks', () => {
  it('runs server marks it server-only; async marks it async; neither by default', () => {
    const both = rule({ id: 'x', name: 'a', fails: [['a', []]] }).use();
    expect(isServerOnly(both)).toBe(false);
    expect(isAsync(both)).toBe(false);
    const server = rule({ id: 'x', name: 'b', fails: [['b', []]], server: true }).use();
    expect(isServerOnly(server)).toBe(true);
    expect(isAsync(server)).toBe(false);
    const late = rule({ id: 'x', name: 'c', fails: [['c', []]], async: true }).use();
    expect(isAsync(late)).toBe(true);
  });

  it('runs both goes in src/browser; runs server in src/server', () => {
    const both = rule({ id: 'rules/nif', name: 'nif-letter', fails: [['nif-letter', []]] });
    loadingFile('server', 'src/server/nif.ts');
    expect(() => both.check(() => true)).toThrow('nif-letter of rules/nif must be implemented in src/browser: src/server/nif.ts');
    const server = rule({ id: 'rules/nif', name: 'nif-unique', fails: [['nif-unique', []]], server: true });
    loadingFile('browser', 'src/browser/nif.ts');
    expect(() => server.check(() => true)).toThrow('nif-unique of rules/nif must be implemented in src/server: src/browser/nif.ts');
  });

  it('the browser variant of a runs server rule has no implementation possible', () => {
    const r = rule({ id: 'rules/nif', name: 'nif-unique', fails: [['nif-unique', []]], server: true, never: true });
    expect(() => r.check(() => true)).toThrow('nif-unique of rules/nif must be implemented in src/server');
  });
});

describe('without an implementation', () => {
  it('the validator fails saying what is missing', () => {
    const r = rule({ id: 'rules/nif', name: 'nif-letter', fails: [['nif-letter', []]] });
    expect(() => run(r.use(), 'x')).toThrow('nif-letter of rules/nif has no implementation in src/browser');
  });
});

describe('in a form', () => {
  it('a field runs it and words its error from the template', async () => {
    const minLength = rule<string, { n: number }>({ id: '@fudic/forms/rules', name: 'min-length', fails: [['min-length', ['n']]] });
    minLength.check((v, p) => v === '' || v.length >= p.n);
    const f = formOf({
      alias: str('ab', [minLength.use({ n: 3 })], { messages: { minLength: text('Al menos {n} caracteres.') } }),
    });
    expect(await f.$validate()).toBe(false);
    expect(f.alias.errors()).toEqual({ minLength: 3 });
    expect(f.alias.message()).toBe('Al menos 3 caracteres.');
  });
});
