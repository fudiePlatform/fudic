/**
 * SDD-29 §6.1–§6.3 at the PARSER level: the two keywords SDD-04 now reserves, the
 * declaration with its signature and its block, and the invocation with its arguments.
 *
 * Every degradation is a diagnostic and never an exception, and the cursor always advances —
 * the two properties that separate a language server from a batch compiler.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { classifySnippet, resolveTrigger } from '../../src/at/index.js';
import type { HtmlContent } from '../../src/html/index.js';
import type { Diagnostic } from '../../src/types/index.js';
import type { NamedArg, PositionalArg, RenderCallNode, SnippetDeclNode } from '../../src/snippet/index.js';

function parse(source: string): { nodes: readonly HtmlContent[]; codes: readonly string[] } {
  const result = parseDocument(source, { atConstructs });
  return { nodes: result.value.children, codes: result.diagnostics.map((d: Diagnostic) => d.code) };
}

/** The first node of `type` anywhere in the tree. */
function find(nodes: readonly HtmlContent[], type: string): HtmlContent | undefined {
  for (const node of nodes) {
    if (node.type === type) return node;
    const children = (node as { children?: readonly HtmlContent[] }).children;
    if (children) {
      const hit = find(children, type);
      if (hit) return hit;
    }
  }
  return undefined;
}

const decl = (source: string): SnippetDeclNode =>
  find(parse(source).nodes, 'snippet') as unknown as SnippetDeclNode;
const call = (source: string): RenderCallNode =>
  find(parse(source).nodes, 'render') as unknown as RenderCallNode;
const text = (source: string, sp: { start: number; end: number }): string =>
  source.slice(sp.start, sp.end);

describe('classifySnippet', () => {
  it('reserves exactly the two snippet keywords', () => {
    expect(classifySnippet('snippet')).toBe('snippet');
    expect(classifySnippet('render')).toBe('render');
    expect(classifySnippet('Render')).toBeNull();
    expect(classifySnippet('snippets')).toBeNull();
  });

  it('resolves them ahead of the implicit expression, so neither degrades to text', () => {
    const resolution = resolveTrigger('@snippet card() { }', 0).value;
    expect(resolution.kind).toBe('snippet-directive');
    // `@snippet` with nothing behind it is still the keyword: a malformed declaration has to
    // be a diagnostic and not the interpolation of a variable called `snippet`.
    expect(resolveTrigger('@snippet', 0).value.kind).toBe('snippet-directive');
  });
});

describe('@snippet: the declaration (§4.1)', () => {
  it('parses a name, a typed signature and a body of one element (criterion 1)', () => {
    const source = '@snippet card(title: string) { <article><h2>@title</h2></article> }';
    const node = decl(source);
    expect(node.type).toBe('snippet');
    expect(node.name).toBe('card');
    expect(text(source, node.nameSpan)).toBe('card');
    expect(text(source, node.signature)).toBe('title: string');
    expect(text(source, node.signatureSpan)).toBe('(title: string)');
    expect(node.children.filter((c) => c.type === 'element')).toHaveLength(1);
    // The node covers the whole construct, leading `@` included.
    expect(text(source, node.span)).toBe(source);
  });

  it('takes an empty signature', () => {
    const node = decl('@snippet spacer() { <hr> }');
    expect(node.name).toBe('spacer');
    expect(node.signature.start).toBe(node.signature.end);
  });

  it('holds control flow in its body (criterion 31)', () => {
    const node = decl('@snippet rows(items: string[]) { @foreach (const i of items) { <li>@i</li> } }');
    expect(find(node.children, 'foreach')).toBeDefined();
  });

  it('is position-free at the top level (criterion 32)', () => {
    const before = parse('@snippet a() { <i></i> }\n<link rel="component" href="./x.fud">');
    const after = parse('<link rel="component" href="./x.fud">\n@snippet a() { <i></i> }');
    expect(before.codes).toEqual([]);
    expect(after.codes).toEqual([]);
  });

  it('steps over a Razor comment between the keyword and the name', () => {
    const parsed = parse('@snippet @* the card *@ card() { <i></i> }');
    expect(parsed.codes).toEqual([]);
    const node = find(parsed.nodes, 'snippet') as unknown as SnippetDeclNode;
    expect(node.name).toBe('card');
  });

  it('does not hang on an unterminated Razor comment: it runs to the end and reports', () => {
    const parsed = parse('@snippet @* card() { <i></i> }');
    expect(parsed.codes).toContain('FUD0820');
  });

  it('reports a missing name and still advances (FUD0820)', () => {
    const parsed = parse('@snippet () { <i></i> }');
    expect(parsed.codes).toContain('FUD0820');
    expect(find(parsed.nodes, 'snippet')).toBeDefined();
  });

  it('reports a hyphenated name whole, rather than cutting it (FUD0820)', () => {
    const source = '@snippet my-card() { <i></i> }';
    const parsed = parse(source);
    expect(parsed.codes).toContain('FUD0820');
    const node = find(parsed.nodes, 'snippet') as unknown as SnippetDeclNode;
    expect(node.name).toBe('');
    expect(text(source, node.nameSpan)).toBe('my-card');
  });

  it('reports a missing signature (FUD0821)', () => {
    expect(parse('@snippet card { <i></i> }').codes).toContain('FUD0821');
  });

  it('reports a missing body with the shared block code (FUD0071)', () => {
    expect(parse('@snippet card()').codes).toContain('FUD0071');
  });

  it('reports an unclosed body (FUD0072)', () => {
    expect(parse('@snippet card() { <i></i>').codes).toContain('FUD0072');
  });
});

