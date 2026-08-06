/**
 * Character references on the strict subset (BUG-14 §3.2, decision 38).
 *
 * The two faces of the same grammar are tested together on purpose: whatever
 * `decodeEntities` leaves alone, `unknownReferences` must have named — otherwise a reference
 * would reach the output verbatim with nobody having said why.
 */

import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  parseDocument,
  unknownReferences,
  type ElementNode,
} from '../../src/html/index.js';

describe('decodeEntities — the subset', () => {
  it('decodes the five named references of XML', () => {
    expect(decodeEntities('&lt;a&gt; &amp; &quot;x&quot; &apos;y&apos;')).toBe(`<a> & "x" 'y'`);
  });

  it('decodes decimal and hexadecimal references, in either case', () => {
    expect(decodeEntities('&#123;x&#125;')).toBe('{x}'); // decision 79's literal braces
    expect(decodeEntities('&#x7b;&#X7D;')).toBe('{}');
  });

  it('decodes a reference above the BMP', () => {
    expect(decodeEntities('&#x1F600;')).toBe('\u{1F600}');
  });

  it('leaves an ordinary `&` exactly where it is', () => {
    // The one thing this must never do: `Fish & Chips` is text, not a broken reference.
    expect(decodeEntities('Fish & Chips')).toBe('Fish & Chips');
    expect(decodeEntities('a &b c')).toBe('a &b c');
  });
});

describe('decodeEntities — what the subset does not cover', () => {
  it('leaves a named reference outside the subset verbatim', () => {
    expect(decodeEntities('&hellip;')).toBe('&hellip;');
  });

  it('leaves a code point past the last plane verbatim', () => {
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;');
  });

  it('leaves a surrogate half verbatim', () => {
    // It encodes a character; it is not one. `String.fromCodePoint` would happily produce a
    // lone surrogate, and a lone surrogate is not text.
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
    expect(decodeEntities('&#xDFFF;')).toBe('&#xDFFF;');
  });
});

describe('unknownReferences — what the parser reports', () => {
  it('finds nothing in text the subset covers', () => {
    expect(unknownReferences('&lt;a&gt; & plain', 0)).toEqual([]);
  });

  it('locates each unresolvable reference in the source', () => {
    const found = unknownReferences('x&hellip;y&nbsp;', 10);
    expect(found.map((f) => f.text)).toEqual(['&hellip;', '&nbsp;']);
    expect(found[0]!.span).toEqual({ start: 11, end: 19 });
    expect(found[1]!.span).toEqual({ start: 20, end: 26 });
  });
});

describe('FUD0057 — the parser reports it, and keeps going', () => {
  const codes = (source: string): string[] =>
    parseDocument(source).diagnostics.map((d) => d.code);

  it('reports an unknown reference in content', () => {
    expect(codes('<p>&hellip;</p>')).toEqual(['FUD0057']);
  });

  it('reports one in a quoted attribute value', () => {
    expect(codes('<p title="&nbsp;"></p>')).toEqual(['FUD0057']);
  });

  it('reports one in an unquoted value, on top of FUD0056', () => {
    expect(codes('<p title=&nbsp;></p>')).toEqual(['FUD0056', 'FUD0057']);
  });

  it('says nothing about the subset, or about a bare `&`', () => {
    expect(codes('<p>&lt;a&gt; &amp; Fish & Chips &#123;</p>')).toEqual([]);
  });

  it('leaves the text VERBATIM in the AST — the emit is what decodes', () => {
    const paragraph = parseDocument('<p>&lt;a&gt;</p>').value.children[0] as ElementNode;
    expect(paragraph.children[0]).toMatchObject({ type: 'text', value: '&lt;a&gt;' });
  });
});
