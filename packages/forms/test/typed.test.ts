/**
 * SDD-33 §6.17–§6.18 — a declared type is a range, and the range goes first.
 *
 * None of this is about bytes: the encoder belongs to transport. What a type buys
 * here is that `u8(21)` refuses 300 with JSON exactly as it would with a binary
 * wire, and that the refusal is a normal validation error rather than a silent
 * truncation.
 */

import { describe, expect, it, vi } from 'vitest';
import { form } from '../src/form.js';
import { min } from '../src/validators/min.js';
import { arr } from '../src/typed/arr.js';
import { bool } from '../src/typed/bool.js';
import { date } from '../src/typed/date.js';
import { f32 } from '../src/typed/f32.js';
import { f64 } from '../src/typed/f64.js';
import { i16 } from '../src/typed/i16.js';
import { i32 } from '../src/typed/i32.js';
import { i8 } from '../src/typed/i8.js';
import { str } from '../src/typed/str.js';
import { u16 } from '../src/typed/u16.js';
import { u32 } from '../src/typed/u32.js';
import { u8 } from '../src/typed/u8.js';
import type { AnyNode, Control, Errors } from '../src/types.js';

/**
 * Validates one value against one typed node and hands back its error. It goes
 * through a form on purpose: that is what clones the node, and a clone that came
 * back untyped would be the interesting bug.
 */
async function judge(node: AnyNode, value: unknown): Promise<Errors | null> {
  const f = form({ v: node });
  const c = f.v as unknown as Control<unknown>;
  c.set(value);
  await f.$validate();
  return c.errors();
}

describe('a typed control is a control (§6.17)', () => {
  it('is read by calling it and carries its tag', () => {
    const qty = u8(21);
    expect(qty()).toBe(21);
    expect(qty.type).toBe('u8');

    qty.set(7);
    expect(qty()).toBe(7);
    expect(qty.dirty()).toBe(true);
  });

  it('starts empty where its type says so', () => {
    expect(u8()()).toBeNull();
    expect(i8()()).toBeNull();
    expect(u16()()).toBeNull();
    expect(i16()()).toBeNull();
    expect(u32()()).toBeNull();
    expect(i32()()).toBeNull();
    expect(f32()()).toBeNull();
    expect(f64()()).toBeNull();
    expect(date()()).toBeNull();
    expect(bool()()).toBe(false);
    expect(str()()).toBe('');
    expect(arr(str)()).toEqual([]);
  });

  it('takes the initial value it is given', () => {
    expect(u8(21)()).toBe(21);
    expect(i8(-1)()).toBe(-1);
    expect(u16(7)()).toBe(7);
    expect(i16(-7)()).toBe(-7);
    expect(u32(918_233)()).toBe(918_233);
    expect(i32(-918_233)()).toBe(-918_233);
    expect(f32(1.5)()).toBe(1.5);
    expect(f64(1.5)()).toBe(1.5);
    expect(bool(true)()).toBe(true);
    expect(str('x')()).toBe('x');
    expect(arr(str, ['a'])()).toEqual(['a']);

    const when = new Date('2026-08-16T00:00:00Z');
    expect(date(when)()).toBe(when);
  });
});

