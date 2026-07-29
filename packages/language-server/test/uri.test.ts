/**
 * The URI ↔ path boundary (SDD-24 §4.5).
 *
 * Volar keys scripts by URI and the index keys them by path; the only thing that matters is
 * that the trip is lossless, so the same file is never two entries.
 */

import { describe, expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { isFudUri, pathToUri, uriToPath } from '../src/uri.js';

describe('uriToPath', () => {
  it('normalizes to the POSIX spelling the index is keyed by', () => {
    expect(uriToPath(URI.file('/p/blog/[slug].fud'))).toBe('/p/blog/[slug].fud');
  });
});

describe('pathToUri', () => {
  it('round-trips a path', () => {
    const path = '/p/components/app-badge.fud';

    expect(uriToPath(pathToUri(path))).toBe(path);
    expect(pathToUri(path).scheme).toBe('file');
  });
});

describe('isFudUri', () => {
  it.each([
    ['/p/blog/[slug].fud', true],
    ['/p/data/posts.ts', false],
    ['/p/fud', false],
  ])('%s → %s', (path, expected) => {
    expect(isFudUri(URI.file(path))).toBe(expected);
  });
});
