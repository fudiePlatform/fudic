/**
 * SDD-03 against the canonical `.fud` fixtures: the acceptance criteria are drawn
 * from real input, so the tokenizer is exercised on the files it must eventually
 * compile rather than on hand-written snippets alone.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tokenize, type Token } from '../../src/lexer/index.js';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';

const FIXTURES = ['home.fud', 'app-card.fud', 'app-button.fud', 'app-badge.fud'] as const;

/** The real @-construct parsers, so @code/control bodies are consumed by the balancer. */
const constructs: AtConstructParser = { parseControl, parseCodeBlock };

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

describe.each(FIXTURES)('%s', (name) => {
  const source = read(name);
  const result = tokenize(source);

  it('tiles the source with no gaps or overlaps (§4.1)', () => {
    let at = 0;
    for (const token of result.value) {
      expect(token.span.start).toBe(at);
      at = token.span.end;
    }
    expect(at).toBe(source.length);
  });

  it('the real parse path produces no diagnostics', () => {
    // Standalone `tokenize()` HTML-scans @code/header bodies, so TS generics inside them
    // (`props<T>()`, `Promise<T>`) trip tag scanning — that JS is not the tokenizer's to
    // tile. In the real path the balancer owns those bodies (parseCodeBlock/parseControl),
    // so the fixtures parse clean; that is the guarantee that matters and we assert it here.
    const parsed = parseDocument(source, { atConstructs: constructs });
    expect(parsed.diagnostics).toEqual([]);
  });

  it('leaves every balanced JS region closed', () => {
    for (const token of result.value) {
      if (token.type === 'explicit-expr' || token.type === 'inline-code') {
        expect(token.group.closed).toBe(true);
      }
    }
  });
});

describe('home.fud specifics', () => {
  const source = read('home.fud');
  const tokens = tokenize(source).value;
  const slice = (t: Token): string => source.slice(t.span.start, t.span.end);

  it('opens with a doctype', () => {
    expect(tokens[0]?.type).toBe('doctype');
  });

  it('keeps Razor live inside <title> (§4.6)', () => {
    const titleOpen = tokens.findIndex((t) => t.type === 'tag-open-start' && t.name === 'title');
    expect(titleOpen).toBeGreaterThan(-1);
    // tag-open-start, tag-open-end, at-trigger, text, tag-close
    expect(tokens[titleOpen + 1]?.type).toBe('tag-open-end');
    expect(tokens[titleOpen + 2]?.type).toBe('at-trigger');
    expect(slice(tokens[titleOpen + 3]!)).toBe('data.title');
    expect(tokens[titleOpen + 4]).toMatchObject({ type: 'tag-close', name: 'title' });
  });

  it('reads the variant binding as an opaque explicit expression', () => {
    const expr = tokens.find(
      (t) => t.type === 'explicit-expr' && source.slice(t.span.start, t.span.end).includes('featured'),
    );
    expect(expr).toBeDefined();
    if (expr?.type !== 'explicit-expr') throw new Error('unreachable');
    expect(source.slice(expr.group.inner.start, expr.group.inner.end)).toBe(
      "item.featured ? 'highlight' : 'default'",
    );
  });

  it('surfaces every control-body closing brace as block-end (decision 79)', () => {
    // @if / else / @foreach / the nested @if, plus the @code and @server bodies.
    const blockEnds = tokens.filter((t) => t.type === 'block-end');
    expect(blockEnds.length).toBeGreaterThanOrEqual(4);
    for (const token of blockEnds) expect(slice(token)).toBe('}');
  });

  it('emits an at-trigger for each control keyword, spanning only the @', () => {
    const triggers = tokens.filter((t) => t.type === 'at-trigger');
    for (const token of triggers) expect(slice(token)).toBe('@');
    // @code, @server, @data (title), @data (h1), @if, @foreach, @if, @item
    expect(triggers.length).toBeGreaterThanOrEqual(8);
  });
});
