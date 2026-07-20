/**
 * SDD-08 — `@code { … }` with its `@server` / `@client` regions. Covers every
 * acceptance criterion of §6 plus the marker-scanning edges (opaque regions,
 * nesting, degradations).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCodeBlock, type CodeBlockNode, type CodePart } from '../../src/code/index.js';
import { Lexer } from '../../src/lexer/index.js';
import { parseDocument, type AtConstructParser, type HtmlParseContext } from '../../src/html/index.js';
import { scanBraces, scanParens } from '../../src/balancer/index.js';
import { ok, span, type Diagnostic, type ParseResult, type Span } from '../../src/types/index.js';

interface Run {
  readonly node: CodeBlockNode;
  readonly diagnostics: readonly Diagnostic[];
  readonly lexer: Lexer;
  readonly source: string;
}

/**
 * Drives `parseCodeBlock` exactly as SDD-05 does: the lexer already sits just past
 * the `code` keyword, and `keywordSpan` covers the identifier only.
 */
function run(source: string): Run {
  const at = source.indexOf('@code');
  const keywordSpan = span(at + 1, at + 5);
  const lexer = new Lexer(source);
  lexer.seekTo(keywordSpan.end);
  const ctx: HtmlParseContext = {
    source,
    lexer,
    parseContentUntil: () => ok([]),
  };
  const result: ParseResult<CodeBlockNode> = parseCodeBlock(ctx, keywordSpan);
  return { node: result.value, diagnostics: result.diagnostics, lexer, source };
}

function text(source: string, at: Span): string {
  return source.slice(at.start, at.end).trim();
}

function types(parts: readonly CodePart[]): readonly string[] {
  return parts.map((p) => p.type);
}

function codes(diagnostics: readonly Diagnostic[]): readonly string[] {
  return diagnostics.map((d) => d.code);
}

describe('parseCodeBlock — well-formed blocks', () => {
  it('splits neutral JS followed by a @server region (§6.2)', () => {
    const source =
      "@code { type User = { id: string }; @server { import {db} from './db'; async function load(){ return db; } } }";
    const { node, diagnostics, source: s } = run(source);

    expect(diagnostics).toEqual([]);
    expect(node.type).toBe('code');
    expect(types(node.parts)).toEqual(['neutral-js', 'server-region']);

    const [neutral, server] = node.parts;
    expect(neutral?.type).toBe('neutral-js');
    expect(text(s, neutral!.js)).toBe('type User = { id: string };');
    expect(server?.type).toBe('server-region');
    expect(text(s, server!.js)).toContain("import {db} from './db';");
    expect(text(s, server!.js)).toContain('async function load()');
    // The region node owns the whole marker, `js` only the braces' inner.
    expect(s.slice(server!.span.start).startsWith('@server')).toBe(true);
    expect(s[server!.span.end - 1]).toBe('}');
  });

  it('accepts a lone @client region (§6.3)', () => {
    const source = "@code { @client { import {signal} from '@f'; const s = signal(false); } }";
    const { node, diagnostics, source: s } = run(source);

    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['client-region']);
    expect(text(s, node.parts[0]!.js)).toContain('const s = signal(false);');
  });

  it('keeps regions in free source order (§6.6, decision 34)', () => {
    const source = '@code { @client { a(); } const K = 1; @server { b(); } }';
    const { node, diagnostics } = run(source);

    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['client-region', 'neutral-js', 'server-region']);
  });

  it('treats a TS decorator as neutral JS, not a marker (§6.7)', () => {
    const source = '@code { @Component() class X {} }';
    const { node, diagnostics, source: s } = run(source);

    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
    expect(text(s, node.parts[0]!.js)).toBe('@Component() class X {}');
  });

  it('yields no parts for an empty block (§6.8)', () => {
    const { node, diagnostics } = run('@code {}');
    expect(diagnostics).toEqual([]);
    expect(node.parts).toEqual([]);
  });

  it('omits a whitespace-only neutral chunk', () => {
    const { node, diagnostics } = run('@code {\n\n   \n}');
    expect(diagnostics).toEqual([]);
    expect(node.parts).toEqual([]);
  });

  it('spans the whole `@code … }` atom and leaves the lexer past it', () => {
    const source = '<p>@code { const a = 1; }</p>';
    const { node, lexer } = run(source);

    expect(node.span.start).toBe(source.indexOf('@code'));
    expect(source[node.span.end - 1]).toBe('}');
    expect(lexer.offset).toBe(node.span.end);
    expect(lexer.mode).toBe('html');
  });

  it('starts the span at the keyword when no `@` precedes it', () => {
    // Defensive path: a hand-built keywordSpan with no leading `@` (never produced
    // by SDD-04) must not report a span one character too early.
    const source = 'code { const a = 1; }';
    const lexer = new Lexer(source);
    lexer.seekTo(4);
    const ctx: HtmlParseContext = { source, lexer, parseContentUntil: () => ok([]) };
    const { value } = parseCodeBlock(ctx, span(0, 4));

    expect(value.span.start).toBe(0);
    expect(types(value.parts)).toEqual(['neutral-js']);
  });
});

