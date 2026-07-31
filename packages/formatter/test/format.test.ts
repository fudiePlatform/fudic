import { describe, expect, it } from 'vitest';
import { span } from '@fudic/compiler';
import { format, formatRange, formatRangeWith, formatWith } from '../src/format.js';
import { childrenOf, smallestNodeAround } from '../src/range.js';
import { FakeEngine, parse } from './_support.js';
import type { LeafEngine } from '../src/leaf/index.js';

/** An engine that fails the way nothing is supposed to: by throwing. */
const throwing: LeafEngine = {
  format() {
    throw new Error('the native binding is gone');
  },
};

describe('format', () => {
  it('formats a file and ends it with one newline', async () => {
    const result = await format('<div>  <p>a</p>  </div>');
    expect(result.ok && result.text).toBe('<div> <p>a</p> </div>\n');
  });

  it('carries the notes of the leaves that were left alone', async () => {
    const result = await format('<p>@(a ===)</p>');
    expect(result.ok && result.notes.map((n) => n.code)).toEqual(['FUD0481']);
  });

  it('has no notes when everything was formatted', async () => {
    const result = await format('<p>@(a)</p>');
    expect(result.ok && result.notes).toEqual([]);
  });

  it('refuses a file the parser could not read, and changes nothing', async () => {
    const result = await format('<div><p>unclosed</div>');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.length).toBeGreaterThan(0);
  });

  it('does NOT refuse a file that merely breaks a document rule', async () => {
    // No host wrapper (decision 75). SDD-10 has plenty to say about it and none of it
    // changes a character of the layout — and this is exactly the state a component is in
    // while it is being written, which is when formatting gets asked for.
    const result = await format('<p>a</p>');
    expect(result.ok).toBe(true);
  });

  it('never throws, whatever the engine underneath does', async () => {
    const result = await formatWith(throwing, '<p>@(a)</p>');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics[0]?.code).toBe('FUD0482');
    expect(!result.ok && result.diagnostics[0]?.message).toContain('native binding is gone');
  });

  it('reports a thrown non-error too', async () => {
    const rude: LeafEngine = {
      format() {
        throw 'not an error';
      },
    };
    const result = await formatWith(rude, '<p>@(a)</p>');
    expect(!result.ok && result.diagnostics[0]?.message).toContain('not an error');
  });
});

describe('the line terminator', () => {
  it('follows the option', async () => {
    const crlf = await formatWith(new FakeEngine(), '<p>a</p>', { endOfLine: 'crlf' });
    expect(crlf.ok && crlf.text).toBe('<p>a</p>\r\n');
  });

  it('follows the source when the option says auto', async () => {
    const source = '<div>\r\n  <p>a</p>\r\n</div>';
    const result = await formatWith(new FakeEngine(), source, { endOfLine: 'auto' });
    expect(result.ok && result.text).toBe('<div>\r\n  <p>a</p>\r\n</div>\r\n');
  });
});

describe('childrenOf', () => {
  const only = (source: string) => parse(source).children[0]!;

  it('walks into every construct that holds content', () => {
    expect(childrenOf(only('<div><p>a</p></div>'))).toHaveLength(1);
    expect(childrenOf(only('@if (a) { <p>x</p> } else { <b>y</b> }')).length).toBeGreaterThan(1);
    expect(childrenOf(only('@foreach (const i of xs) { <p>@i</p> }')).length).toBeGreaterThan(0);
    expect(childrenOf(only('@switch (t) { case 1: <p>a</p> }')).length).toBeGreaterThan(0);
    expect(childrenOf(only('@section nav { <p>a</p> }')).length).toBeGreaterThan(0);
  });

  it('says a @code has none: its parts are JS, and half a fragment is not one', () => {
    expect(childrenOf(only('@code { const a = 1; }'))).toEqual([]);
    expect(childrenOf(only('text'))).toEqual([]);
  });
});

describe('smallestNodeAround', () => {
  it('finds the deepest node that covers the range', () => {
    const source = '<div>\n  <p>hello</p>\n</div>';
    const at = source.indexOf('hello');
    const node = smallestNodeAround(parse(source).children, span(at, at + 2));
    expect(node?.type).toBe('text');
  });

  it('answers nothing when no single node covers it', () => {
    const source = '<a></a><b></b>';
    expect(smallestNodeAround(parse(source).children, span(1, 12))).toBeUndefined();
  });
});

describe('formatRange', () => {
  const source = '@if (a&&b) {\n<p>x</p>\n}\n\n<div   >keep   me</div>\n';

  it('formats the whole construct a half-selected header belongs to', async () => {
    // Acceptance criterion 12: selecting the middle of an `@if` header formats the `@if`.
    const at = source.indexOf('a&&b');
    const result = await formatRange(source, span(at, at + 2));
    expect(result.ok && result.text).toContain('@if (a && b) {');
  });

  it('leaves every byte outside the node it chose exactly as it was', async () => {
    const at = source.indexOf('a&&b');
    const result = await formatRange(source, span(at, at + 2));
    expect(result.ok && result.text).toContain('<div   >keep   me</div>');
  });

  it('formats the whole file when the selection spans more than one node', async () => {
    const result = await formatRange(source, span(0, source.length));
    expect(result.ok && result.text).toContain('<div>keep me</div>');
  });

  it('refuses a file the parser could not read', async () => {
    const result = await formatRange('<div><p>x</div>', span(0, 3));
    expect(result.ok).toBe(false);
  });

  it('never throws either', async () => {
    const at = source.indexOf('a&&b');
    const result = await formatRangeWith(throwing, source, span(at, at + 2));
    expect(!result.ok && result.diagnostics[0]?.code).toBe('FUD0482');
  });

  it('applies the terminator to the fragment only, never to the file around it', async () => {
    const crlf = '@if (a&&b) {\r\n<p>x</p>\r\n}\r\n';
    const at = crlf.indexOf('a&&b');
    const result = await formatRangeWith(new FakeEngine(), crlf, span(at, at + 2), {
      endOfLine: 'auto',
    });
    expect(result.ok && result.text).not.toContain('\r\r');
  });
});
