/**
 * SDD-19 §4.4: the route pattern → prerendered file path mapping. Root is `index.html`;
 * a nested route becomes `<path>/index.html` so a static host serves it at the URL.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { htmlPathFor, materializeBundle, urlForEntry, type BundleItem } from '../src/prerender.js';

describe('htmlPathFor', () => {
  it('maps the root to index.html', () => {
    expect(htmlPathFor('/')).toBe('index.html');
  });

  it('maps a nested route to <path>/index.html', () => {
    expect(htmlPathFor('/about')).toBe('about/index.html');
    expect(htmlPathFor('/customer/new')).toBe('customer/new/index.html');
  });
});

describe('materializeBundle', () => {
  it('BUG-05 §4.5 writes a chunk’s map beside it, so a prerender stack is readable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-materialize-'));
    const bundle: Record<string, BundleItem> = {
      'c/page.js': { type: 'chunk', code: 'export const x = 1;', map: { version: 3, sources: ['a.fud'] } },
      'plain.js': { type: 'chunk', code: 'export const y = 2;' },
      'data.json': { type: 'asset', source: '{}' },
    };
    materializeBundle(bundle, dir);

    expect(readFileSync(join(dir, 'c/page.js'), 'utf8')).toBe('export const x = 1;');
    expect(JSON.parse(readFileSync(join(dir, 'c/page.js.map'), 'utf8'))).toEqual({
      version: 3,
      sources: ['a.fud'],
    });
    // No map, no file: the temp dir mirrors the bundle and invents nothing.
    expect(existsSync(join(dir, 'plain.js.map'))).toBe(false);
    expect(existsSync(join(dir, 'data.json.map'))).toBe(false);
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
