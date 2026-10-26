/**
 * SDD-08 — `@code { … }`, and the regions SDD-60 retired (FUD1110). Covers every
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
  it('reads a @server region as FUD1110 on its marker and its content as JS (SDD-60, criterion 25)', () => {
    const source =
      "@code { type User = { id: string }; @server { import {db} from './db'; async function load(){ return db; } } }";
    const { node, diagnostics, source: s } = run(source);

    // One diagnostic for the region, on the marker, and nothing else because of it.
    expect(codes(diagnostics)).toEqual(['FUD1110']);
    expect(s.slice(diagnostics[0]!.span.start, diagnostics[0]!.span.end)).toBe('@server');
    expect(diagnostics[0]!.message).toContain('.fudapi');
    expect(types(node.parts)).toEqual(['neutral-js', 'neutral-js']);
    const [before, inside] = node.parts;
    expect(text(s, before!.js)).toBe('type User = { id: string };');
    // The wrapper is left out: the chunk is the region's content, without its braces.
    expect(text(s, inside!.js)).toBe("import {db} from './db'; async function load(){ return db; }");
  });

  it('reads a @client region the same way, with its own text', () => {
    const source = "@code { @client { import {signal} from '@f'; const s = signal(false); } }";
    const { node, diagnostics, source: s } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD1110']);
    expect(diagnostics[0]!.message).toContain('without the wrapper');
    expect(types(node.parts)).toEqual(['neutral-js']);
    expect(text(s, node.parts[0]!.js)).toBe("import {signal} from '@f'; const s = signal(false);");
  });

  it('cuts a chunk at each wrapper, in source order, one diagnostic per region', () => {
    const source = '@code { @client { a(); } const K = 1; @server { b(); } }';
    const { node, diagnostics, source: s } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD1110', 'FUD1110']);
    expect(node.parts.map((p) => text(s, p.js))).toEqual(['a();', 'const K = 1;', 'b();']);
  });

  it('reports a region nested in another on its own: the inside is top level again', () => {
    const source = '@code { @server { a(); @client { b(); } c(); } }';
    const { node, diagnostics, source: s } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD1110', 'FUD1110']);
    expect(node.parts.map((p) => text(s, p.js))).toEqual(['a();', 'b();', 'c();']);
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
    expect(codes(diagnostics)).toContain('FUD1110');
    expect(node.parts.map((p) => text(source, p.js))).toEqual([')', 'x();']);
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

  it('reports a marker with no `{` as FUD1110 alone, and leaves it out of the JS', () => {
    const source = '@code { @server const a = 1; }';
    const { node, diagnostics, source: s } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD1110']);
    // Nothing to unwrap: the marker goes, so Oxc never reads an `@server` it would reject.
    expect(node.parts.map((p) => text(s, p.js))).toEqual(['const a = 1;']);
  });

  it('leaves a parameter list out with its marker, which says nothing since SDD-60 retired FUD0111', () => {
    const source = '@code { @server(x) { load(); } }';
    const { node, diagnostics, source: s } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD1110']);
    expect(node.parts.map((p) => text(s, p.js))).toEqual(['load();']);
  });

  it('surfaces the balancer diagnostic when the parameter list never closes', () => {
    const source = '@code { @server(x }';
    const { diagnostics } = run(source);

    expect(codes(diagnostics)).toContain('FUD0002');
  });

  it('surfaces FUD0002 when the block never closes', () => {
    const source = '@code { @server { const a = 1;';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toContain('FUD0002');
    // With no `}` there is no closer to cut at: the content runs to the end.
    expect(node.parts.map((p) => text(source, p.js))).toEqual(['const a = 1;']);
    expect(node.span.end).toBe(source.length);
  });

  it('never throws on truncated input', () => {
    const source = '@code { type A = { @server { x(); ';
    for (let cut = 0; cut <= source.length; cut++) {
      expect(() => run(source.slice(0, cut))).not.toThrow();
    }
  });
});

/**
 * BUG-30 §6.8 — the block publishes the opaque regions the balancer already walked.
 *
 * Without the field, every later consumer that must look inside the JS is handed a string
 * and has no option but to re-lex it — which is exactly how a comment became a diagnostic.
 */
