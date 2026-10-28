/**
 * SDD-56 §4.18 and criteria 44, 45 and 47 — the binary format of a typed form — moved with the
 * codec (SDD-67 criterion 2): a form is one more level of `fud-bin`, and every expected byte
 * below is the one SDD-56 measured, untouched.
 *
 * Every assertion that something survives is a round trip through `binWire.encodeArgs` and
 * `binWire.decodeArgs` over the form's controls, the one walk in two directions. The values
 * are written positionally, as SDD-56 wrote them; `writeBinary` and `readBinary` turn them into
 * the keyed arguments of a call and back. The sizes are asserted to the byte, because the format
 * IS its layout: null map, bit field of the bools, values, groups in line.
 */

import { describe, expect, it } from 'vitest';
import { arr, bool, date, f32, f64, group, i16, i32, i8, str, u16, u32, u8 } from '@fudic/forms/contract';
import type { Schema } from '@fudic/forms';
import { HttpError } from '../../src/errors.js';
import { binWire } from '../../src/wire/bin.js';
import { formTypes, tyOfSchema } from '../../src/wire/schema.js';

const isGroup = (schema: Schema, k: string): Schema | undefined => {
  const node = schema[k]!;
  return '$schema' in node ? (node.$schema as Schema) : undefined;
};

/** Positional values as the keyed arguments of a call, groups included. */
const keyed = (schema: Schema, values: readonly unknown[]): Record<string, unknown> =>
  Object.fromEntries(
    Object.keys(schema).map((k, i) => {
      const inner = isGroup(schema, k);
      return [k, inner === undefined ? values[i] : keyed(inner, values[i] as unknown[])];
    }),
  );

const positional = (schema: Schema, record: Readonly<Record<string, unknown>>): unknown[] =>
  Object.keys(schema).map((k) => {
    const inner = isGroup(schema, k);
    return inner === undefined ? record[k] : positional(inner, record[k] as Record<string, unknown>);
  });

const writeBinary = (schema: Schema, value: readonly unknown[]): Uint8Array =>
  binWire.encodeArgs(formTypes(schema), keyed(schema, value)) as Uint8Array;
const readBinary = (schema: Schema, body: Uint8Array): unknown[] =>
  positional(schema, binWire.decodeArgs(formTypes(schema), body));

const round = (schema: Schema, value: readonly unknown[]) => readBinary(schema, writeBinary(schema, value));
const size = (schema: Schema, value: readonly unknown[]) => writeBinary(schema, value).length;

