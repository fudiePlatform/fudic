/**
 * SDD-56 §4.18 and criteria 44, 45 and 47 — the binary format of a typed form.
 *
 * Every assertion that something survives is a round trip through `writeBinary` and
 * `readBinary`, the one walk in two directions. The sizes are asserted to the byte, because
 * the format IS its layout: null map, bit field of the bools, values, groups in line.
 */

import { describe, expect, it } from 'vitest';
import { control } from '../../src/control.js';
import { form } from '../../src/form.js';
import { group } from '../../src/group.js';
import { arr } from '../../src/typed/arr.js';
import { bool } from '../../src/typed/bool.js';
import { date } from '../../src/typed/date.js';
import { f32 } from '../../src/typed/f32.js';
import { f64 } from '../../src/typed/f64.js';
import { i16 } from '../../src/typed/i16.js';
import { i32 } from '../../src/typed/i32.js';
import { i8 } from '../../src/typed/i8.js';
import { str } from '../../src/typed/str.js';
import { u16 } from '../../src/typed/u16.js';
import { u32 } from '../../src/typed/u32.js';
import { u8 } from '../../src/typed/u8.js';
import { isTyped, readBinary, representable, reviveJson, writeBinary } from '../../src/wire/index.js';
import type { Schema } from '../../src/types.js';

const round = (schema: Schema, value: readonly unknown[]) => readBinary(schema, writeBinary(schema, value as never));
const size = (schema: Schema, value: readonly unknown[]) => writeBinary(schema, value as never).length;

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

describe('isTyped', () => {
  it('every control declares its type, groups included', () => {
    expect(isTyped(measuredLine)).toBe(true);
    expect(isTyped({ a: u8(), g: group({ b: str() }) })).toBe(true);
    expect(isTyped({})).toBe(true);
  });

  it('one control without a type, at any depth, is enough to say no', () => {
    expect(isTyped({ a: u8(), b: control('') })).toBe(false);
    expect(isTyped({ g: group({ b: str(), c: control(0) }) })).toBe(false);
  });

  it('a form built from the schema keeps the tags, so its $schema is typed', () => {
    expect(isTyped(form(measuredLine).$schema)).toBe(true);
  });
});

describe('representable', () => {
  it('a value the format holds', () => {
    expect(representable(measuredLine, lineValue)).toBe(true);
    expect(representable(measuredLine, [null, null, null, null, null, true, true, true, null, null])).toBe(true);
  });

  it('a null in a tag that does not admit one: str and bool', () => {
    expect(representable({ s: str() }, [null])).toBe(false);
    expect(representable({ b: bool() }, [null])).toBe(false);
  });

  it('a null inside an arr', () => {
    expect(representable({ v: arr(u8, []) }, [[1, null]])).toBe(false);
    expect(representable({ v: arr(u8, []) }, [[1, 2]])).toBe(true);
  });

  it('a date outside 48 bits, alone or inside an arr of dates', () => {
    const far = new Date(8.64e15);
    expect(representable({ d: date() }, [far])).toBe(false);
    expect(representable({ d: arr(date, []) }, [[new Date(0), far]])).toBe(false);
    expect(representable({ d: arr(date, []) }, [[new Date(0)]])).toBe(true);
    expect(representable({ d: date() }, [new Date(2 ** 47)])).toBe(false);
  });

  it('inside a group too', () => {
    expect(representable({ g: group({ s: str() }) }, [[null]])).toBe(false);
    expect(representable({ g: group({ s: str() }) }, [['x']])).toBe(true);
  });
});

describe('readBinary refuses a body that is not its schema', () => {
  it('shorter: RangeError', () => {
    expect(() => readBinary({ a: u32() }, new Uint8Array([0, 1, 2]))).toThrow(
      new RangeError('binary body: shorter than its schema'),
    );
    expect(() => readBinary({ s: str() }, new Uint8Array([5, 0x61]))).toThrow(RangeError);
    expect(() => readBinary({ s: str() }, new Uint8Array([0x80]))).toThrow(RangeError);
  });

  it('longer: RangeError', () => {
    expect(() => readBinary({ a: u8() }, new Uint8Array([0, 1, 2]))).toThrow(
      new RangeError('binary body: longer than its schema'),
    );
  });

  it('reads from a view that does not start at offset 0', () => {
    const backing = new Uint8Array([9, 9, 0, 7, 9]);
    expect(readBinary({ a: u8() }, backing.subarray(2, 4))).toEqual([7]);
  });
});

describe('reviveJson', () => {
  it('a date that travelled as a string comes back a Date, in an arr of dates too', () => {
    const schema = { d: date(), list: arr(date, []), s: str(), g: group({ when: date() }) };
    const iso = '1969-07-20T20:17:00.000Z';
    const back = reviveJson(schema, [iso, [iso], iso, [iso]]) as [Date, Date[], string, [Date]];
    expect(back[0]).toEqual(new Date(iso));
    expect(back[1][0]).toEqual(new Date(iso));
    expect(back[2]).toBe(iso);
    expect(back[3][0]).toEqual(new Date(iso));
  });

  it('null dates and untyped controls stay as they came', () => {
    const schema = { d: date(), c: control(''), list: arr(date, []), n: arr(u8, []) };
    expect(reviveJson(schema, [null, 'x', null, [1]])).toEqual([null, 'x', null, [1]]);
  });

  it('with keys: each key with a node in the schema is revived, groups recursively', () => {
    const schema = { d: date(), list: arr(date, []), g: group({ when: date(), s: str() }) };
    const iso = '2020-01-01T00:00:00.000Z';
    expect(reviveJson(schema, { d: iso, list: [iso], g: { when: iso, s: iso } })).toEqual({
      d: new Date(iso),
      list: [new Date(iso)],
      g: { when: new Date(iso), s: iso },
    });
  });

  it('with keys: a key the schema does not know is left as it came', () => {
    expect(reviveJson({ d: date() }, { d: null, extra: '2020-01-01' })).toEqual({ d: null, extra: '2020-01-01' });
  });

  it('what has no shape of the schema at all is returned untouched', () => {
    const schema = { d: date() };
    const short: unknown[] = [];
    expect(reviveJson(schema, short)).toBe(short);
    expect(reviveJson(schema, null)).toBeNull();
    expect(reviveJson(schema, 'x')).toBe('x');
    expect(reviveJson(schema, 3)).toBe(3);
    // A group whose value is not a level is left for `$set` to refuse.
    expect(reviveJson({ g: group({ d: date() }) }, { g: 'nope' })).toEqual({ g: 'nope' });
  });
});