describe('parseCodeBlock — marker scanning', () => {
  it('ignores a marker nested inside a JS group', () => {
    const source = '@code { function f() { @server { x(); } } }';
    const { node, diagnostics } = run(source);

    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it.each([
    ['string', "@code { const s = '@server { x }'; }"],
    ['template', '@code { const t = `@server { x }`; }'],
    ['line comment', '@code { // @server { x }\nconst a = 1; }'],
    ['block comment', '@code { /* @server { x } */ const a = 1; }'],
    ['regex', '@code { const r = /@server/g; }'],
  ])('ignores a marker inside an opaque %s region', (_kind, source) => {
    const { node, diagnostics } = run(source);

    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it('requires a word boundary after the marker name', () => {
    const { node, diagnostics } = run('@code { @server; }');
    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it('leaves a look-alike identifier as neutral JS', () => {
    const { node, diagnostics } = run('@code { @servers { x(); } }');
    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it('advances past a bare `@` with no identifier', () => {
    const { node, diagnostics } = run('@code { const v = a @ b; }');
    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it('recognizes a marker after a stray closing delimiter', () => {
    // The block never closes, so its body carries the unmatched `)`. A depth counter
    // left negative there would blind the scanner to every later marker.
    const source = '@code { ) @server { x(); }';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toContain('FUD0002');
    expect(types(node.parts)).toContain('server-region');
  });
});

describe('parseCodeBlock — degradations (§6.9)', () => {
  it('reports FUD0110 when `{` does not follow @code', () => {
    const source = '@code type X = 1;';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD0110']);
    expect(node.parts).toEqual([]);
    expect(node.span.end).toBe(source.indexOf('@code') + '@code'.length);
    expect(diagnostics[0]?.span.start).toBe(source.indexOf('type'));
  });

  it('reports FUD0110 when `{` does not follow a region marker', () => {
    const source = '@code { @server const a = 1; }';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD0110']);
    // The marker stays inside the neutral chunk: the body remains fully covered.
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it('reports FUD0111 for `@server(x)` (§6.5, decision 66)', () => {
    const source = '@code { @server(x) { load(); } }';
    const { node, diagnostics, source: s } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD0111']);
    expect(s.slice(diagnostics[0]!.span.start, diagnostics[0]!.span.end)).toBe('(x)');
    // Recovery still delimits the region, so the editor keeps a usable node.
    expect(types(node.parts)).toEqual(['server-region']);
    expect(text(s, node.parts[0]!.js)).toBe('load();');
  });

  it('reports FUD0111 for `@client(viewport)` (§6.4, decision 66)', () => {
    const source = '@code { @client(viewport) { hydrate(); } }';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD0111']);
    expect(types(node.parts)).toEqual(['client-region']);
  });

  it('surfaces the balancer diagnostic when the parameter list never closes', () => {
    const source = '@code { @server(x }';
    const { diagnostics } = run(source);

    expect(codes(diagnostics)).toContain('FUD0111');
    expect(codes(diagnostics)).toContain('FUD0002');
  });

  it('surfaces FUD0002 when the block never closes', () => {
    const source = '@code { @server { const a = 1;';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toContain('FUD0002');
    expect(types(node.parts)).toEqual(['server-region']);
    expect(node.span.end).toBe(source.length);
  });

  it('never throws on truncated input', () => {
    const source = '@code { type A = { @server { x(); ';
    for (let cut = 0; cut <= source.length; cut++) {
      expect(() => run(source.slice(0, cut))).not.toThrow();
    }
  });
});

describe('parseCodeBlock — integration with parseDocument', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../fixtures/home.fud', import.meta.url)),
    'utf8',
  );

  function skipWhitespace(text_: string, from: number): number {
    let i = from;
    while (i < text_.length && /\s/u.test(text_[i] ?? '')) i++;
    return i;
  }

  /** Real SDD-08 for `@code`; a balancer stand-in for the SDD-06 control bodies. */
  const constructs: AtConstructParser = {
    parseControl(ctx, keyword, keywordSpan) {
      let at = skipWhitespace(ctx.source, keywordSpan.end);
      if (ctx.source[at] === '(') {
        at = scanParens(ctx.source, at).value.span.end;
        at = skipWhitespace(ctx.source, at);
      }
      const end = ctx.source[at] === '{' ? scanBraces(ctx.source, at).value.span.end : at;
      ctx.lexer.seekTo(end);
      return ok({ type: keyword, span: span(keywordSpan.start, end) });
    },
    parseCodeBlock,
  };

  it('parses home.fud with no diagnostics and one @code node', () => {
    const result = parseDocument(source, { atConstructs: constructs });
    expect(result.diagnostics).toEqual([]);

    const blocks: CodeBlockNode[] = [];
    const walk = (node: { children?: readonly unknown[] }): void => {
      for (const child of node.children ?? []) {
        const c = child as { type: string; children?: readonly unknown[] };
        if (c.type === 'code') blocks.push(c as unknown as CodeBlockNode);
        walk(c);
      }
    };
    walk(result.value);

    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(types(block.parts)).toEqual(['neutral-js', 'server-region']);
    expect(text(source, block.parts[0]!.js)).toContain('type PageData');
    expect(text(source, block.parts[1]!.js)).toContain("import { db } from './db';");
    // The SQL string holds no `@`, but the region must stay opaque all the same.
    expect(text(source, block.parts[1]!.js)).toContain('SELECT id, title');
  });
});
