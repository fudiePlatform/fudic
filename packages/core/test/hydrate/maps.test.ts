import { describe, it, expect } from 'vitest';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { publish } from './_page.js';

describe('the three blocks the page publishes', () => {
  it('a page that hydrates nothing publishes nothing, and that is the base case', () => {
    publish();
    const maps = readPageMaps(document);
    expect(maps.tree).toEqual({});
    expect(maps.bus).toEqual({});
    expect(maps.slice(0)).toEqual([]);
  });

  it('reads the two static maps as tag → tags', () => {
    publish({ tree: { 'app-parent': ['app-child'] }, bus: { 'product-list': ['shopping-cart'] } });
    const maps = readPageMaps(document);
    expect(maps.tree).toEqual({ 'app-parent': ['app-child'] });
    expect(maps.bus).toEqual({ 'product-list': ['shopping-cart'] });
  });

  it('the id IS the index: a slice is the payload between two consecutive offsets', () => {
    publish({ state: [[0, 2, 2, 5], ['a', 'b', 1, 2, 3]] });
    const maps = readPageMaps(document);
    expect(maps.slice(0)).toEqual(['a', 'b']);
    // A claimed host whose render destructured nothing: an empty slice, and that is what it
    // means (SDD-15 §3.3).
    expect(maps.slice(1)).toEqual([]);
    expect(maps.slice(2)).toEqual([1, 2, 3]);
  });

  it('an id past the end of the payload yields an empty slice, never the whole payload', () => {
    publish({ state: [[0, 2], ['a', 'b']] });
    const maps = readPageMaps(document);
    expect(maps.slice(1)).toEqual([]); // the last offset opens nothing
    expect(maps.slice(9)).toEqual([]); // beyond the table altogether
  });

  it('an instant comes back a Date, an invalid one an invalid Date (SDD-61 §3.12)', () => {
    publish({ state: [[0, 3], [{ $d: 1793008800000 }, { $d: null }, { a: 1 }]] });
    const [at, invalid, plain] = readPageMaps(document).slice(0) as [Date, Date, object];
    expect(at).toBeInstanceOf(Date);
    expect(at.toISOString()).toBe('2026-10-26T10:00:00.000Z');
    expect(Number.isNaN(invalid.getTime())).toBe(true);
    expect(plain).toEqual({ a: 1 });
  });

  it('an instant a list or an object nests comes back a Date; a field named $d among others is data', () => {
    publish({ state: [[0, 2], [[{ titulo: 'x', creada: { $d: 1793008800000 } }], { $d: 1, n: 2 }]] });
    const [list, data] = readPageMaps(document).slice(0) as [[{ creada: Date }], object];
    expect(list[0].creada).toBeInstanceOf(Date);
    expect(list[0].creada.toISOString()).toBe('2026-10-26T10:00:00.000Z');
    expect(data).toEqual({ $d: 1, n: 2 });
  });

  it('escaped payloads survive the round trip: `JSON.parse` gives back the original', () => {
    publish({ state: [[0, 1], ['</script><b>']] });
    expect(readPageMaps(document).slice(0)).toEqual(['</script><b>']);
  });
});
