/**
 * SDD-19 §4.4: the route pattern → prerendered file path mapping. Root is `index.html`;
 * a nested route becomes `<path>/index.html` so a static host serves it at the URL.
 */

import { describe, it, expect } from 'vitest';
import { htmlPathFor } from '../src/prerender.js';

describe('htmlPathFor', () => {
  it('maps the root to index.html', () => {
    expect(htmlPathFor('/')).toBe('index.html');
  });

  it('maps a nested route to <path>/index.html', () => {
    expect(htmlPathFor('/about')).toBe('about/index.html');
    expect(htmlPathFor('/customer/new')).toBe('customer/new/index.html');
  });
});