describe('criterion 44: every type survives, at the ends of its range', () => {
  const cases: [string, () => Schema, readonly unknown[], number][] = [
    ['u8', () => ({ v: u8() }), [0, 255], 1],
    ['i8', () => ({ v: i8() }), [-128, 127, 0, -1], 1],
    ['u16', () => ({ v: u16() }), [0, 65_535], 2],
    ['i16', () => ({ v: i16() }), [-32_768, 32_767], 2],
    ['u32', () => ({ v: u32() }), [0, 4_294_967_295], 4],
    ['i32', () => ({ v: i32() }), [-2_147_483_648, 2_147_483_647], 4],
    ['f32', () => ({ v: f32() }), [0, 1.5, -3.25, 3.4028234663852886e38, -3.4028234663852886e38], 4],
    ['f64', () => ({ v: f64() }), [0, Math.PI, -Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER], 8],
  ];

  for (const [tag, schema, values, width] of cases) {
    it(`${tag}: ${width} bytes after a 1-byte null map, little-endian`, () => {
      for (const v of values) {
        expect(round(schema(), [v])).toEqual([v]);
        expect(size(schema(), [v])).toBe(1 + width);
      }
    });

    it(`${tag}: null is one bit and nothing else`, () => {
      expect(round(schema(), [null])).toEqual([null]);
      expect(size(schema(), [null])).toBe(1);
    });
  }

  it('little-endian, two complement for the signed ones', () => {
    expect([...writeBinary({ v: u16() }, [0x0102] as never)]).toEqual([0, 0x02, 0x01]);
    expect([...writeBinary({ v: i8() }, [-1] as never)]).toEqual([0, 0xff]);
    expect([...writeBinary({ v: i16() }, [-2] as never)]).toEqual([0, 0xfe, 0xff]);
  });

  it('date: 6 bytes, signed 48 bits, before 1970 too', () => {
    const schema = { v: date() };
    for (const d of [new Date(0), new Date('1969-07-20T20:17:00Z'), new Date('1492-10-12T00:00:00Z'), new Date('2999-12-31T23:59:59.999Z'), new Date(-1)]) {
      const [back] = round(schema, [d]) as [Date];
      expect(back).toBeInstanceOf(Date);
      expect(back.getTime()).toBe(d.getTime());
      expect(size(schema, [d])).toBe(1 + 6);
    }
  });

  it('date: the ends of 48 bits', () => {
    const schema = { v: date() };
    for (const ms of [2 ** 47 - 1, -(2 ** 47) + 1]) {
      const [back] = round(schema, [new Date(ms)]) as [Date];
      expect(back.getTime()).toBe(ms);
    }
  });

  it('str: varint length of its UTF-8 bytes, then the bytes', () => {
    const schema = { v: str() };
    expect([...writeBinary(schema, ['ab'] as never)]).toEqual([2, 0x61, 0x62]);
    expect(round(schema, [''])).toEqual(['']);
    expect(size(schema, [''])).toBe(1);
    // Outside the basic plane: 4 bytes of UTF-8, two UTF-16 units.
    const astral = 'ñ😀𝄞';
    expect(round(schema, [astral])).toEqual([astral]);
    expect(size(schema, [astral])).toBe(1 + 2 + 4 + 4);
  });

  it('str: a length of 128 or more takes a two-byte varint', () => {
    const schema = { v: str() };
    for (const n of [127, 128, 300, 16_384]) {
      const s = 'x'.repeat(n);
      expect(round(schema, [s])).toEqual([s]);
      expect(size(schema, [s])).toBe(n + (n < 128 ? 1 : n < 16_384 ? 2 : 3));
    }
  });

  it('arr: count as a varint, then each element at its width', () => {
    const schema = { v: arr(u16, []) };
    expect(round(schema, [[1, 2, 65_535]])).toEqual([[1, 2, 65_535]]);
    expect(size(schema, [[1, 2, 3]])).toBe(1 + 1 + 3 * 2);
    expect(round(schema, [[]])).toEqual([[]]);
    expect(round(schema, [null])).toEqual([null]);
  });

  it('arr of str, of date, of f64 and of i8', () => {
    expect(round({ v: arr(str, []) }, [['web', '', 'compilador']])).toEqual([['web', '', 'compilador']]);
    const days = [new Date(-86_400_000), new Date(0)];
    const [back] = round({ v: arr(date, []) }, [days]) as [Date[]];
    expect(back.map((d) => d.getTime())).toEqual(days.map((d) => d.getTime()));
    expect(round({ v: arr(f64, []) }, [[0.1, -2]])).toEqual([[0.1, -2]]);
    expect(round({ v: arr(i8, []) }, [[-128, 127]])).toEqual([[-128, 127]]);
  });

  it('arr of bool: packed 8 to a byte', () => {
    const schema = { v: arr(bool, []) };
    const nine = [true, false, false, false, false, false, false, true, true];
    expect(round(schema, [nine])).toEqual([nine]);
    expect(size(schema, [nine])).toBe(1 + 1 + 2);
    expect(size(schema, [[true]])).toBe(1 + 1 + 1);
  });

  it('bool: no null map entry, a bit each', () => {
    const schema = { a: bool(), b: bool() };
    expect(round(schema, [true, false])).toEqual([true, false]);
    expect([...writeBinary(schema, [false, true] as never)]).toEqual([0b10]);
  });

  it('a group is its own level, in line, in its position', () => {
    const schema = { a: u8(), g: group({ x: u16(), y: bool(), z: str() }), b: bool() };
    const value = [7, [300, true, 'hi'], false];
    expect(round(schema, value)).toEqual(value);
    // outer: null map 1 + bools 1 + a 1; group: null map 1 + bools 1 + x 2 + z 1+2.
    expect(size(schema, value)).toBe(3 + 1 + 1 + 2 + 3);
  });

  it('a group with a null control', () => {
    const schema = { g: group({ x: u16(), d: date() }) };
    expect(round(schema, [[null, null]])).toEqual([[null, null]]);
  });
});

