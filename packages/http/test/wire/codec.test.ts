/**
 * SDD-67 §3.6 — the two codecs behind `Wire`, `tyOfSchema` and `signature`, past what the
 * vectors fix: what a call's arguments become, what JSON revives, and the edges of the walk.
 */

import { describe, expect, it } from 'vitest';
import { arr, bool, control, date, group, str, u16, u8 } from '@fudic/forms/contract';
import type { Schema } from '@fudic/forms';
import { HttpError, type Problem } from '../../src/errors.js';
import { binWire } from '../../src/wire/bin.js';
import * as wire from '../../src/wire/index.js';
import { jsonWire } from '../../src/wire/json.js';
import { formTypes, tyOfSchema } from '../../src/wire/schema.js';
import type { Ty } from '../../src/wire/ty.js';

const text = new TextEncoder();
const utf8 = (s: string): Uint8Array => text.encode(s);
const bytes = (v: Uint8Array | string | undefined): number[] => [...(v as Uint8Array)];

describe('binWire', () => {
  it('names its format and its content types', () => {
    expect(binWire.name).toBe('fud-bin');
    expect(binWire.type).toBe('application/fud+bin');
    expect(binWire.problemType).toBe('application/problem+fud');
  });

  it('a call without body arguments has no body', () => {
    expect(binWire.encodeArgs({}, { anything: 1 })).toBeUndefined();
  });

  it('the arguments are one level, in the order of their types, whatever the order of the object', () => {
    const types: Record<string, Ty> = { id: 'u8', active: 'bool', note: { opt: 'str' } };
    const body = binWire.encodeArgs(types, { note: 'x', active: true, id: 7 });
    expect(bytes(body)).toEqual([0, 1, 7, 1, 0x78]);
    expect(binWire.decodeArgs(types, body as Uint8Array)).toEqual({ id: 7, active: true, note: 'x' });
  });

  it('criterion 5: one bool argument is one byte', () => {
    expect(bytes(binWire.encodeArgs({ active: 'bool' }, { active: false }))).toEqual([0]);
  });

  it('an absent optional argument reads back as null: a form needs every key', () => {
    expect(binWire.decodeArgs({ a: { opt: 'u8' } }, Uint8Array.from([1]))).toEqual({ a: null });
    expect(binWire.decodeArgs({ a: { opt: 'u8' } }, binWire.encodeArgs({ a: { opt: 'u8' } }, {}) as Uint8Array)).toEqual({ a: null });
  });

  it('an absent optional value reads back as an absent key', () => {
    const ty: Ty = { fields: () => ({ a: { opt: 'u8' }, b: 'u8' }) };
    expect(binWire.decodeValue(ty, binWire.encodeValue(ty, { b: 1 }) as Uint8Array)).toStrictEqual({ b: 1 });
  });

  it('html travels as text, a uuid in any case comes back lowercase', () => {
    expect(binWire.decodeValue('html', binWire.encodeValue('html', '<i>') as Uint8Array)).toBe('<i>');
    const id = '7F3A0C2E-1B4D-4E5F-8A9B-0C1D2E3F4A5B';
    expect(binWire.decodeValue('uuid', binWire.encodeValue('uuid', id) as Uint8Array)).toBe(id.toLowerCase());
  });

  it('a long value grows the buffer it is written to', () => {
    const long = 'x'.repeat(1_000);
    expect(binWire.decodeValue('str', binWire.encodeValue('str', long) as Uint8Array)).toBe(long);
  });

  it('a type may name itself', () => {
    const node: Ty = { fields: () => ({ v: 'u8', next: { opt: node } }) };
    const chain = { v: 1, next: { v: 2, next: { v: 3 } } };
    expect(binWire.decodeValue(node, binWire.encodeValue(node, chain) as Uint8Array)).toEqual(chain);
  });

  it('the keys of a map are written as their type and read back as text', () => {
    const ty: Ty = { map: ['date', 'bool'] };
    const at = new Date(0).toISOString();
    const body = binWire.encodeValue(ty, { [at]: true }) as Uint8Array;
    expect(body.length).toBe(1 + 6 + 1);
    expect(binWire.decodeValue(ty, body)).toEqual({ [at]: true });
  });

  it('any: an undefined element is written as null, an undefined key is left out', () => {
    const round = (v: unknown): unknown => binWire.decodeValue('any', binWire.encodeValue('any', v) as Uint8Array);
    expect(round([1, undefined])).toEqual([1, null]);
    expect(round({ a: 1, b: undefined })).toStrictEqual({ a: 1 });
    expect(round({ nested: [{ pattern: '^a' }, true, null] })).toEqual({ nested: [{ pattern: '^a' }, true, null] });
  });

  it('a problem goes and comes back whole', () => {
    const problem: Problem = { status: 302, title: 'Found', detail: 'moved', location: '/next' };
    expect(binWire.decodeProblem(binWire.encodeProblem(problem) as Uint8Array)).toStrictEqual(problem);
    const bare: Problem = { status: 404, title: 'Not Found' };
    expect(binWire.decodeProblem(binWire.encodeProblem(bare) as Uint8Array)).toStrictEqual(bare);
  });
});

