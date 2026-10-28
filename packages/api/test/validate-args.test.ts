/**
 * SDD-67 §3.5 and §3.8, criterion 18 — the rules under an argument of a function, checked as
 * those under a field of a form: the six of `@fudic/forms`, and `FUD1260` for anything else.
 */

import { describe, expect, it } from 'vitest';
import { isArgRule } from '../src/index.js';
import { slice } from './helpers.js';
import { app, check, codesOf, lib } from './project.js';

const lines = (...l: string[]): string => l.join('\n');

/** `put save /:id` with `query search str`, a body argument `name str`, and `rules` under `arg`. */
function fn(arg: 'id' | 'search' | 'name' | 'age', ...rules: string[]): string {
  const under = (name: string): string[] => (name === arg ? rules.map((r) => `    ${r}`) : []);
  return lines(
    'put save /:id',
    '  id      uuid',
    ...under('id'),
    '  query search str',
    ...under('search'),
    '  name    str',
    ...under('name'),
    '  age     i32',
    ...under('age'),
  );
}

/** The diagnostics, as code, covered text and message. */
const found = (text: string, others: Parameters<typeof check>[1] = {}) =>
  check(text, others).diagnostics.map((d) => [d.code, slice(text, d.span), d.message] as const);

const PROJECT_RULE = app('rules/taken', 'rule email-taken\n  on field str\n  runs server\n  fails taken');

describe('criterion 18: the rules under an argument', () => {
  it('the six of @fudic/forms, on the route, on query and on the body, pass', () => {
    expect(codesOf(fn('name', 'required', 'max-length 80', 'min-length 2', 'pattern email'))).toEqual([]);
    expect(codesOf(fn('age', 'min 18  "Too young."', 'max 99'))).toEqual([]);
    expect(codesOf(fn('search', 'min-length 2'))).toEqual([]);
    expect(codesOf(fn('id', 'required'))).toEqual([]);
  });

  it('email-taken under an argument is FUD1260 on its name', () => {
    for (const arg of ['id', 'search', 'name'] as const) {
      const text = fn(arg, 'email-taken');
      expect(found(text, { others: [PROJECT_RULE] })).toEqual([
        [
          'FUD1260',
          'email-taken',
          'rule `email-taken` cannot check an argument: only required, min, max, min-length, max-length and pattern can',
        ],
      ]);
    }
  });

  it('a rule of another library is FUD1260 too: only those of @fudic/forms', () => {
    const acme = lib('@acme/rules', 'rules', 'rule slug\n  on field str\n  runs both\n  fails slug');
    expect(codesOf(fn('name', 'slug'), { others: [acme] })).toEqual(['FUD1260']);
  });

  it('min-length 3 on an i32 is FUD1083, saying argument', () => {
    const [only, ...rest] = found(fn('age', 'min-length 3'));
    expect(rest).toEqual([]);
    expect(only![0]).toBe('FUD1083');
    expect(only![2]).toContain('`i32` argument');
    expect(only![2]).not.toContain('field');
  });

  it('min "a" is FUD1084', () => {
    expect(codesOf(fn('age', 'min "a"'))).toEqual(['FUD1084']);
    expect(codesOf(fn('name', 'pattern nope'))).toEqual(['FUD1084']);
  });

  it('max-lenght 3 is FUD1080, with max-length as candidate', () => {
    const [only, ...rest] = found(fn('name', 'max-lenght 3'));
    expect(rest).toEqual([]);
    expect(only![0]).toBe('FUD1080');
    expect(only![1]).toBe('max-lenght');
    expect(only![2]).toContain('`max-length`');
  });

  it('"{x}" in the text is FUD1085', () => {
    expect(codesOf(fn('name', 'max-length 80  "{x}"'))).toEqual(['FUD1085']);
    expect(codesOf(fn('name', 'max-length 80  "At most {n}."'))).toEqual([]);
  });

  it('each argument is checked on its own, and every rule under it', () => {
    const text = lines('put save', '  a  str', '    max-lenght 3', '  b  i32', '    min-length 3', '    min "x"');
    expect(codesOf(text)).toEqual(['FUD1080', 'FUD1083', 'FUD1084']);
  });

  it('a field of a form keeps FUD1083 saying field, and may still use a project rule', () => {
    const form = lines('form f', '  n  i32', '    min-length 3', '  e  str', '    email-taken');
    const diagnostics = found(form, { others: [PROJECT_RULE] });
    expect(diagnostics.map((d) => d[0])).toEqual(['FUD1083']);
    expect(diagnostics[0]![2]).toContain('`i32` field');
  });
});

describe('isArgRule', () => {
  it('names the six of @fudic/forms, and nothing else', () => {
    const acme = lib('@acme/rules', 'rules', 'rule slug\n  on field str\n  runs both\n  fails slug');
    const { index } = check(fn('name'), { others: [PROJECT_RULE, acme] });
    for (const name of ['required', 'min', 'max', 'min-length', 'max-length', 'pattern']) {
      expect(isArgRule(index.lookup('rule', name)!), name).toBe(true);
    }
    expect(isArgRule(index.lookup('rule', 'email-taken')!)).toBe(false);
    expect(isArgRule(index.lookup('rule', 'slug')!)).toBe(false);
  });
});
