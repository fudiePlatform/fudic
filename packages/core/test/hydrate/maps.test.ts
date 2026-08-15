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

  it('escaped payloads survive the round trip: `JSON.parse` gives back the original', () => {
    publish({ state: [[0, 1], ['</script><b>']] });
    expect(readPageMaps(document).slice(0)).toEqual(['</script><b>']);
  });
});
