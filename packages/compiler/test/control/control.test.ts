/**
 * SDD-06 acceptance criteria (§6) for the control-flow construct parser.
 *
 * Every test drives a REAL SDD-05 `HtmlParseContext` with SDD-06's `parseControl`
 * wired in, so the recursion through the seam is exercised for real.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseControl } from '../../src/control/index.js';
import type {
  ConditionalBranch,
  ControlNode,
  ForNode,
  ForeachNode,
  IfNode,
  SwitchNode,
  WhileNode,
} from '../../src/control/index.js';
import {
  parseDocument,
  type AtConstructParser,
  type ElementNode,
  type HtmlContent,
  type HtmlParseContext,
} from '../../src/html/index.js';
import { scanBraces } from '../../src/balancer/index.js';
import { Lexer } from '../../src/lexer/index.js';
import { ok, span, type Span } from '../../src/types/index.js';

/** `@code` is SDD-08's; here it is stubbed opaquely so fixtures can be parsed. */
const constructs: AtConstructParser = {
  parseControl,
  parseCodeBlock(ctx, keywordSpan) {
    let at = keywordSpan.end;
    while (/\s/u.test(ctx.source.charAt(at))) at++;
    const end = ctx.source.charAt(at) === '{' ? scanBraces(ctx.source, at).value.span.end : at;
    ctx.lexer.seekTo(end);
    return ok({ type: 'code', span: span(keywordSpan.start, end) });
  },
};

const CONTROL_TYPES: ReadonlySet<string> = new Set(['if', 'for', 'foreach', 'while', 'switch']);

function parse(source: string) {
  return parseDocument(source, { atConstructs: constructs });
}

function codes(source: string): string[] {
  return parse(source).diagnostics.map((d) => d.code);
}

function isControl(node: HtmlContent): node is HtmlContent & ControlNode {
  return CONTROL_TYPES.has(node.type);
}