describe('criterion 45: the bits', () => {
  it('9 bools take 2 bytes, and the ninth reads back', () => {
    const schema = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`b${i}`, bool()])) as Schema;
    const value = [false, false, false, false, false, false, false, false, true];
    expect(size(schema, value)).toBe(2);
    expect(round(schema, value)).toEqual(value);
    expect([...writeBinary(schema, value as never)]).toEqual([0, 1]);
  });

  it('8 bools take 1 byte', () => {
    const schema = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`b${i}`, bool()])) as Schema;
    expect(size(schema, Array(8).fill(true))).toBe(1);
  });

  it('a level with 3 nullable controls pays 1 byte of null map; one with none, 0', () => {
    const three = { a: u8(), b: date(), c: arr(u8, []) };
    expect(size(three, [null, null, null])).toBe(1);
    expect([...writeBinary(three, [null, null, null] as never)]).toEqual([0b111]);
    const none = { s: str(), t: bool() };
    expect(size(none, ['', false])).toBe(1 + 1);
    expect([...writeBinary(none, ['', true] as never)]).toEqual([1, 0]);
  });

  it('9 nullable controls pay 2 bytes, and the ninth null reads back', () => {
    const schema = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`n${i}`, u8()])) as Schema;
    const value = [1, 2, 3, 4, 5, 6, 7, 8, null];
    expect(round(schema, value)).toEqual(value);
    expect(size(schema, value)).toBe(2 + 8);
  });
});

/** The order line of SDD-forms-typed-binary §2, field by field, as it was measured. */
const measuredLine = {
  itemId: u32(),
  qty: u16(),
  priceCts: u32(),
  vatPct: u8(),
  discount: u8(),
  takeaway: bool(),
  invited: bool(),
  printed: bool(),
  table: u16(),
  at: date(),
};
const lineValue = [918_233, 3, 1_450, 21, 0, true, false, true, 7, new Date('2026-10-13T12:00:00Z')];

describe('criterion 47: the measurement', () => {
  it('the order line: 21 B measured, plus its 1-byte null map (7 nullable controls)', () => {
    const bytes = size(measuredLine, lineValue);
    console.log(`order line: ${bytes} B (measured 21 B + 1 B null map)`);
    expect(bytes).toBe(21 + 1);
    expect(round(measuredLine, lineValue)).toEqual(lineValue);
  });

  it('the 50-line ticket: 1 051 B measured, plus one null map per line', () => {
    // The measurement wrote 50 lines after a varint count. A form has no list of groups, so
    // the ticket here is 50 line groups in line: no count (−1 B), one null map each (+50 B).
    const ticket = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`l${String(i).padStart(2, '0')}`, group(measuredLine)]),
    ) as Schema;
    const value = Array.from({ length: 50 }, () => lineValue);
    const bytes = size(ticket, value);
    console.log(`50-line ticket: ${bytes} B (measured 1 051 B − 1 B count + 50 B null maps)`);
    expect(bytes).toBe(1_051 - 1 + 50);
    expect(round(ticket, value)).toEqual(value);
  });
});


describe('a form is a type: tyOfSchema writes the same bytes as its controls', () => {
  it('a form as a single value of its type is the level of its controls, byte for byte', () => {
    const schema = { a: u8(), g: group({ x: u16(), y: bool(), z: str() }), b: bool() };
    const value = [7, [300, true, 'hi'], false];
    const asValue = binWire.encodeValue(tyOfSchema(schema), keyed(schema, value)) as Uint8Array;
    expect([...asValue]).toEqual([...writeBinary(schema, value)]);
  });
});

describe('decodeArgs refuses a body that is not its schema: a 400', () => {
  const refused = (fn: () => unknown, detail?: string): void => {
    let caught: unknown;
    try {
      fn();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpError);
    const problem = (caught as HttpError).problem;
    expect(problem.status).toBe(400);
    if (detail !== undefined) expect(problem.detail).toBe(detail);
    else expect(problem.detail).toMatch(/^binary body: /u);
  };

  it('shorter', () => {
    refused(() => readBinary({ a: u32() }, new Uint8Array([0, 1, 2])), 'binary body: shorter than its schema');
    refused(() => readBinary({ s: str() }, new Uint8Array([5, 0x61])));
    refused(() => readBinary({ s: str() }, new Uint8Array([0x80])));
  });

  it('longer', () => {
    refused(() => readBinary({ a: u8() }, new Uint8Array([0, 1, 2])), 'binary body: longer than its schema');
  });

  it('reads from a view that does not start at offset 0', () => {
    const backing = new Uint8Array([9, 9, 0, 7, 9]);
    expect(readBinary({ a: u8() }, backing.subarray(2, 4))).toEqual([7]);
  });
});
