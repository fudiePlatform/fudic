/**
 * `@raw(expr)` in the editor (decision 18): projected as `$raw(expr)`, whose parameter is
 * `$TrustedHTML | null | undefined`.
 *
 * At runtime an unmarked string is written as escaped text, so a page that meant markup would
 * quietly print its tags. The projection moves that to compile time: the real checker, over
 * the projected corpus, has to reject a plain string ON the expression and accept a value
 * `trustedHtml()` made — recognised by its structural `fudicTrustedHtml`, no import needed.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { typecheckCorpus } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const source = readFileSync(resolve(FIXTURES, SLUG), 'utf8');

/** The slug page, with `decl` added to its `@code` and `markup` after its body paragraph. */
function withRaw(decl: string, markup: string): Record<string, string> {
  return {
    [SLUG]: source
      .replace('  type PageData', `${decl}\n  type PageData`)
      .replace('  <p>@data.body</p>', `  <p>@data.body</p>\n  ${markup}`),
  };
}

describe('@raw is checked against TrustedHTML', () => {
  it('a trustedHtml() value is accepted', () => {
    const decl = "  const html = { fudicTrustedHtml: '<em>x</em>' } as const;";
    expect(typecheckCorpus(withRaw(decl, '<div>@raw(html)</div>'))).toEqual([]);
  });

  it('null and undefined are accepted: they write nothing', () => {
    const decl = "  const none: { fudicTrustedHtml: string } | null | undefined = null;";
    expect(typecheckCorpus(withRaw(decl, '<div>@raw(none)</div>'))).toEqual([]);
  });

  it('a plain string is TS2345, on the expression', () => {
    const decl = "  const plain: string = '<b>x</b>';";
    const diags = typecheckCorpus(withRaw(decl, '<div>@raw(plain)</div>'));
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
    expect(diags[0]!.sourceText).toBe('plain');
  });
});