/** Depth-first search for the first control node in the tree. */
function findControl(nodes: readonly HtmlContent[]): ControlNode | null {
  for (const node of nodes) {
    if (isControl(node)) return node;
    if (node.type === 'element') {
      const nested = findControl(node.children);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function control(source: string): ControlNode {
  const found = findControl(parse(source).value.children);
  if (found === null) throw new Error('no control node in the tree');
  return found;
}

function asIf(source: string): IfNode {
  const node = control(source);
  if (node.type !== 'if') throw new Error(`expected an if, got ${node.type}`);
  return node;
}

function asSwitch(source: string): SwitchNode {
  const node = control(source);
  if (node.type !== 'switch') throw new Error(`expected a switch, got ${node.type}`);
  return node;
}

function text(source: string, at: Span): string {
  return source.slice(at.start, at.end);
}

/** Element children only: bodies also carry the whitespace text runs around them. */
function elements(nodes: readonly HtmlContent[]): ElementNode[] {
  return nodes.filter((n): n is ElementNode => n.type === 'element');
}

function bodyText(source: string, nodes: readonly HtmlContent[]): string {
  return nodes
    .filter((n) => n.type === 'text')
    .map((n) => text(source, n.span))
    .join('');
}

function branchOf(node: IfNode, index: number): ConditionalBranch {
  const branch = node.branches[index];
  if (branch === undefined) throw new Error(`no branch ${index}`);
  return branch;
}

describe('@if (§6.2)', () => {
  const source = '@if (data.items.length === 0) { <p>Vacío</p> }';

  it('builds a single branch with an opaque header and an HTML body', () => {
    const node = asIf(source);
    expect(node.branches).toHaveLength(1);
    const branch = branchOf(node, 0);
    expect(text(source, branch.header.inner)).toBe('data.items.length === 0');
    expect(branch.header.closed).toBe(true);
    expect(elements(branch.body).map((e) => e.name)).toEqual(['p']);
  });

  it('omits elseBody when there is no else', () => {
    const node = asIf(source);
    expect(node.elseBody).toBeUndefined();
    expect('elseBody' in node).toBe(false);
  });

  it('spans the construct from the @ through the closing }', () => {
    const node = asIf(source);
    expect(node.span).toEqual(span(0, source.length));
    // The first arm starts at the same `@`, so there is no hole in the coverage.
    expect(branchOf(node, 0).span).toEqual(span(0, source.length));
    expect(codes(source)).toEqual([]);
  });
});

describe('@if … else (§6.3, decision 10)', () => {
  it('folds a trailing else into elseBody', () => {
    const source = '@if (expanded.value) { Cerrar } else { Abrir }';
    const node = asIf(source);
    expect(node.branches).toHaveLength(1);
    expect(bodyText(source, branchOf(node, 0).body)).toBe(' Cerrar ');
    expect(node.elseBody).toBeDefined();
    expect(bodyText(source, node.elseBody ?? [])).toBe(' Abrir ');
    expect(node.span.end).toBe(source.length);
    expect(codes(source)).toEqual([]);
  });

  it('tolerates whitespace and Razor comments between } and else', () => {
    const source = '@if (a) { x }\n  @* nota *@\n else { y }';
    const node = asIf(source);
    expect(bodyText(source, node.elseBody ?? [])).toBe(' y ');
    expect(codes(source)).toEqual([]);
  });

  it('accepts the else written with an @', () => {
    const source = '@if (a) { x } @else { y }';
    const node = asIf(source);
    expect(bodyText(source, node.elseBody ?? [])).toBe(' y ');
    expect(node.span.end).toBe(source.length);
  });

  it('does not hang on an unterminated Razor comment after the }', () => {
    const source = '@if (a) { x } @* sin cerrar';
    // FUD0011 is the lexer's, raised when SDD-05 tokenizes the comment afterwards.
    expect(codes(source)).toEqual(['FUD0011']);
    expect(asIf(source).elseBody).toBeUndefined();
  });

  it('does not mistake an identifier starting with else for the keyword', () => {
    const source = '@if (a) { x } elsewhere';
    const node = asIf(source);
    expect(node.elseBody).toBeUndefined();
    expect(node.span.end).toBe(13);
  });
});

describe('else if chains (§6.4, decision 9)', () => {
  it('collects each else if as a branch', () => {
    const source = '@if (a) { A } else if (b) { B } else { C }';
    const node = asIf(source);
    expect(node.branches).toHaveLength(2);
    expect(text(source, branchOf(node, 0).header.inner)).toBe('a');
    expect(text(source, branchOf(node, 1).header.inner)).toBe('b');
    expect(bodyText(source, node.elseBody ?? [])).toBe(' C ');
    // The else-if arm starts at its own `else`.
    expect(branchOf(node, 1).span.start).toBe(source.indexOf('else if'));
    expect(codes(source)).toEqual([]);
  });

  it('accepts @else @if as well', () => {
    const source = '@if (a) { A } @else @if (b) { B } @else { C }';
    const node = asIf(source);
    expect(node.branches).toHaveLength(2);
    expect(text(source, branchOf(node, 1).header.inner)).toBe('b');
    expect(bodyText(source, node.elseBody ?? [])).toBe(' C ');
  });

  it('chains three arms with no final else', () => {
    const source = '@if (a) { A } else if (b) { B } else if (c) { C }';
    const node = asIf(source);
    expect(node.branches).toHaveLength(3);
    expect(node.elseBody).toBeUndefined();
    expect(node.span.end).toBe(source.length);
  });
});

describe('@foreach (§6.5, decision 11)', () => {
  const source =
    '@foreach (const item of data.items) key (item.id) { <app-card title="@item.title">@item.description</app-card> }';

  it('keeps the for-of header opaque and recurses into the body', () => {
    const node = control(source);
    expect(node.type).toBe('foreach');
    const loop = node as ForeachNode;
    expect(text(source, loop.header.inner)).toBe('const item of data.items');
    const [card] = elements(loop.body);
    expect(card?.name).toBe('app-card');
    expect(card?.attributes[0]?.value[0]).toMatchObject({ type: 'razor-expression' });
    expect(card?.children.some((c) => c.type === 'razor-expression')).toBe(true);
    expect(codes(source)).toEqual([]);
  });
});

describe('@for and @while (§6.6)', () => {
  it('parses a C-style @for with its header opaque', () => {
    const source = '@for (let i = 0; i < n; i++) key (i) { <li>x</li> }';
    const node = control(source);
    expect(node.type).toBe('for');
    // The `;` of the C-style header stays inside the parenthesis: the key is written
    // OUTSIDE it (decision 93), so the header still reaches Oxc whole.
    expect(text(source, (node as ForNode).header.inner)).toBe('let i = 0; i < n; i++');
    expect(codes(source)).toEqual([]);
  });

  it('parses a @while', () => {
    const source = '@while (cond) key (cond.id) { <li>x</li> }';
    const node = control(source);
    expect(node.type).toBe('while');
    expect(text(source, (node as WhileNode).header.inner)).toBe('cond');
    expect(elements((node as WhileNode).body).map((e) => e.name)).toEqual(['li']);
  });
});

describe('@switch (§6.7, decisions 14, 15)', () => {
  const source = "@switch (variant) { case 'highlight': <b>H</b> default: <span>D</span> }";

  it('builds one independent case per label, with no fall-through', () => {
    const node = asSwitch(source);
    expect(text(source, node.header.inner)).toBe('variant');
    expect(node.cases).toHaveLength(2);

    const [first, second] = node.cases;
    expect(text(source, first?.test ?? span(0, 0))).toBe("'highlight'");
    expect(elements(first?.body ?? []).map((e) => e.name)).toEqual(['b']);

    expect(second?.test).toBeUndefined();
    expect(second !== undefined && 'test' in second).toBe(false);
    expect(elements(second?.body ?? []).map((e) => e.name)).toEqual(['span']);

    expect(node.span).toEqual(span(0, source.length));
    expect(codes(source)).toEqual([]);
  });

  it('gives every case a span that starts at its label', () => {
    const node = asSwitch(source);
    expect(node.cases[0]?.span.start).toBe(source.indexOf('case'));
    expect(node.cases[1]?.span.start).toBe(source.indexOf('default'));
  });

  it('accepts an empty switch body', () => {
    const source = '@switch (x) { }';
    const node = asSwitch(source);
    expect(node.cases).toEqual([]);
    expect(codes(source)).toEqual([]);
  });

  it('accepts back-to-back labels with empty bodies', () => {
    const source = '@switch (x) { case 1: case 2: <b>B</b> }';
    const node = asSwitch(source);
    expect(node.cases).toHaveLength(2);
    expect(elements(node.cases[0]?.body ?? [])).toEqual([]);
    expect(elements(node.cases[1]?.body ?? []).map((e) => e.name)).toEqual(['b']);
  });

  it('nests a switch inside a case body', () => {
    const source = '@switch (a) { case 1: @switch (b) { case 2: <b>B</b> } default: <i>I</i> }';
    const outer = asSwitch(source);
    expect(outer.cases).toHaveLength(2);
    const inner = outer.cases[0]?.body.find((n) => n.type === 'switch') as SwitchNode | undefined;
    expect(inner?.cases).toHaveLength(1);
    expect(codes(source)).toEqual([]);
  });
});

describe('case test delimitation (§6.8, §4.5)', () => {
  /** The `test` span of the single case in `@switch (x) { case <test>: }`. */
  function caseTest(test: string): string {
    const source = `@switch (x) { case ${test}: <b>B</b> }`;
    expect(codes(source)).toEqual([]);
    const node = asSwitch(source);
    return text(source, node.cases[0]?.test ?? span(0, 0));
  }

  it('does not close on the : of a ternary', () => {
    expect(caseTest("cond ? 'a' : 'b'")).toBe("cond ? 'a' : 'b'");
  });

  it('handles nested ternaries', () => {
    expect(caseTest('a ? b ? c : d : e')).toBe('a ? b ? c : d : e');
  });

  it('ignores a : inside parens, brackets, braces and strings', () => {
    expect(caseTest("f(a ? b : c)")).toBe('f(a ? b : c)');
    expect(caseTest("xs[k ? 0 : 1]")).toBe('xs[k ? 0 : 1]');
    expect(caseTest("{ a: 1 }.a")).toBe('{ a: 1 }.a');
    expect(caseTest("':'")).toBe("':'");
    expect(caseTest('":"')).toBe('":"');
  });

  it('ignores a : inside a template literal and its interpolation', () => {
    expect(caseTest('`a:${ x ? 1 : 2 }b`')).toBe('`a:${ x ? 1 : 2 }b`');
  });

  it('ignores a : inside comments', () => {
    expect(caseTest('a /* : */ + b')).toBe('a /* : */ + b');
    expect(caseTest('a + // :\n b')).toBe('a + // :\n b');
  });

  it('ignores a : inside a regex literal, and divides after a value', () => {
    expect(caseTest('/a:b/.source')).toBe('/a:b/.source');
    expect(caseTest('a / b')).toBe('a / b');
  });

  it('does not read ?. or ?? as a ternary', () => {
    expect(caseTest('a?.b')).toBe('a?.b');
    expect(caseTest("a ?? 'z'")).toBe("a ?? 'z'");
  });

  it('accepts a numeric test', () => {
    expect(caseTest('1_000.5')).toBe('1_000.5');
  });

  it('trims the whitespace around the test', () => {
    expect(caseTest('1   ')).toBe('1');
  });

  it('honours backslash escapes in strings, templates and regexes', () => {
    expect(caseTest("'a\\':b'")).toBe("'a\\':b'");
    expect(caseTest('`a\\`:b`')).toBe('`a\\`:b`');
    expect(caseTest('/a\\/[:]b/giu.source')).toBe('/a\\/[:]b/giu.source');
  });

  it('gives up on a literal broken by a line break or by EOF', () => {
    // Unterminated string: the line break ends it, and no label follows.
    expect(codes("@switch (x) { case 'a\n }")).toEqual(['FUD0075']);
    // Unterminated regex: same, and the `/` opens one because no value precedes it.
    expect(codes('@switch (x) { case /abc\n }')).toEqual(['FUD0075']);
    // Unterminated block comment: it swallows the rest of the source.
    expect(codes('@switch (x) { case /* a')).toEqual(['FUD0075', 'FUD0072']);
  });

  it('reports FUD0075 when no label colon is reachable', () => {
    expect(codes('@switch (x) { case 1 <b/> }')).toEqual(['FUD0075']);
    // Unterminated nested group: the balancer runs to EOF, so no colon can follow.
    expect(codes('@switch (x) { case f(1 }')).toContain('FUD0075');
    // Unterminated template, likewise.
    expect(codes('@switch (x) { case `a }')).toContain('FUD0075');
  });

  it('reports FUD0075 for a default with no colon', () => {
    expect(codes('@switch (x) { default <b/> }')).toEqual(['FUD0075']);
  });

  it('keeps the case body parseable after a missing colon', () => {
    const source = '@switch (x) { case 1 <b/> }';
    const node = asSwitch(source);
    expect(node.cases).toHaveLength(1);
    expect(node.cases[0]?.test).toBeUndefined();
    expect(elements(node.cases[0]?.body ?? []).map((e) => e.name)).toEqual(['b']);
  });
});

describe('nesting (§6.9)', () => {
  it('closes every } at its own level', () => {
    const source = '@foreach (const x of xs) key (x.id) { @if (x.active) { <li>@x.name</li> } }';
    const node = control(source);
    expect(node.type).toBe('foreach');
    const inner = (node as ForeachNode).body.find((n) => n.type === 'if') as IfNode | undefined;
    expect(inner).toBeDefined();
    const li = elements(branchOf(inner as IfNode, 0).body);
    expect(li.map((e) => e.name)).toEqual(['li']);
    expect(node.span).toEqual(span(0, source.length));
    expect(codes(source)).toEqual([]);
  });

  it('parses a control inside an element inside a control', () => {
    const source = '@if (a) { <ul>@foreach (const x of xs) key (x) { <li>x</li> }</ul> }';
    const node = asIf(source);
    const ul = elements(branchOf(node, 0).body)[0];
    expect(ul?.name).toBe('ul');
    expect(ul?.children.some((c) => c.type === 'foreach')).toBe(true);
    expect(codes(source)).toEqual([]);
  });
});

describe('literal braces via entities (§6.10, decision 49)', () => {
  it('keeps the entity verbatim and closes on the real }', () => {
    const source = '@if (a) { <p>&#123;x&#125;</p> }';
    const node = asIf(source);
    const p = elements(branchOf(node, 0).body)[0];
    expect(p?.children[0]).toMatchObject({ type: 'text', value: '&#123;x&#125;' });
    expect(node.span).toEqual(span(0, source.length));
    expect(codes(source)).toEqual([]);
  });
});

describe('degradations (§6.11) — the parser never throws', () => {
  it('FUD0070: no ( after the keyword', () => {
    const source = '@if data.x { <p>a</p> }';
    expect(codes(source)).toEqual(['FUD0070']);
    const node = parse(source).value.children.find((c) => c.type === 'if') as IfNode;
    expect(node.branches).toEqual([]);
    expect(node.span).toEqual(span(0, 3));
  });

  it('FUD0070 on a loop keeps a degraded, non-null header', () => {
    const source = '@foreach const x of xs { }';
    expect(codes(source)).toEqual(['FUD0070']);
    const node = parse(source).value.children.find((c) => c.type === 'foreach') as ForeachNode;
    expect(node.header.closed).toBe(false);
    expect(node.header.span).toEqual(span(8, 8));
    expect(node.body).toEqual([]);
  });

  it('FUD0070 on a switch keeps a degraded header and no cases', () => {
    const source = '@switch x { }';
    expect(codes(source)).toEqual(['FUD0070']);
    const node = parse(source).value.children.find((c) => c.type === 'switch') as SwitchNode;
    expect(node.header.closed).toBe(false);
    expect(node.cases).toEqual([]);
  });

  it('FUD0071: no { to open the body', () => {
    const source = '@if (a) <p>x</p>';
    expect(codes(source)).toEqual(['FUD0071']);
    const node = asIf(source);
    expect(node.branches).toHaveLength(1);
    expect(branchOf(node, 0).body).toEqual([]);
  });

  it('FUD0071 on a loop and on a switch', () => {
    expect(codes('@while (a) <p>x</p>')).toEqual(['FUD0071']);
    const source = '@switch (a) case 1: <b/>';
    expect(codes(source)).toEqual(['FUD0071']);
    const node = parse(source).value.children.find((c) => c.type === 'switch') as SwitchNode;
    expect(node.cases).toEqual([]);
  });

  it('FUD0072: block left unclosed at EOF', () => {
    const source = '@if (a) { <p>x</p>';
    expect(codes(source)).toEqual(['FUD0072']);
    const node = asIf(source);
    expect(elements(branchOf(node, 0).body).map((e) => e.name)).toEqual(['p']);
  });

  it('FUD0072: switch body left unclosed at EOF', () => {
    const source = '@switch (a) { case 1: <b>B</b>';
    expect(codes(source)).toEqual(['FUD0072']);
    const node = asSwitch(source);
    expect(node.cases).toHaveLength(1);
  });

  it('the balancer diagnostic for an unclosed header surfaces unrenumbered', () => {
    expect(codes('@if (a + b { x }')).toContain('FUD0002');
    // With markup inside the runaway header the balancer reports the more specific
    // code it hit first (`</p>` reads as a regex literal): SDD-06 renumbers neither.
    expect(codes('@if (a + b { <p>x</p> }')).toContain('FUD0006');
  });

  it('FUD0073: @else with no preceding @if', () => {
    const source = '@else { x }';
    expect(codes(source)).toEqual(['FUD0073']);
    const node = parse(source).value.children.find((c) => c.type === 'if') as IfNode;
    expect(node.branches).toEqual([]);
    expect(node.span).toEqual(span(0, 5));
  });

  it('stops the else chain when the else-if header is missing', () => {
    const source = '@if (a) { A } else if b { B }';
    expect(codes(source)).toEqual(['FUD0070']);
    const node = asIf(source);
    expect(node.branches).toHaveLength(1);
    expect(node.elseBody).toBeUndefined();
  });

  it('stops the else chain when the else body has no {', () => {
    const source = '@if (a) { A } else B';
    expect(codes(source)).toEqual(['FUD0071']);
    const node = asIf(source);
    expect(node.elseBody).toBeUndefined();
  });

  it('FUD0074: content before the first label in a @switch', () => {
    const source = '@switch (x) { <p>oops</p> case 1: <b>B</b> }';
    expect(codes(source)).toEqual(['FUD0074']);
    const node = asSwitch(source);
    expect(node.cases).toHaveLength(1);
  });

  it('FUD0074 never stalls on a close tag owned by an outer element', () => {
    const source = '<div>@switch (x) { </div> }';
    const found = codes(source);
    expect(found).toContain('FUD0074');
    // The div is left unclosed, but the loop terminated: the construct still closed.
    const div = parse(source).value.children.find((c) => c.type === 'element') as ElementNode;
    const node = div.children.find((c) => c.type === 'switch') as SwitchNode;
    expect(node.span.end).toBe(source.length);
  });

  it('skips whitespace and Razor comments before the first label', () => {
    const source = '@switch (x) {\n  @* nada *@\n  case 1: <b>B</b>\n}';
    expect(codes(source)).toEqual([]);
    expect(asSwitch(source).cases).toHaveLength(1);
  });
});

describe('offset derivation of the construct start', () => {
  it('falls back to the keyword when there is no leading @', () => {
    // Direct call: nothing in the pipeline produces this, but the derivation must not
    // read the character before the keyword blindly.
    const source = 'if (a) { x }';
    const lexer = new Lexer(source);
    const ctx: HtmlParseContext = {
      source,
      lexer,
      parseContentUntil: () => ok([]),
    };
    const result = parseControl(ctx, 'if', span(0, 2));
    expect(result.value.span.start).toBe(0);
  });
});

describe('fixtures', () => {
  function fixture(name: string): string {
    return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
  }

  it('parses the @if/else of app-card.fud with no control diagnostics', () => {
    const source = fixture('app-card.fud');
    const result = parse(source);
    expect(result.diagnostics.filter((d) => d.code.startsWith('FUD007'))).toEqual([]);
    const node = findControl(result.value.children);
    expect(node?.type).toBe('if');
  });

  it('parses the @if/else + nested @foreach of home.fud', () => {
    const source = fixture('home.fud');
    const result = parse(source);
    expect(result.diagnostics.filter((d) => d.code.startsWith('FUD007'))).toEqual([]);
    const node = findControl(result.value.children);
    expect(node?.type).toBe('if');
    const ifNode = node as IfNode;
    expect(ifNode.branches).toHaveLength(1);
    expect(ifNode.elseBody).toBeDefined();
    const section = elements(ifNode.elseBody ?? [])[0];
    expect(section?.name).toBe('section');
    expect(section?.children.some((c) => c.type === 'foreach')).toBe(true);
  });
});
