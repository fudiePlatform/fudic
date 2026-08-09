/**
 * The `key (…)` clause (SDD-30 §3.5, decisions 91–95).
 *
 * It is the only piece of SDD-30 that touches the parser, and it is deliberately written
 * OUTSIDE the header parenthesis: the tests below are what hold that line — the C-style
 * `@for` header keeps its two `;`, and the key is read as one more balanced group after
 * the `)`.
 */

import { describe, expect, it } from 'vitest';
import { keyExpression, parseControl } from '../../src/control/index.js';
import type {
  ControlNode,
  ForNode,
  ForeachNode,
  IfNode,
  SwitchNode,
  WhileNode,
} from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import {
  parseDocument,
  type AtConstructParser,
  type HtmlContent,
} from '../../src/html/index.js';
import type { Diagnostic, Span } from '../../src/types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

const CONTROL_TYPES: ReadonlySet<string> = new Set(['if', 'for', 'foreach', 'while', 'switch']);

function parse(source: string): { node: ControlNode; diagnostics: readonly Diagnostic[] } {
  const parsed = parseDocument(source, { atConstructs: constructs });
  const node = find(parsed.value.children);
  if (node === null) throw new Error('no control node in the tree');
  return { node, diagnostics: parsed.diagnostics };
}

function find(nodes: readonly HtmlContent[]): ControlNode | null {
  for (const node of nodes) {
    if (CONTROL_TYPES.has(node.type)) return node as unknown as ControlNode;
    if (node.type === 'element') {
      const nested = find(node.children);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function codes(source: string): string[] {
  return parseDocument(source, { atConstructs: constructs }).diagnostics.map((d) => d.code);
}

function text(source: string, at: Span): string {
  return source.slice(at.start, at.end);
}

/** The span of the header `( … )`: where every key diagnostic points (§5). */
function headerSpan(source: string): Span {
  const start = source.indexOf('(');
  return { start, end: source.indexOf(')', start) + 1 };
}

type Loop = ForeachNode | ForNode | WhileNode;

describe('the three loops carry a key (criterion 8)', () => {
  it('reads it after @foreach, and the header stays whole', () => {
    const source = '@foreach (const r of rows) key (r.id) { <li>@r.n</li> }';
    const { node, diagnostics } = parse(source);
    expect(node.type).toBe('foreach');
    const loop = node as ForeachNode;
    expect(text(source, loop.header.inner)).toBe('const r of rows');
    expect(text(source, loop.key!.expr)).toBe('r.id');
    expect(diagnostics).toEqual([]);
  });

  it('reads it after @for WITHOUT splitting the two `;` of the header (criterion 10)', () => {
    const source = '@for (let i = 0; i < n; i++) key (i) { <li>@i</li> }';
    const { node, diagnostics } = parse(source);
    expect(node.type).toBe('for');
    const loop = node as ForNode;
    // The `;` belong to the C-style header and nothing counted them: the key is outside.
    expect(text(source, loop.header.inner)).toBe('let i = 0; i < n; i++');
    expect(text(source, loop.key!.expr)).toBe('i');
    expect(diagnostics).toEqual([]);
  });

  it('reads it after @while, whose key comes from what the body mutates', () => {
    const source = '@while (cur !== null) key (cur.id) { <li>@cur.n</li> }';
    const { node, diagnostics } = parse(source);
    expect(node.type).toBe('while');
    const loop = node as WhileNode;
    expect(text(source, loop.header.inner)).toBe('cur !== null');
    expect(text(source, loop.key!.expr)).toBe('cur.id');
    expect(diagnostics).toEqual([]);
  });

  it('sees what a destructuring header declares', () => {
    const source = '@foreach (const { id, name } of rows) key (id) { <li>@name</li> }';
    const { node, diagnostics } = parse(source);
    const loop = node as ForeachNode;
    expect(text(source, loop.header.inner)).toBe('const { id, name } of rows');
    expect(text(source, loop.key!.expr)).toBe('id');
    expect(diagnostics).toEqual([]);
  });

  it('spans the whole clause, not just its inside', () => {
    const source = '@foreach (const r of rows) key (r.id) { <li>x</li> }';
    const loop = parse(source).node as Loop;
    expect(text(source, loop.key!.span)).toBe('key (r.id)');
  });

  it('takes an arbitrary expression, strings and parentheses included', () => {
    const source = "@foreach (const r of rows) key (`${r.a}:${r.b}`) { <li>x</li> }";
    const loop = parse(source).node as Loop;
    expect(text(source, loop.key!.expr)).toBe('`${r.a}:${r.b}`');
    expect(codes(source)).toEqual([]);
  });

  it('allows whitespace and a line break between the header and the key', () => {
    const source = '@foreach (const r of rows)\n  key (r.id)\n{ <li>x</li> }';
    const loop = parse(source).node as Loop;
    expect(text(source, loop.key!.expr)).toBe('r.id');
    expect(codes(source)).toEqual([]);
  });
});

describe('FUD0540 — a loop with markup and no key (criterion 7)', () => {
  it('reports it on the header span and keeps emitting the rest', () => {
    const source = '@foreach (const r of rows) { <li>@r.n</li> }';
    const { node, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0540');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.span).toEqual(headerSpan(source));
    // The construct is still there, body and all: the parser degrades, it does not abort.
    const loop = node as ForeachNode;
    expect(loop.key).toBeUndefined();
    expect(loop.body.some((n) => n.type === 'element')).toBe(true);
  });

  it('reports it for @for and for @while too', () => {
    expect(codes('@for (let i = 0; i < n; i++) { <li>x</li> }')).toEqual(['FUD0540']);
    expect(codes('@while (go) { <li>x</li> }')).toEqual(['FUD0540']);
  });

  it('says nothing when the body renders nothing', () => {
    // No rows to reconcile ⇒ no identity to demand. Whitespace, a Razor comment and an
    // `@{ … }` are not markup: none of the three reaches the DOM.
    expect(codes('@foreach (const r of rows) { }')).toEqual([]);
    expect(codes('@foreach (const r of rows) {\n  \n}')).toEqual([]);
    expect(codes('@foreach (const r of rows) { @* nothing here *@ }')).toEqual([]);
    expect(codes('@foreach (const r of rows) { @{ total += r.n; } }')).toEqual([]);
  });

  it('demands one for a body that is only an interpolation', () => {
    expect(codes('@foreach (const r of rows) { @r.n }')).toEqual(['FUD0540']);
  });
});

describe('FUD0541 — a key that holds no expression', () => {
  it('reports an empty key on the header span', () => {
    const source = '@foreach (const r of rows) key () { <li>x</li> }';
    const { diagnostics } = parse(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0541']);
    expect(diagnostics[0]?.span).toEqual(headerSpan(source));
  });

  it('reports a key that is only whitespace', () => {
    expect(codes('@foreach (const r of rows) key (   ) { <li>x</li> }')).toEqual(['FUD0541']);
  });

  it('reports a key with no parenthesis at all, and still parses the body', () => {
    const source = '@foreach (const r of rows) key { <li>x</li> }';
    const { node, diagnostics } = parse(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0541']);
    expect((node as ForeachNode).body.some((n) => n.type === 'element')).toBe(true);
  });

  it('surfaces the balancer FUD0002 when the key group never closes', () => {
    // Unrenumbered, as with the header: an unterminated group is the balancer's to report.
    expect(codes('@foreach (const r of rows) key (r.id')).toEqual([
      'FUD0002',
      'FUD0071',
      'FUD0541',
    ]);
  });

  /**
   * BUG-17 §3.5: the diagnostic is for the author, the node is for the editor, and the two
   * are not the same audience. `key (|)` is exactly what an editor shows the instant `key (`
   * is typed and the `)` auto-closes — so it is the first moment the author wants to be told
   * what may go inside, and a clause the parser threw away leaves nowhere to ask from.
   */
  it('keeps an empty clause in the tree, with a span the editor can ask from', () => {
    const source = '@foreach (const r of rows) key () { <li>x</li> }';
    const loop = parse(source).node as Loop;

    expect(loop.key).toBeDefined();
    expect(text(source, loop.key!.span)).toBe('key ()');
    // Empty, and sitting between the parentheses: where the caret is.
    expect(loop.key!.expr).toEqual({ start: source.indexOf('key (') + 5, end: source.indexOf('key (') + 5 });
  });

  it('keeps a whitespace-only clause the same way', () => {
    const source = '@foreach (const r of rows) key (   ) { <li>x</li> }';
    const loop = parse(source).node as Loop;

    expect(loop.key).toBeDefined();
    expect(text(source, loop.key!.expr)).toBe('');
  });

  it('degrades an unclosed clause to the caret, not to the rest of the file', () => {
    // The balancer runs an unterminated group to EOF, and none of that is the author's key.
    const source = '@foreach (const r of rows) key (r.id';
    const loop = parse(source).node as Loop;

    expect(loop.key).toBeDefined();
    expect(text(source, loop.key!.expr)).toBe('');
    expect(loop.key!.expr.start).toBe(source.indexOf('key (') + 5);
  });

  it('leaves the key absent when the clause never opened a parenthesis', () => {
    // Nothing was opened, so there is no inside — an empty span here would point at prose.
    expect((parse('@foreach (const r of rows) key { <li>x</li> }').node as Loop).key).toBeUndefined();
  });

  it('does not mistake an identifier that merely starts with `key` for the clause', () => {
    // `keys` is not `key`: the clause matches on a word boundary. So nothing is consumed
    // and the `{` the body needs is the one that goes missing.
    expect(codes('@foreach (const r of rows) keys (r.id) { <li>x</li> }')).toEqual(['FUD0071']);
  });
});

describe('FUD0542 — a key where nothing iterates (criterion 9, decision 94)', () => {
  it('reports it on an @if and still parses the branch body', () => {
    const source = '@if (x) key (1) { <p>a</p> }';
    const { node, diagnostics } = parse(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0542']);
    expect(diagnostics[0]?.span).toEqual(headerSpan(source));
    const node2 = node as IfNode;
    expect(node2.branches[0]?.body.some((n) => n.type === 'element')).toBe(true);
    // Written down even though it is an error: the node describes what the author typed.
    expect(text(source, node2.key!.span)).toBe('key (1)');
  });

  it('reports it on an `else if` arm', () => {
    expect(codes('@if (x) { <p>a</p> } else if (y) key (2) { <p>b</p> }')).toEqual(['FUD0542']);
  });

  it('reports it on a @switch and still parses the labels', () => {
    const source = '@switch (t) key (t) { case 1: <p>a</p> default: <p>b</p> }';
    const { node, diagnostics } = parse(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0542']);
    expect(diagnostics[0]?.span).toEqual(headerSpan(source));
    expect((node as SwitchNode).cases).toHaveLength(2);
  });

  it('reports one diagnostic per key, not one per construct', () => {
    // Two arms, two keys: each is its own mistake and each gets its own span.
    const codesOf = codes('@if (x) key (1) { <p>a</p> } else if (y) key (2) { <p>b</p> }');
    expect(codesOf).toEqual(['FUD0542', 'FUD0542']);
  });
});

/**
 * The predicate that separates the two audiences (BUG-17 §3.5).
 *
 * The field alone cannot answer «is there JS here»: an opened-but-empty clause is a real
 * node with an empty span, wanted by the editor and poison to anything that generates code
 * — `key: ` is not JavaScript. One predicate owns the distinction so that no emitter
 * re-invents it, and these are the three answers it can give.
 */
describe('keyExpression', () => {
  it('gives back the span of a key that was written', () => {
    const source = '@foreach (const r of rows) key (r.id) { <li>x</li> }';

    expect(text(source, keyExpression(parse(source).node as Loop)!)).toBe('r.id');
  });

  it('gives nothing for a clause that opened and holds nothing', () => {
    const loop = parse('@foreach (const r of rows) key () { <li>x</li> }').node as Loop;

    expect(loop.key).toBeDefined();
    expect(keyExpression(loop)).toBeUndefined();
  });

  it('gives nothing when there is no clause at all', () => {
    expect(keyExpression(parse('@foreach (const r of rows) { <li>x</li> }').node as Loop)).toBeUndefined();
  });
});

describe('nesting', () => {
  it('gives each loop of a nest its own key', () => {
    const source =
      '@foreach (const g of gs) key (g.id) { <ul>@foreach (const r of g.rows) key (r.id) { <li>@r.n</li> }</ul> }';
    const { node, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    const outer = node as ForeachNode;
    expect(text(source, outer.key!.expr)).toBe('g.id');
    const ul = outer.body.find((n) => n.type === 'element');
    const inner = find(ul === undefined ? [] : [ul]) as ForeachNode | null;
    expect(text(source, inner!.key!.expr)).toBe('r.id');
  });
});
