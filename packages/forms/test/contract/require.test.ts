/**
 * SDD-60 §3.6 — `require`: the pieces the generated test is made of, and the rule it becomes
 * in a `summary` or `on` a field.
 */

import { describe, expect, it } from 'vitest';
import {
  compare,
  contains,
  formOf,
  group,
  isEmpty,
  lengthOf,
  requireOn,
  requireRule,
  same,
  str,
  validAt,
  valueAt,
  type Test,
} from '../../src/contract/index.js';
import { required } from '../../src/validators/required.js';
import { Validity } from '../../src/validity.js';
import type { AnyForm } from '../../src/types.js';

/** `clave == repetir`, over the value of the group. */
const matching: Test = ((v: { clave: string; repetir: string }) => same(v.clave, v.repetir)) as Test;

describe('the operators', () => {
  it('empty: null, "" and an empty list', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty('a')).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
  });

  it('length: of a text or a list; 0 without one', () => {
    expect(lengthOf('abc')).toBe(3);
    expect(lengthOf([1, 2])).toBe(2);
    expect(lengthOf(null)).toBe(0);
    expect(lengthOf(7)).toBe(0);
  });

  it('contains: a text in a text, a value in a list; nothing else', () => {
    expect(contains('secreto-ana', 'ana')).toBe(true);
    expect(contains('secreto', 'ana')).toBe(false);
    expect(contains('a1', 1)).toBe(true);
    expect(contains(['a', 'b'], 'b')).toBe(true);
    expect(contains([new Date(5)], new Date(5))).toBe(true);
    expect(contains(['a'], 'c')).toBe(false);
    expect(contains(null, 'a')).toBe(false);
    expect(contains(3, 3)).toBe(false);
  });

  it('==: dates by their instant, the rest by identity', () => {
    expect(same(new Date(1), new Date(1))).toBe(true);
    expect(same(new Date(1), new Date(2))).toBe(false);
    expect(same('a', 'a')).toBe(true);
    expect(same(NaN, NaN)).toBe(true);
    expect(same(new Date(1), 1)).toBe(false);
    expect(same({}, {})).toBe(false);
  });

  it('< <= > >= on numbers and dates; false when a side has no value', () => {
    expect(compare(1, '<', 2)).toBe(true);
    expect(compare(2, '<', 2)).toBe(false);
    expect(compare(2, '<=', 2)).toBe(true);
    expect(compare(3, '<=', 2)).toBe(false);
    expect(compare(3, '>', 2)).toBe(true);
    expect(compare(2, '>', 2)).toBe(false);
    expect(compare(2, '>=', 2)).toBe(true);
    expect(compare(1, '>=', 2)).toBe(false);
    expect(compare(new Date(1), '<', new Date(2))).toBe(true);
    expect(compare(null, '<', 2)).toBe(false);
    expect(compare(1, '<', null)).toBe(false);
    expect(compare('a', '<', 'b')).toBe(true);
  });

  it('valueAt: a path into a value; [] is the value itself', () => {
    const v = { a: { b: 2 } };
    expect(valueAt(v, ['a', 'b'])).toBe(2);
    expect(valueAt(v, [])).toBe(v);
  });
});

describe('valid c', () => {
  it('asks a control or a group whether it holds, silently', () => {
    const f = formOf(
      {
        name: str('', [required]),
        acceso: group({ clave: str('x', [required]) }),
      },
      [],
      { validity: Validity.Rules },
    );
    expect(validAt(f as AnyForm, ['name'])).toBe(false);
    expect(validAt(f as AnyForm, ['acceso'])).toBe(true);
    expect(validAt(f as AnyForm, ['acceso', 'clave'])).toBe(true);
    expect(f.name.errors()).toBeNull();
  });
});

describe('the rule', () => {
  it('in a summary: fails with its code when the test does not hold', async () => {
    const acceso = group({ clave: str('a'), repetir: str('b') }, [requireRule('mismatch', matching)]);
    const f = formOf({ acceso });
    expect(await f.$validate()).toBe(false);
    expect(f.acceso.$summary()).toEqual({ mismatch: true });
    f.acceso.repetir.set('a');
    expect(await f.$validate()).toBe(true);
    expect(f.acceso.$summary()).toBeNull();
  });

  it('the test reads the root form too', async () => {
    const test: Test = ((_v: unknown, root: AnyForm) => (root.$value() as { name: string }).name !== 'admin') as Test;
    const f = formOf({ name: str('admin') }, [requireRule('reserved', test)]);
    expect(await f.$validate()).toBe(false);
    expect(f.$summary()).toEqual({ reserved: true });
  });

  it('on a field: the same test over the form or group at its path, as that field\'s rule', async () => {
    const f = formOf({
      acceso: group({
        clave: str('a'),
        repetir: str('b', [requireOn('mismatch', ['acceso'], matching)]),
      }),
    });
    expect(await f.$validate()).toBe(false);
    expect(f.acceso.repetir.errors()).toEqual({ mismatch: true });
    expect(f.acceso.$summary()).toBeNull();
    f.acceso.repetir.set('a');
    expect(await f.$validate()).toBe(true);
  });

  it('on a field of the root form: the path is []', async () => {
    const test: Test = ((v: { a: string; b: string }) => v.a !== v.b) as Test;
    const f = formOf({ a: str('x'), b: str('x', [requireOn('same-as-a', [], test)]) });
    expect(await f.$validate()).toBe(false);
    expect(f.b.errors()).toEqual({ 'same-as-a': true });
  });
});