describe('jsonWire', () => {
  it('names its format and its content types', () => {
    expect(jsonWire.name).toBe('json');
    expect(jsonWire.type).toBe('application/json');
    expect(jsonWire.problemType).toBe('application/problem+json');
  });

  it('the arguments, with their keys; only the declared ones; none, no body', () => {
    expect(jsonWire.encodeArgs({ active: 'bool', id: 'u8' }, { id: 7, active: false, extra: 1 })).toBe('{"active":false,"id":7}');
    expect(jsonWire.encodeArgs({}, { a: 1 })).toBeUndefined();
  });

  it('reading revives a date wherever the type has one', () => {
    const iso = '2020-01-01T00:00:00.000Z';
    const d = new Date(iso);
    const types: Record<string, Ty> = {
      at: 'date',
      maybe: { opt: 'date' },
      days: { list: 'date' },
      byKey: { map: ['str', 'date'] },
      row: { fields: () => ({ when: 'date', s: 'str' }) },
      colour: { oneOf: ['red'] },
      n: 'u8',
    };
    const body = utf8(JSON.stringify({ at: iso, maybe: iso, days: [iso], byKey: { k: iso }, row: { when: iso, s: iso }, colour: 'red', n: 1, extra: iso }));
    expect(jsonWire.decodeArgs(types, body)).toEqual({
      at: d,
      maybe: d,
      days: [d],
      byKey: { k: d },
      row: { when: d, s: iso },
      colour: 'red',
      n: 1,
      extra: iso,
    });
  });

  it('what has no shape of its type is left as it came, for conform to judge', () => {
    const types: Record<string, Ty> = { at: 'date', days: { list: 'date' }, row: { fields: () => ({ when: 'date' }) }, m: { map: ['str', 'date'] } };
    expect(jsonWire.decodeArgs(types, utf8('{"at":3,"days":"x","row":[1],"m":null}'))).toEqual({ at: 3, days: 'x', row: [1], m: null });
  });

  it('a body that is not an object is no arguments; one that is not JSON, a 400', () => {
    expect(jsonWire.decodeArgs({ a: 'u8' }, utf8('[1]'))).toEqual({});
    let caught: unknown;
    try {
      jsonWire.decodeArgs({ a: 'u8' }, utf8('{'));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpError).problem).toMatchObject({ status: 400, detail: 'the body is not valid JSON' });
  });

  it('criterion 4: a date value comes back a Date in JSON too', () => {
    const at = new Date('1969-07-20T20:17:00.000Z');
    const back = jsonWire.decodeValue('date', utf8(jsonWire.encodeValue('date', at) as string));
    expect(back).toBeInstanceOf(Date);
    expect((back as Date).getTime()).toBe(at.getTime());
  });

  it('a value that is not of its type is a 400', () => {
    expect(() => jsonWire.decodeValue('u8', utf8('300'))).toThrow(HttpError);
  });

  it('a problem goes and comes back as JSON', () => {
    const problem: Problem = { status: 422, title: 'Unprocessable Content', errors: { age: { min: 18 } }, summary: null };
    const body = jsonWire.encodeProblem(problem);
    expect(JSON.parse(body as string)).toEqual(problem);
    expect(jsonWire.decodeProblem(utf8(body as string))).toEqual(problem);
  });
});

describe('tyOfSchema (§3.1, a form)', () => {
  it('numbers, dates and arrs are optional; bool and str are not; an arr of T is T[]; a group is a type', () => {
    const schema: Schema = { n: u8(), at: date(), list: arr(u16, []), ok: bool(), s: str(), g: group({ x: u8() }) };
    const ty = tyOfSchema(schema) as { fields: () => Record<string, Ty> };
    const fields = ty.fields();
    expect(fields).toMatchObject({
      n: { opt: 'u8' },
      at: { opt: 'date' },
      list: { opt: { list: 'u16' } },
      ok: 'bool',
      s: 'str',
    });
    expect((fields.g as { fields: () => Record<string, Ty> }).fields()).toEqual({ x: { opt: 'u8' } });
    expect(Object.keys(formTypes(schema))).toEqual(Object.keys(fields));
  });

  it('a control with no type cannot travel', () => {
    expect(() => tyOfSchema({ c: control('') })).toThrow(new TypeError('control "c" declares no type: a form travels by the types of its controls'));
  });
});

describe('signature (§3.3)', () => {
  it('FNV-1a of 32 bits, as 8 lowercase hex digits', () => {
    // The reference values of FNV-1a 32.
    expect(wire.signature('')).toBe('811c9dc5');
    expect(wire.signature('a')).toBe('e40c292c');
    expect(wire.signature('foobar')).toBe('bf9cf968');
  });

  it('over the UTF-8 bytes of the text', () => {
    expect(wire.signature('ñ')).not.toBe(wire.signature('n'));
    expect(wire.signature('route()|query()|body()|->')).toMatch(/^[0-9a-f]{8}$/u);
  });
});

describe('@fudic/http/wire', () => {
  it('shares tyOfSchema, formTypes and signature, and neither codec', () => {
    expect(Object.keys(wire).sort()).toEqual(['formTypes', 'signature', 'tyOfSchema']);
  });
});