describe('the declared width is a range (§6.17)', () => {
  it('u8 refuses what does not fit, and says which type it was', async () => {
    expect(await judge(u8(), 300)).toEqual({ range: 'u8' });
    expect(await judge(u8(), -1)).toEqual({ range: 'u8' });
    expect(await judge(u8(), 1.5)).toEqual({ range: 'u8' });
    expect(await judge(u8(), 'nope')).toEqual({ range: 'u8' });
    expect(await judge(u8(), 255)).toBeNull();
    // Empty is `required`'s business, not the width's.
    expect(await judge(u8(), null)).toBeNull();
  });

  it('holds the edges of every integer width', async () => {
    expect(await judge(i8(), -128)).toBeNull();
    expect(await judge(i8(), -129)).toEqual({ range: 'i8' });
    expect(await judge(i8(), 127)).toBeNull();
    expect(await judge(u16(), 65_535)).toBeNull();
    expect(await judge(u16(), 65_536)).toEqual({ range: 'u16' });
    expect(await judge(i16(), -32_768)).toBeNull();
    expect(await judge(i16(), 32_768)).toEqual({ range: 'i16' });
    expect(await judge(u32(), 4_294_967_295)).toBeNull();
    expect(await judge(u32(), 4_294_967_296)).toEqual({ range: 'u32' });
    expect(await judge(i32(), -2_147_483_648)).toBeNull();
    expect(await judge(i32(), 2_147_483_648)).toEqual({ range: 'i32' });
  });

  it('f32 takes a decimal it cannot represent exactly, and refuses what overflows', async () => {
    // 0.1 is not a 32-bit float. Refusing it would make f32 useless for a price.
    expect(await judge(f32(), 0.1)).toBeNull();
    expect(await judge(f32(), 1e39)).toEqual({ range: 'f32' });
    expect(await judge(f32(), Number.POSITIVE_INFINITY)).toEqual({ range: 'f32' });
    expect(await judge(f32(), 'nope')).toEqual({ range: 'f32' });
    expect(await judge(f32(), null)).toBeNull();
  });

  it('f64 refuses what is not a finite number', async () => {
    expect(await judge(f64(), 1e308)).toBeNull();
    expect(await judge(f64(), Number.NaN)).toEqual({ range: 'f64' });
    expect(await judge(f64(), Number.POSITIVE_INFINITY)).toEqual({ range: 'f64' });
    expect(await judge(f64(), null)).toBeNull();
  });

  it('bool and str judge the type of the value', async () => {
    expect(await judge(bool(), true)).toBeNull();
    expect(await judge(bool(), 'true')).toEqual({ range: 'bool' });
    expect(await judge(bool(), null)).toBeNull();
    expect(await judge(str(), 'x')).toBeNull();
    expect(await judge(str(), 7)).toEqual({ range: 'str' });
    expect(await judge(str(), null)).toBeNull();
  });

  it('date refuses an invalid Date and anything that is not one', async () => {
    expect(await judge(date(), new Date('2026-08-16T00:00:00Z'))).toBeNull();
    expect(await judge(date(), new Date('nope'))).toEqual({ range: 'date' });
    expect(await judge(date(), '2026-08-16')).toEqual({ range: 'date' });
    expect(await judge(date(), null)).toBeNull();
  });
});

describe('arr (§6.18)', () => {
  it('survives being cloned into a form, tag and all', () => {
    const f = form({ qty: u8(21), tags: arr(str, ['a']) });
    expect(f.qty.type).toBe('u8');
    expect(f.tags.type).toBe('arr');
    expect(f.tags.of).toBe('str');
    expect(f.qty()).toBe(21);
  });

  it('declares its element type by its factory', () => {
    const tags = arr(str, []);
    expect(tags.type).toBe('arr');
    expect(tags.of).toBe('str');

    const counts = arr(u8, [1, 2]);
    expect(counts.of).toBe('u8');
    // A control that is not a list does not carry `of` at all.
    expect(u8().of).toBeUndefined();
  });

  it('judges every element against its element type', async () => {
    expect(await judge(arr(u8, []), [1, 2, 255])).toBeNull();
    expect(await judge(arr(u8, []), [1, 300])).toEqual({ range: 'arr', at: 1, of: 'u8' });
    expect(await judge(arr(str, []), ['a', 7])).toEqual({ range: 'arr', at: 1, of: 'str' });
    expect(await judge(arr(str, []), 'not a list')).toEqual({ range: 'arr' });
    expect(await judge(arr(str, []), null)).toBeNull();
  });
});

describe('the range goes first and cuts (§6.18)', () => {
  it('a value that does not fit never reaches the business rule', async () => {
    const business = vi.fn(min(1));
    const f = form({ qty: u8(0, [business]) });

    f.qty.set(300);
    expect(await f.$validate()).toBe(false);
    expect(f.qty.errors()).toEqual({ range: 'u8' });
    expect(business).not.toHaveBeenCalled();
  });

  it('and the business rule runs when the value does fit', async () => {
    const f = form({ qty: u8(0, [min(1)]) });

    expect(await f.$validate()).toBe(false);
    expect(f.qty.errors()).toEqual({ min: 1 });

    f.qty.set(3);
    expect(await f.$validate()).toBe(true);
    expect(f.qty.errors()).toBeNull();
  });
});