describe('parseCodeBlock — the block carries its lexical regions (BUG-30)', () => {
  it('comes back empty for a body with no strings, comments or regex', () => {
    expect(run('@code { const a = 1; }').node.regions).toEqual([]);
  });

  it('lists every opaque region of the WHOLE body, in source order', () => {
    const source =
      '@code { // one\n const s = "two"; /* three */ @server { const t = `four`; } }';
    const { node } = run(source);
    expect(node.regions.map((r) => r.kind)).toEqual([
      'line-comment',
      'string',
      'block-comment',
      'template',
    ]);
    // Sorted by start, and each span covers its delimiters.
    const starts = node.regions.map((r) => r.span.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(text(source, node.regions[1]!.span)).toBe('"two"');
    // The inside of `@server` is walked too: the balancer counts braces, it does not recurse.
    expect(text(source, node.regions[3]!.span)).toBe('`four`');
  });

  it('lists a region nested in a template interpolation on its own, inside the template', () => {
    const source = '@code { const t = `x ${"y"} z`; }';
    const { node } = run(source);
    expect(node.regions.map((r) => r.kind)).toEqual(['template', 'string']);
    const [template, nested] = node.regions as [
      (typeof node.regions)[number],
      (typeof node.regions)[number],
    ];
    expect(nested.span.start).toBeGreaterThan(template.span.start);
    expect(nested.span.end).toBeLessThan(template.span.end);
  });

  it('is empty on the degraded block that never found its `{`', () => {
    expect(run('@code').node.regions).toEqual([]);
  });
});

/**
 * BUG-13 — inside `@code` you comment in JavaScript.
 *
 * A Razor comment buys one thing: commenting without publishing. In markup and in CSS that
 * is real, because the native comment does reach the browser; in JS the bundler already
 * drops `//`. So `@* … *@` here is FUD0114 (decision 35.a) — and, either way, it may never
 * decide where the block ends.
 */
describe('parseCodeBlock — Razor comments are not JavaScript (BUG-13)', () => {
  const COUNT = 'const count = signal(0);';

  const positions: ReadonlyArray<readonly [string, string]> = [
    ['before the code', `@code { @* c *@ ${COUNT} }`],
    ['inside a block', '@code { function f() { @* c *@ const count = signal(0); } }'],
    ['after the code', `@code { ${COUNT} @* c *@ }`],
  ];

  for (const [where, source] of positions) {
    it(`reports exactly one FUD0114, spanning the whole comment — ${where} (§7.1, §7.2)`, () => {
      const { diagnostics, source: s } = run(source);
      expect(codes(diagnostics)).toEqual(['FUD0114']);
      // From the `@` to the `@`: the diagnostic covers what has to go, nothing more.
      expect(s.slice(diagnostics[0]!.span.start, diagnostics[0]!.span.end)).toBe('@* c *@');
    });
  }

  it('is not fooled by braces or an @client written inside the comment (§7.4)', () => {
    const source = `@code { @* deja una { abierta, un } suelto y un @client { *@ ${COUNT} }<p>after</p>`;
    const { node, diagnostics, lexer } = run(source);

    expect(codes(diagnostics)).toEqual(['FUD0114']); // the comment, and nothing else
    // The block closed at ITS `}`, so the markup after it is still there to be parsed.
    expect(source[node.span.end - 1]).toBe('}');
    expect(source.slice(node.span.end)).toBe('<p>after</p>');
    expect(lexer.offset).toBe(node.span.end);
    // The `@client` in the comment is text, not a marker: no FUD1110, and the comment stays
    // where the author wrote it, inside the chunk (§4).
    expect(types(node.parts)).toEqual(['neutral-js']);
    expect(text(source, node.parts[0]!.js)).toBe(`@* deja una { abierta, un } suelto y un @client { *@ ${COUNT}`);
  });

  it('never hangs or throws on an unterminated Razor comment (§7.5)', () => {
    const source = '@code { @* sin cerrar\n  const a = 1;\n';
    const { node, diagnostics } = run(source);

    expect(codes(diagnostics)).toContain('FUD0114');
    // The group ran out of source, which is FUD0002 — the comment adds no second word for it.
    expect(codes(diagnostics)).toContain('FUD0002');
    for (const d of diagnostics) {
      expect(d.span.start).toBeGreaterThanOrEqual(0);
      expect(d.span.end).toBeLessThanOrEqual(source.length);
    }
    expect(node.span.end).toBe(source.length);
  });

  it('leaves JS comments alone, in the three positions (§7.6)', () => {
    const source =
      '@code { // first\n  /* also first */\n  type T = 1;\n' +
      '  function f() { // in a block\n    const s = 1; }\n' +
      '  /* last */ const count = signal(0); }';
    const { node, diagnostics } = run(source);

    expect(diagnostics).toEqual([]);
    expect(types(node.parts)).toEqual(['neutral-js']);
  });

  it('does not invent the region for the callers that did not ask for it (§7.8)', () => {
    // SDD-02's own contract is untouched: only `@code` opts in, so `@(a @* b)` still
    // scans as it did — a bare `@`, an operator, no opaque region.
    const source = '(a @* b)';
    const group = scanParens(source, 0).value;
    expect(group.regions).toEqual([]);
    expect(group.closed).toBe(true);
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
    expect(types(block.parts)).toEqual(['neutral-js']);
    expect(text(source, block.parts[0]!.js)).toContain('type PageData');
  });
});
