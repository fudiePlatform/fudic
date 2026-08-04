/**
 * SDD-28 — the gates. What a snippet is worth is where it is offered, so this is the half
 * that gets tested first.
 */

import { describe, expect, it } from 'vitest';
import { parseFud } from '../../src/parse.js';
import { scopeAt } from '../../src/services/snippets.js';
import type { CachedDocument } from '../../src/document-cache.js';

/** A `CachedDocument` with only what these functions read: the source and the tree. */
function cached(source: string): CachedDocument {
  const parsed = parseFud(source);
  return { source, document: parsed.document } as CachedDocument;
}

/** The scope at the offset marked with `|` in the source. */
function scopeAtCursor(marked: string): ReturnType<typeof scopeAt> {
  const offset = marked.indexOf('|');
  const source = marked.replace('|', '');
  return scopeAt(cached(source), offset);
}

describe('scopeAt', () => {
  it.each([[''], ['  '], ['\n\n']])('is empty-document anywhere in %j', (source) => {
    expect(scopeAt(cached(source), 0)).toBe('empty-document');
    expect(scopeAt(cached(source), source.length)).toBe('empty-document');
  });

  it('is markup inside the host template', () => {
    expect(scopeAtCursor('<app-x>\n  <template shadowrootmode="open">\n    |\n  </template>\n</app-x>')).toBe(
      'markup',
    );
  });

  it('is code-block inside @code', () => {
    expect(scopeAtCursor('@code {\n  |\n}\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>')).toBe(
      'code-block',
    );
  });

  it('is nothing inside a <style> body — that is CSS', () => {
    expect(
      scopeAtCursor('<head>\n  <style>\n    :host { |color: red }\n  </style>\n</head>\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>'),
    ).toBeUndefined();
  });

  it('is nothing inside an interpolation — that is an expression', () => {
    expect(
      scopeAtCursor('<app-x>\n  <template shadowrootmode="open">@(a.|b)</template>\n</app-x>'),
    ).toBeUndefined();
  });

  it('is markup again after the @code block ends', () => {
    const source = '@code {\n  const a = 1;\n}\n<app-x>\n  <template shadowrootmode="open">|</template>\n</app-x>';
    expect(scopeAtCursor(source)).toBe('markup');
  });
});
