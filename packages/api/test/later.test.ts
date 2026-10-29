/**
 * SDD-70 §3.1 and criterion 2 — `later` after the type of a field of `load` is kept with its span;
 * anywhere else it is `FUD1324` on the word, and nothing else (§8.2.3: it is not reported again
 * as left over).
 */

import { describe, expect, it } from 'vitest';
import type { LoadDecl } from '../src/index.js';
import { parseApi } from '../src/index.js';
import { codes, only, slice } from './helpers.js';

const loadOf = (source: string): LoadDecl => parseApi(source).value.declarations.find((d) => d.kind === 'load') as LoadDecl;

describe('`later` on a field of `load` (SDD-70 §3.1)', () => {
  it('keeps the span of the word and reports nothing', () => {
    const source = 'load ssr\n  title  str\n  users  Person[]  later\n\ntype Person\n  id  i32\n';
    expect(codes(source)).toEqual([]);
    const [title, users] = loadOf(source).fields;
    expect('later' in title!).toBe(false);
    expect(slice(source, users!.later!)).toBe('later');
    expect(slice(source, users!.span)).toBe('users  Person[]  later');
  });

  it('after an optional type and after a map (§8.2.2)', () => {
    const source = 'load\n  users  Person[]?  later\n  byName  map str Person  later\n\ntype Person\n  id  i32\n';
    expect(codes(source)).toEqual([]);
    const [users, byName] = loadOf(source).fields;
    expect(users!.type.kind).toBe('optional');
    expect(slice(source, users!.later!)).toBe('later');
    expect(byName!.type.kind).toBe('map');
    expect(slice(source, byName!.later!)).toBe('later');
  });

  it('a second `later` is a word left over, on the second one only', () => {
    const source = 'load\n  users  str  later later';
    const d = only(source);
    expect(d.code).toBe('FUD1064');
    expect(d.span.start).toBe(source.lastIndexOf('later'));
    expect(slice(source, loadOf(source).fields[0]!.later!)).toBe('later');
  });
});

/** Every place `later` does not belong, with the input and the offset of the misplaced word. */
const MISPLACED: readonly (readonly [where: string, source: string])[] = [
  ['a field of a type', 'type Person\n  name  str  later'],
  ['a field of a form', 'form f\n  name  str  later'],
  ['a field of a form, before its initial value', 'form f\n  name  str  later = ""'],
  ['a field of a group of a form', 'form f\n  g  group\n    name  str  later'],
  ['an argument of a function', 'get search\n  q  str  later'],
  ['a query argument of a function', 'get search\n  query q  str  later'],
  ['the return of a function', 'get search\n  -> str  later'],
  ['a parameter of a rule', 'rule r\n  on field str\n  runs both\n  n  u32  later\n  fails r'],
  ['a parameter of a middleware', 'middleware m\n  client\n  realm  str  later'],
  ['a field a middleware adds', 'middleware m\n  client\n  adds\n    user  str  later'],
];

describe('`later` anywhere else (criterion 2)', () => {
  for (const [where, source] of MISPLACED) {
    it(`FUD1324 on the word, alone: ${where}`, () => {
      const d = only(source);
      expect(d.code).toBe('FUD1324');
      expect(d.span).toEqual({ start: source.indexOf('later'), end: source.indexOf('later') + 'later'.length });
    });
  }

  it('the field of a type keeps no `later`', () => {
    const { value } = parseApi('type Person\n  name  str  later');
    const type = value.declarations[0]!;
    expect(type.kind === 'type' && 'later' in type.fields[0]!).toBe(false);
  });

  it('after the misplaced word, what is left over is still left over', () => {
    const source = 'type Person\n  name  str  later extra';
    expect(codes(source)).toEqual(['FUD1324', 'FUD1064']);
  });

  it('a layout: FUD1324 on the word, not reported again as left over', () => {
    const source = 'layout later';
    const d = only(source);
    expect(d.code).toBe('FUD1324');
    expect(slice(source, d.span)).toBe('later');
  });
});
