/**
 * `unpackData` — `fud-data` read back by its shape (BUG-60 §3). The same shape and the same rows
 * as the writing end's test in `@fudic/ssr`: the two halves of one wire format, held to one vector.
 */
import { describe, expect, it } from 'vitest';
import { unpackData, type DataShape } from '../../src/hydrate/data.js';

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

describe('unpackData', () => {
  it('reads every level back by position, with the names, the bools, the enum and the date', () => {
    const raw = [
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
    ];
    expect(unpackData(shape, raw)).toEqual({
      users: [
        { id: 1, name: 'Ana', active: true },
        { id: 2, name: 'Pepe', active: false, boss: { id: 1, name: 'Ana', active: true } },
      ],
      grid: [[1, 2], [3]],
      byId: { a: { id: 1, name: 'Ana', active: true } },
      tree: { label: 'root', children: [{ label: 'leaf', children: [] }] },
      when: new Date(1000),
      tone: 'warn',
    });
  });

  it('an absent field is no key at all, and a short row ends in absent fields', () => {
    const data = unpackData(shape, [[], null, { a: [1, 'Ana', 1] }]);
    expect(data).toEqual({ users: [], byId: { a: { id: 1, name: 'Ana', active: true } } });
    expect('grid' in data).toBe(false);
  });

  it('a page that published no block hands over `{}`, and every field is absent', () => {
    expect(unpackData(shape, {})).toEqual({});
  });
});
