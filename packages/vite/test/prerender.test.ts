/**
 * SDD-19 §4.4: the route pattern → prerendered file path mapping. Root is `index.html`;
 * a nested route becomes `<path>/index.html` so a static host serves it at the URL.
 */

import { describe, it, expect } from 'vitest';
import { htmlPathFor, urlForEntry } from '../src/prerender.js';

describe('htmlPathFor', () => {
  it('maps the root to index.html', () => {
    expect(htmlPathFor('/')).toBe('index.html');
  });

  it('maps a nested route to <path>/index.html', () => {
    expect(htmlPathFor('/about')).toBe('about/index.html');
    expect(htmlPathFor('/customer/new')).toBe('customer/new/index.html');
  });
});

describe('urlForEntry', () => {
  it('fills the sole param from a primitive entry', () => {
    expect(urlForEntry('/customer/:id', '42')).toEqual({ url: '/customer/42' });
  });

  it('fills params by name from an object entry', () => {
    expect(urlForEntry('/team/:org/:id', { org: 'acme', id: '7' })).toEqual({ url: '/team/acme/7' });
  });

  it('reports the first uncovered param (FUD0362 input)', () => {
    expect(urlForEntry('/team/:org/:id', { org: 'acme' })).toEqual({ missing: 'id' });
  });

  it('rejects a primitive for a multi-param pattern', () => {
    expect(urlForEntry('/team/:org/:id', 'x')).toHaveProperty('missing');
  });
});
