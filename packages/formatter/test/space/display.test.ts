import { describe, expect, it } from 'vitest';
import { breaksInside, displayOf, isInlineLevel } from '../../src/space/index.js';

describe('displayOf', () => {
  it('classifies the three kinds of native tag', () => {
    expect(displayOf('div')).toBe('block');
    expect(displayOf('span')).toBe('inline');
    expect(displayOf('button')).toBe('inline-block');
  });

  it('treats metadata elements as blocks: they render nothing to disturb', () => {
    expect(displayOf('link')).toBe('block');
    expect(displayOf('style')).toBe('block');
    expect(displayOf('title')).toBe('block');
    expect(displayOf('template')).toBe('block');
  });

  it('is case-insensitive, because the parser keeps the case the author wrote', () => {
    expect(displayOf('DIV')).toBe('block');
    expect(displayOf('IMG')).toBe('inline-block');
  });

  it('treats a custom element as inline unless proven otherwise', () => {
    // The conservative assumption of §4.5: breaking inside an inline container is a visible
    // change; not breaking inside a block one is only a long line.
    expect(displayOf('app-badge')).toBe('inline');
    expect(displayOf('site-nav')).toBe('inline');
  });
});

describe('the two questions the table answers', () => {
  it('outside: is the whitespace around it inline?', () => {
    expect(isInlineLevel('span')).toBe(true);
    expect(isInlineLevel('img')).toBe(true);
    expect(isInlineLevel('div')).toBe(false);
  });

  it('inside: may its children go one per line?', () => {
    expect(breaksInside('div')).toBe(true);
    expect(breaksInside('button')).toBe(true);
    expect(breaksInside('span')).toBe(false);
  });
});