describe('@render: the invocation (§4.7)', () => {
  it('parses a name with no arguments', () => {
    const node = call('<p>@render card()</p>');
    expect(node.name).toBe('card');
    expect(node.namespace).toBeUndefined();
    expect(node.args).toEqual([]);
  });

  it('parses a namespace (criterion 17)', () => {
    const source = '<p>@render form.card("A")</p>';
    const node = call(source);
    expect(node.namespace).toBe('form');
    expect(node.name).toBe('card');
    expect(text(source, node.namespaceSpan!)).toBe('form');
  });

  it('mixes positional and named arguments (criterion 9)', () => {
    const source = `<p>@render card("A", variant: 'b')</p>`;
    const node = call(source);
    expect(node.args).toHaveLength(2);
    expect(node.args[0]!.type).toBe('positional-arg');
    expect(text(source, (node.args[0] as PositionalArg).value)).toBe('"A"');
    const named = node.args[1] as NamedArg;
    expect(named.type).toBe('named-arg');
    expect(named.name).toBe('variant');
    expect(text(source, named.value)).toBe(`'b'`);
  });

  it('trims each argument to its expression, whitespace on both sides', () => {
    const source = '<p>@render card( "A" , tone :  b )</p>';
    const node = call(source);
    expect(text(source, (node.args[0] as PositionalArg).value)).toBe('"A"');
    expect(text(source, (node.args[1] as NamedArg).value)).toBe('b');
  });

  it('splits at top-level commas only', () => {
    const source = '<p>@render card(f(a, b), [1, 2], { a: 1 }, "x,y")</p>';
    expect(call(source).args).toHaveLength(4);
  });

  it('does not mistake a ternary for a named argument', () => {
    const source = `<p>@render card(ok ? 'a' : 'b')</p>`;
    const node = call(source);
    expect(node.args).toHaveLength(1);
    expect(node.args[0]!.type).toBe('positional-arg');
  });

  it('reports a positional argument after a named one (criterion 10, FUD0832)', () => {
    expect(parse(`<p>@render card(variant: 'b', "A")</p>`).codes).toContain('FUD0832');
  });

  it('reports an @ inside the header (criterion 13, FUD0833)', () => {
    const source = '<p>@render card(@title)</p>';
    const parsed = parse(source);
    expect(parsed.codes).toContain('FUD0833');
  });

  it('does not see an @ that lives inside a string of the header', () => {
    expect(parse(`<p>@render card("a@b")</p>`).codes).not.toContain('FUD0833');
  });

  it('reports a missing argument list (FUD0821)', () => {
    expect(parse('<p>@render card</p>').codes).toContain('FUD0821');
  });

  it('carries the balancer diagnostic of an argument list that never closes', () => {
    expect(parse('<p>@render card(a').codes).toContain('FUD0002');
  });

  it('drops an empty piece between two commas instead of inventing an argument', () => {
    const node = call('<p>@render card("A", , "B")</p>');
    expect(node.args).toHaveLength(2);
  });

  it('is literal text inside an attribute value', () => {
    const parsed = parse('<p title="@render card()"></p>');
    expect(find(parsed.nodes, 'render')).toBeUndefined();
  });
});
