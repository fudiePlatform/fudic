/**
 * `packData` — `fud-data` without its keys (BUG-60 §3). The same shape and the same rows as the
 * reading end's test in `@fudic/core`: the two halves of one wire format, held to one vector.
 */
import { describe, expect, it } from 'vitest';
import { packData, type DataShape } from '../src/data-pack.js';

const shape: DataShape = {
  fields: {
    users: { list: { ref: 'Person' } },
    grid: { list: { list: 'i32' } },
    byId: { map: ['str', { ref: 'Person' }] },
    note: { opt: 'str' },
    tree: { ref: 'Node' },
    when: 'date',
    tone: { oneOf: ['info', 'warn'] },
  },
  types: {
    Person: { id: 'i32', name: 'str', active: 'bool', boss: { opt: { ref: 'Person' } } },
    Node: { label: 'str', children: { list: { ref: 'Node' } } },
  },
};

describe('packData', () => {
  it('writes every level by position, a type inside a type and a type that names itself included', () => {
    const data = {
      users: [
        { id: 1, name: 'Ana', active: true },
        { id: 2, name: 'Pepe', active: false, boss: { id: 1, name: 'Ana', active: true } },
      ],
      grid: [[1, 2], [3]],
      byId: { a: { id: 1, name: 'Ana', active: true }, b: null },
      tree: { label: 'root', children: [{ label: 'leaf', children: [] }] },
      when: new Date(1000),
      tone: 'warn',
    };
    expect(packData(shape, data)).toEqual([
      [
        [1, 'Ana', 1],
        [2, 'Pepe', 0, [1, 'Ana', 1]],
      ],
      [[1, 2], [3]],
      { a: [1, 'Ana', 1], b: null },
      null,
      ['root', [['leaf', []]]],
      1000,
      1,
    ]);
  });

  it('drops the trailing absent fields: the roots the client half does not read cost nothing', () => {
    expect(packData(shape, { users: [] })).toEqual([[]]);
    expect(packData(shape, { users: undefined, grid: [] })).toEqual([null, []]);
  });

  it('a `data` that is not there is an empty row', () => {
    expect(packData(shape, undefined)).toEqual([]);
  });

  it('an invalid date is `NaN`, which JSON writes as `null`', () => {
    expect(JSON.stringify(packData({ fields: { at: 'date' }, types: {} }, { at: new Date(Number.NaN) }))).toBe('[null]');
  });
});
