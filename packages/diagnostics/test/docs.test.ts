/**
 * SDD-50 criterion 12: the address of the explanations lives in `package.json` and nowhere
 * else. Changing the web is changing that field and building again.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCS_BASE, docsUrl } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  fudic?: { docs?: unknown };
};

describe('fudic.docs in package.json', () => {
  it('is there, and is an absolute http(s) URL', () => {
    const docs = pkg.fudic?.docs;
    expect(typeof docs).toBe('string');
    expect(docs).not.toBe('');
    expect(['http:', 'https:']).toContain(new URL(docs as string).protocol);
  });

  it('is what DOCS_BASE says', () => {
    expect(DOCS_BASE).toBe(pkg.fudic?.docs);
  });
});

describe('docsUrl', () => {
  it('is the base plus the code as the anchor', () => {
    expect(docsUrl('FUD0051')).toBe(`${pkg.fudic?.docs as string}#FUD0051`);
    expect(new URL(docsUrl('FUD0725')).hash).toBe('#FUD0725');
  });
});
