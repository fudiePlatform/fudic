/**
 * Path arithmetic (SDD-24 §4.2, §4.5).
 *
 * The unit is a POSIX-shaped string because the editor, the `href` and the filesystem
 * disagree about separators, and the index is only a map lookup if they are made to agree
 * once.
 */

import { describe, expect, it } from 'vitest';
import { baseName, dirName, relativeHref, resolveFrom, toPosix } from '../src/paths.js';

describe('toPosix', () => {
  it.each([
    ['C:\\p\\blog\\[slug].fud', 'C:/p/blog/[slug].fud'],
    ['/p/blog/[slug].fud', '/p/blog/[slug].fud'],
    ['/p/blog/', '/p/blog'],
    ['/', '/'],
  ])('%s → %s', (input, expected) => {
    expect(toPosix(input)).toBe(expected);
  });
});

describe('dirName', () => {
  it.each([
    ['/p/blog/[slug].fud', '/p/blog'],
    ['/x.fud', '/'],
    ['x.fud', ''],
  ])('%s → "%s"', (input, expected) => {
    expect(dirName(input)).toBe(expected);
  });
});

describe('baseName', () => {
  it.each([
    ['/p/blog/[slug].fud', '[slug].fud'],
    ['x.fud', 'x.fud'],
  ])('%s → %s', (input, expected) => {
    expect(baseName(input)).toBe(expected);
  });
});

describe('resolveFrom', () => {
  it.each([
    ['/p/blog/[slug].fud', '../components/app-badge.fud', '/p/components/app-badge.fud'],
    ['/p/blog/[slug].fud', './sibling.fud', '/p/blog/sibling.fud'],
    ['/p/blog/[slug].fud', 'sibling.fud', '/p/blog/sibling.fud'],
    ['/p/blog/deep/x.fud', '../../a/./b.fud', '/p/a/b.fud'],
    ['C:/p/blog/x.fud', '../c/y.fud', 'C:/p/c/y.fud'],
  ])('from %s, %s → %s', (from, href, expected) => {
    expect(resolveFrom(from, href)).toBe(expected);
  });

  it('takes an absolute href as it is', () => {
    expect(resolveFrom('/p/blog/x.fud', '/other/y.fud')).toBe('/other/y.fud');
    expect(resolveFrom('/p/blog/x.fud', 'C:/other/y.fud')).toBe('C:/other/y.fud');
  });

  it('cannot be walked above its root', () => {
    expect(resolveFrom('/p/x.fud', '../../../../y.fud')).toBe('/y.fud');
  });

  it('keeps a `..` that escapes a relative path, rather than inventing a root', () => {
    expect(resolveFrom('x.fud', '../y.fud')).toBe('../y.fud');
    expect(resolveFrom('x.fud', '../../y.fud')).toBe('../../y.fud');
  });
});

describe('relativeHref', () => {
  it.each([
    ['/p/blog/[slug].fud', '/p/components/app-badge.fud', '../components/app-badge.fud'],
    ['/p/blog/[slug].fud', '/p/blog/other.fud', './other.fud'],
    ['/p/blog/deep/x.fud', '/p/a.fud', '../../a.fud'],
    ['x.fud', 'y.fud', './y.fud'],
  ])('inside %s, %s is written %s', (from, target, expected) => {
    expect(relativeHref(from, target)).toBe(expected);
  });

  it('round-trips with resolveFrom', () => {
    const from = '/p/blog/[slug].fud';
    const target = '/p/components/app-badge.fud';

    expect(resolveFrom(from, relativeHref(from, target))).toBe(target);
  });
});
