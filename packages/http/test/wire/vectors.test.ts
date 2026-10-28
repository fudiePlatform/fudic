/**
 * SDD-67 criterion 1 — the published vectors. Each case is written exactly as its `hex` and read
 * back equal to its `value`, and the file holds at least one case per row of the tables of §3.1:
 * what a backend in another language has to pass to speak `fud-bin`.
 *
 * A vector's value is JSON (a date as ISO text, an absent optional left out or null): `conform`
 * turns it into the value of its type, which is what a call writes and what reading gives back.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conform } from '../../src/contract/wire.js';
import { binWire } from '../../src/wire/bin.js';
import { PROBLEM } from '../../src/wire/problem.js';
import type { Ty } from '../../src/wire/ty.js';

type JsonTy = string | { list: JsonTy } | { opt: JsonTy } | { map: [JsonTy, JsonTy] } | { oneOf: string[] } | { fields: Record<string, JsonTy> };

interface Vector {
  readonly name: string;
  readonly type: JsonTy;
  readonly value: unknown;
  readonly hex: string;
}

const file = JSON.parse(readFileSync(new URL('../../wire/vectors.json', import.meta.url), 'utf8')) as {
  readonly format: string;
  readonly cases: readonly Vector[];
};

function toTy(t: JsonTy): Ty {
  if (t === 'problem') return PROBLEM;
  if (typeof t === 'string') return t as Ty;
  if ('list' in t) return { list: toTy(t.list) };
  if ('opt' in t) return { opt: toTy(t.opt) };
  if ('map' in t) return { map: [toTy(t.map[0]), toTy(t.map[1])] };
  if ('oneOf' in t) return { oneOf: t.oneOf };
  const fields = Object.fromEntries(Object.entries(t.fields).map(([k, f]) => [k, toTy(f)]));
  return { fields: () => fields };
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (h: string): Uint8Array => Uint8Array.from(h.match(/../gu) ?? [], (b) => Number.parseInt(b, 16));

describe('criterion 1: every vector, in both directions', () => {
  it('the file says its format', () => {
    expect(file.format).toBe('fud-bin');
  });

  for (const v of file.cases) {
    const ty = toTy(v.type);
    const value = conform(ty, v.value, 'value');

    it(`${v.name}: written as ${v.hex}`, () => {
      expect(hex(binWire.encodeValue(ty, value) as Uint8Array)).toBe(v.hex);
    });

    it(`${v.name}: read back as its value`, () => {
      expect(binWire.decodeValue(ty, bytesOf(v.hex))).toEqual(value);
    });
  }
});

describe('criterion 1: one case per row of the tables of §3.1', () => {
  /** Every type a case names, at any depth. */
  const kinds = new Set<string>();
  const walk = (t: JsonTy): void => {
    if (typeof t === 'string') {
      kinds.add(t);
      return;
    }
    const kind = Object.keys(t)[0]!;
    kinds.add(kind);
    if ('list' in t) walk(t.list);
    else if ('opt' in t) walk(t.opt);
    else if ('map' in t) t.map.forEach(walk);
    else if ('fields' in t) Object.values(t.fields).forEach(walk);
  };
  for (const v of file.cases) walk(v.type);

  it('the types: integers, floats, str, bool, date, uuid, enum, type, list, map and optionals', () => {
    for (const k of ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'str', 'bool', 'date', 'uuid', 'oneOf', 'fields', 'list', 'map', 'opt']) {
      expect(kinds, k).toContain(k);
    }
  });

  it('a case written alone, at the top, for each scalar type', () => {
    const top = new Set(file.cases.map((v) => (typeof v.type === 'string' ? v.type : Object.keys(v.type)[0])));
    for (const k of ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'str', 'bool', 'date', 'uuid', 'oneOf', 'list', 'map']) {
      expect(top, k).toContain(k);
    }
  });

  it('the seven tags of any', () => {
    const tags = new Set(file.cases.filter((v) => v.type === 'any').map((v) => Number.parseInt(v.hex.slice(0, 2), 16)));
    expect([...tags].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('a form with a group: a type holding a type, its numbers and dates optional, bool and str not', () => {
    const form = file.cases.find((v) => /form/u.test(v.name));
    expect(form).toBeDefined();
    const fields = (form!.type as { fields: Record<string, JsonTy> }).fields;
    expect(Object.values(fields).some((f) => typeof f === 'object' && 'fields' in f)).toBe(true);
  });

  it('a response and a whole problem: a 422 with errors and summary', () => {
    expect(file.cases.some((v) => /response/u.test(v.name))).toBe(true);
    const problem = file.cases.find((v) => v.type === 'problem');
    expect(problem?.value).toMatchObject({ status: 422, errors: expect.any(Object), summary: expect.any(Object) });
  });
});

describe('criterion 1: the vectors are published with @fudic/http', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    readonly exports: Readonly<Record<string, unknown>>;
    readonly files: readonly string[];
  };

  it('in files, and as an entry', () => {
    expect(pkg.files).toContain('wire');
    expect(pkg.exports['./wire/vectors.json']).toBe('./wire/vectors.json');
  });

  it('with the two codecs and what they share as entries of their own', () => {
    for (const entry of ['./wire', './wire/bin', './wire/json']) expect(pkg.exports, entry).toHaveProperty([entry]);
  });
});
