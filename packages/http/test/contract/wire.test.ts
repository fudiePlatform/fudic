/**
 * SDD-60 §3.2 and criterion 37 — every value is checked against its type when it crosses the
 * wire: a 400 whose `detail` names the argument.
 */

import { describe, expect, it } from 'vitest';
import { conform, conformAll, fromText, toText, type Ty } from '../../src/contract/index.js';
import { HttpError } from '../../src/errors.js';

const ID = '0190a6b2-7c1e-7d3a-9f00-1a2b3c4d5e6f';

/** The `detail` of the 400 that `fn` throws. */
function refused(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(400);
    return (e as HttpError).problem.detail;
  }
  throw new Error('it did not refuse');
}

describe('the primitives', () => {
  it('str takes any text and nothing else', () => {
    expect(conform('str', '', 'x')).toBe('');
    expect(conform('str', 'abc', 'x')).toBe('abc');
    expect(refused(() => conform('str', 1, 'argument q'))).toBe('argument q is not a valid str');
  });

  it('bool', () => {
    expect(conform('bool', false, 'x')).toBe(false);
    expect(refused(() => conform('bool', 'true', 'x'))).toBe('x is not a valid bool');
  });

  it('uuid: any case; abc is not one', () => {
    expect(conform('uuid', ID, 'x')).toBe(ID);
    expect(conform('uuid', ID.toUpperCase(), 'x')).toBe(ID.toUpperCase());
    expect(refused(() => conform('uuid', 'abc', 'argument id'))).toBe('argument id is not a valid uuid');
    expect(refused(() => conform('uuid', 3, 'x'))).toBe('x is not a valid uuid');
  });

  it('date: a Date or its text; an invalid one is refused', () => {
    const d = new Date('2026-10-21T00:00:00.000Z');
    expect(conform('date', d, 'x')).toBe(d);
    expect(conform('date', '2026-10-21T00:00:00.000Z', 'x')).toEqual(d);
    expect(refused(() => conform('date', 'nope', 'x'))).toBe('x is not a valid date');
    expect(refused(() => conform('date', new Date(Number.NaN), 'x'))).toBe('x is not a valid date');
    expect(refused(() => conform('date', 5, 'x'))).toBe('x is not a valid date');
  });

  it('the integer widths, at both edges', () => {
    const cases: readonly (readonly [Ty, number, number])[] = [
      ['u8', 0, 255],
      ['i8', -128, 127],
      ['u16', 0, 65_535],
      ['i16', -32_768, 32_767],
      ['u32', 0, 4_294_967_295],
      ['i32', -2_147_483_648, 2_147_483_647],
    ];
    for (const [ty, low, high] of cases) {
      expect(conform(ty, low, 'x')).toBe(low);
      expect(conform(ty, high, 'x')).toBe(high);
      expect(refused(() => conform(ty, low - 1, 'x'))).toBe(`x is not a valid ${ty as string}`);
      expect(refused(() => conform(ty, high + 1, 'x'))).toBe(`x is not a valid ${ty as string}`);
    }
    expect(refused(() => conform('i32', 1.5, 'x'))).toBe('x is not a valid i32');
    expect(refused(() => conform('u8', '1', 'x'))).toBe('x is not a valid u8');
  });

  it('f32 and f64: finite, within their range', () => {
    expect(conform('f32', 1.5, 'x')).toBe(1.5);
    expect(refused(() => conform('f32', 1e39, 'x'))).toBe('x is not a valid f32');
    expect(conform('f64', 1e39, 'x')).toBe(1e39);
    expect(refused(() => conform('f64', Number.POSITIVE_INFINITY, 'x'))).toBe('x is not a valid f64');
    expect(refused(() => conform('f64', Number.NaN, 'x'))).toBe('x is not a valid f64');
    expect(refused(() => conform('f64', '1', 'x'))).toBe('x is not a valid f64');
  });
});

