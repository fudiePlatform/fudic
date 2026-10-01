/** Path arithmetic: what goes inside a file is POSIX and relative to that file. */

import { describe, expect, it } from 'vitest';
import { hrefBetween, resolveHref } from '../src/paths.js';

describe('resolveHref', () => {
  it('turns an href written in a file back into a cwd-relative POSIX path', () => {
    expect(resolveHref('src/routes/index.fud', '../components/x-card.fud')).toBe('src/components/x-card.fud');
  });

  it('undoes hrefBetween', () => {
    const from = 'src/routes/blog/post.fud';
    const to = 'src/layouts/_frame.fud';
    expect(resolveHref(from, hrefBetween(from, to))).toBe(to);
  });
});
