/**
 * SDD-67 criterion 3 and §4.2 — reading never trusts the body. Whatever does not hold is a 400
 * whose `detail` starts with `binary body:`, and nothing is set aside for a length before the
 * bytes behind it exist. Whether the handler runs is the server's part (phase 2): here, the
 * codec answers a 400 for every broken body, through each of its doors.
 */

import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/errors.js';
import { binWire } from '../../src/wire/bin.js';
import type { Ty } from '../../src/wire/ty.js';

/** The 400 `fn` throws, with its `detail`. */
function detailOf(fn: () => unknown): string | undefined {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(HttpError);
  expect((caught as HttpError).status).toBe(400);
  return (caught as HttpError).problem.detail;
}

const PERSON: Ty = { fields: () => ({ id: 'uuid', name: 'str', born: { opt: 'date' } }) };
const people = binWire.encodeValue({ list: PERSON }, [{ id: '7f3a0c2e-1b4d-4e5f-8a9b-0c1d2e3f4a5b', name: 'ana' }]) as Uint8Array;
const value = (ty: Ty, bytes: readonly number[]) => (): unknown => binWire.decodeValue(ty, Uint8Array.from(bytes));

describe('criterion 3: the five hostile bodies', () => {
  it('truncated', () => {
    expect(detailOf(() => binWire.decodeValue({ list: PERSON }, people.subarray(0, people.length - 1)))).toBe(
      'binary body: shorter than its schema',
    );
  });

  it('with bytes to spare', () => {
    expect(detailOf(() => binWire.decodeValue({ list: PERSON }, Uint8Array.from([...people, 0])))).toBe(
      'binary body: longer than its schema',
    );
  });

  it('a str that says it measures 2^32 bytes', () => {
    // 2^32 as a varint: four bytes of 7 zero bits with their continuation bit, then 0x10.
    expect(detailOf(value('str', [0x80, 0x80, 0x80, 0x80, 0x10, 0x61, 0x62]))).toBe('binary body: shorter than its schema');
  });

  it('an enum with index 9 of 3', () => {
    expect(detailOf(value({ oneOf: ['a', 'b', 'c'] }, [9]))).toBe('binary body: enum index 9 of 3');
  });

  it('an any with tag 7', () => {
    expect(detailOf(value('any', [7]))).toBe('binary body: an any with tag 7');
  });

  it('the same, as the arguments of a call and as a problem', () => {
    expect(detailOf(() => binWire.decodeArgs({ q: 'str' }, Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x10])))).toMatch(/^binary body: /u);
    expect(detailOf(() => binWire.decodeArgs({ c: { oneOf: ['a', 'b', 'c'] } }, Uint8Array.from([9])))).toBe('binary body: enum index 9 of 3');
    expect(detailOf(() => binWire.decodeProblem(Uint8Array.from([0, 0x94])))).toMatch(/^binary body: /u);
    // A problem whose summary holds an any with tag 7: null map (only summary present), status,
    // empty title, a map of one entry, its key, then the tag.
    expect(detailOf(() => binWire.decodeProblem(Uint8Array.from([0b0111, 0x94, 0x01, 0, 1, 1, 0x6b, 7])))).toBe(
      'binary body: an any with tag 7',
    );
  });
});

describe('§4.2: the rest of what reading refuses', () => {
  it('a str that is not UTF-8', () => {
    expect(detailOf(value('str', [2, 0xc3, 0x28]))).toBe('binary body: a str that is not UTF-8');
  });

  it('a varint longer than 8 bytes', () => {
    expect(detailOf(value({ list: 'u8' }, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]))).toBe(
      'binary body: a varint longer than 8 bytes',
    );
  });

  it('an empty body where a value was due', () => {
    expect(detailOf(value('u8', []))).toBe('binary body: shorter than its schema');
  });

  // A count is held to what is left before anything is made for it: a list of a million
  // elements in a three-byte body is refused, not allocated.
  it('a list longer than the bits that are left', () => {
    expect(detailOf(value({ list: 'bool' }, [0xc0, 0x84, 0x3d]))).toBe('binary body: a count longer than what is left');
  });

  it('a list of empty types is held to one bit each', () => {
    const empty: Ty = { fields: () => ({}) };
    expect(detailOf(value({ list: empty }, [9]))).toBe('binary body: a count longer than what is left');
    expect(binWire.decodeValue({ list: empty }, Uint8Array.from([0]))).toEqual([]);
  });

  it('a map longer than two bits an entry', () => {
    expect(detailOf(value({ map: ['bool', 'bool'] }, [5, 0]))).toBe('binary body: a count longer than what is left');
  });

  it('an any list or object longer than what is left', () => {
    expect(detailOf(value('any', [5, 2, 0]))).toBe('binary body: a count longer than what is left');
    expect(detailOf(value('any', [6, 1, 0]))).toBe('binary body: a count longer than what is left');
  });

  it('a value that reads whole but is not of its type', () => {
    // A date past 48 bits cannot be written, but its six bytes can be read: conform refuses it.
    expect(detailOf(value('date', [0, 0, 0, 0, 0, 0x80]))).toBe('value is not a valid date');
  });
});