describe('the compound types', () => {
  it('a list checks each item and names it', () => {
    expect(conform({ list: 'u8' }, [1, 2], 'x')).toEqual([1, 2]);
    expect(refused(() => conform({ list: 'u8' }, [1, 300], 'argument ids'))).toBe('argument ids[1] is not a valid u8');
    expect(refused(() => conform({ list: 'u8' }, 'a', 'x'))).toBe('x is not a valid u8[]');
    expect(refused(() => conform({ list: { opt: 'u8' } }, 'a', 'x'))).toBe('x is not a valid u8?[]');
  });

  it('an optional may be missing or null', () => {
    expect(conform({ opt: 'str' }, undefined, 'x')).toBeUndefined();
    expect(conform({ opt: 'str' }, null, 'x')).toBeUndefined();
    expect(conform({ opt: 'str' }, 'a', 'x')).toBe('a');
    expect(refused(() => conform({ opt: 'str' }, 1, 'x'))).toBe('x is not a valid str');
  });

  it('an enum is one of its members', () => {
    const variant: Ty = { oneOf: ['default', 'highlight'] };
    expect(conform(variant, 'highlight', 'x')).toBe('highlight');
    expect(refused(() => conform(variant, 'other', 'x'))).toBe('x is not a valid default | highlight');
    expect(refused(() => conform(variant, 1, 'x'))).toBe('x is not a valid default | highlight');
  });

  it('a map checks its keys as text and its values', () => {
    const routes: Ty = { map: ['u16', 'str'] };
    expect(conform(routes, { 403: '/entrar' }, 'x')).toEqual({ 403: '/entrar' });
    expect(refused(() => conform(routes, { abc: '/x' }, 'x'))).toBe('x.abc is not a valid u16');
    expect(refused(() => conform(routes, { 403: 1 }, 'x'))).toBe('x.403 is not a valid str');
    expect(refused(() => conform(routes, [], 'x'))).toBe('x is not a valid map u16 str');
    expect(refused(() => conform({ map: ['uuid', 'bool'] }, null, 'x'))).toBe('x is not a valid map uuid bool');
  });

  it('a type keeps what it declares, drops the rest, and may name itself through ?', () => {
    const person: Ty = {
      fields: () => ({ id: 'i32', name: 'str', boss: { opt: person } }),
    };
    expect(conform(person, { id: 1, name: 'Ana', extra: true }, 'x')).toEqual({ id: 1, name: 'Ana' });
    expect(conform(person, { id: 1, name: 'Ana', boss: { id: 2, name: 'Eva' } }, 'x')).toEqual({
      id: 1,
      name: 'Ana',
      boss: { id: 2, name: 'Eva' },
    });
    expect(refused(() => conform(person, { id: 'a', name: 'Ana' }, 'argument p'))).toBe('argument p.id is not a valid i32');
    expect(refused(() => conform(person, 'a', 'x'))).toBe('x is not a valid object');
    expect(refused(() => conform({ list: person }, [null], 'x'))).toBe('x[0] is not a valid object');
  });
});

describe('conformAll', () => {
  it('the declared arguments, each by its type; a missing optional is left out', () => {
    expect(conformAll({ id: 'i32', note: { opt: 'str' } }, { id: 1, extra: 2 }, 'argument')).toEqual({ id: 1 });
    expect(refused(() => conformAll({ id: 'i32' }, { id: 'a' }, 'argument'))).toBe('argument id is not a valid i32');
  });

  it('no object at all is no arguments', () => {
    expect(conformAll({}, undefined, 'argument')).toEqual({});
    expect(refused(() => conformAll({ id: 'i32' }, 'x', 'argument'))).toBe('argument id is not a valid i32');
  });
});

describe('a value written in a URL', () => {
  it('bool is true or false', () => {
    expect(fromText('bool', 'true', 'x')).toBe(true);
    expect(fromText('bool', 'false', 'x')).toBe(false);
    expect(refused(() => fromText('bool', '1', 'argument notify'))).toBe('argument notify is not a valid bool');
  });

  it('numbers by their width; empty text is not a number', () => {
    expect(fromText('i32', '42', 'x')).toBe(42);
    expect(fromText('f64', '1.5', 'x')).toBe(1.5);
    expect(refused(() => fromText('i32', 'abc', 'argument id'))).toBe('argument id is not a valid i32');
    expect(refused(() => fromText('u8', '', 'x'))).toBe('x is not a valid u8');
    expect(refused(() => fromText('u8', '  ', 'x'))).toBe('x is not a valid u8');
  });

  it('str, uuid, date and enum from their text', () => {
    expect(fromText('str', 'abc', 'x')).toBe('abc');
    expect(fromText('uuid', ID, 'x')).toBe(ID);
    expect(refused(() => fromText('uuid', 'abc', 'x'))).toBe('x is not a valid uuid');
    expect(fromText('date', '2026-10-21T00:00:00.000Z', 'x')).toEqual(new Date('2026-10-21T00:00:00.000Z'));
    expect(fromText({ oneOf: ['a', 'b'] }, 'b', 'x')).toBe('b');
  });

  it('an optional reads as its inner type', () => {
    expect(fromText({ opt: 'bool' }, 'true', 'x')).toBe(true);
    expect(fromText({ opt: 'u8' }, '7', 'x')).toBe(7);
  });

  it('toText writes a date as ISO and the rest as text', () => {
    expect(toText(new Date('2026-10-21T00:00:00.000Z'))).toBe('2026-10-21T00:00:00.000Z');
    expect(toText(42)).toBe('42');
    expect(toText(true)).toBe('true');
  });
});
