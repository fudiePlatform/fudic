/**
 * SDD-05 acceptance criteria (§6) for the strict-subset HTML parser.
 */

import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  type AtConstructParser,
  type Attribute,
  type ElementNode,
  type HtmlContent,
  type HtmlParseContext,
} from '../../src/html/index.js';
import { scanBraces, scanParens } from '../../src/balancer/index.js';
import { ok, span, type Span } from '../../src/types/index.js';

function parse(source: string, atConstructs?: AtConstructParser) {
  return atConstructs === undefined
    ? parseDocument(source)
    : parseDocument(source, { atConstructs });
}

function codes(source: string, atConstructs?: AtConstructParser): string[] {
  return parse(source, atConstructs).diagnostics.map((d) => d.code);
}

/** First child of the document, asserted to be an element. */
function firstElement(source: string): ElementNode {
  const child = parse(source).value.children.find((c) => c.type === 'element');
  if (child === undefined) throw new Error('no element');
  return child as ElementNode;
}

function text(source: string, at: Span): string {
  return source.slice(at.start, at.end);
}

/**
 * A stand-in for SDD-06/08, exercising the injection seam for real: control bodies
 * go through `parseContentUntil`, and `@code` is balanced opaquely the way SDD-08
 * will do it.
 */
function makeConstructParser(): {
  parser: AtConstructParser;
  calls: { method: string; keyword: string; keywordSpan: Span }[];
} {
  const calls: { method: string; keyword: string; keywordSpan: Span }[] = [];

  const skipWhitespace = (source: string, from: number): number => {
    let i = from;
    while (i < source.length && /\s/u.test(source[i] ?? '')) i++;
    return i;
  };

  const parser: AtConstructParser = {
    parseControl(ctx: HtmlParseContext, keyword, keywordSpan) {
      calls.push({ method: 'parseControl', keyword, keywordSpan });
      let at = skipWhitespace(ctx.source, keywordSpan.end);
      if (ctx.source[at] === '(') {
        at = scanParens(ctx.source, at).value.span.end;
        at = skipWhitespace(ctx.source, at);
      }
      const children: HtmlContent[] = [];
      if (ctx.source[at] === '{') {
        ctx.lexer.seekTo(at + 1);
        children.push(...ctx.parseContentUntil((t) => t.type === 'block-end').value);
        if (ctx.lexer.peek().type === 'block-end') ctx.lexer.next();
      }
      return ok({ type: keyword, span: span(keywordSpan.start, ctx.lexer.offset), children });
    },

    parseCodeBlock(ctx: HtmlParseContext, keywordSpan) {
      calls.push({ method: 'parseCodeBlock', keyword: 'code', keywordSpan });
      const at = skipWhitespace(ctx.source, keywordSpan.end);
      let end = keywordSpan.end;
      if (ctx.source[at] === '{') end = scanBraces(ctx.source, at).value.span.end;
      ctx.lexer.seekTo(end);
      return ok({ type: 'code', span: span(keywordSpan.start, end) });
    },
  };

  return { parser, calls };
}

describe('simple elements (§6.2, §6.3)', () => {
  it('parses an element with its open and close spans', () => {
    const source = '<slot></slot>';
    const el = firstElement(source);
    expect(el).toMatchObject({ name: 'slot', kind: 'normal', namespace: 'html' });
    expect(el.attributes).toEqual([]);
    expect(el.children).toEqual([]);
    expect(el.openSpan).toEqual(span(0, 6));
    expect(el.closeSpan).toEqual(span(6, 13));
    expect(el.span).toEqual(span(0, 13));
  });

  it('nests elements and keeps spans enclosed', () => {
    const source = '<div class="body"><slot></slot></div>';
    const div = firstElement(source);
    expect(div.name).toBe('div');
    expect(div.attributes).toHaveLength(1);
    const attr = div.attributes[0]!;
    expect(attr.name).toBe('class');
    expect(attr.value).toHaveLength(1);
    expect(attr.value[0]).toMatchObject({ type: 'attribute-text', value: 'body' });

    const slot = div.children[0] as ElementNode;
    expect(slot.name).toBe('slot');
    expect(div.span.start).toBeLessThanOrEqual(slot.span.start);
    expect(div.span.end).toBeGreaterThanOrEqual(slot.span.end);
  });

  it('keeps text children verbatim (decision 49)', () => {
    const source = '<p>Hola &amp; adios</p>';
    const p = firstElement(source);
    expect(p.children).toHaveLength(1);
    expect(p.children[0]).toMatchObject({ type: 'text', value: 'Hola &amp; adios' });
  });
});

describe('void elements (§6.4, decision 39)', () => {
  it('parses a void element with no close span', () => {
    const el = firstElement('<meta charset="utf-8">');
    expect(el.kind).toBe('void');
    expect(el.children).toEqual([]);
    expect(el.closeSpan).toBeUndefined();
    expect('closeSpan' in el).toBe(false);
  });

  it('does not look for a close tag after a void element', () => {
    const source = '<div><br>text</div>';
    const div = firstElement(source);
    expect(div.children.map((c) => c.type)).toEqual(['element', 'text']);
    expect(codes(source)).toEqual([]);
  });

  it('reports FUD0053 for an explicit void close tag', () => {
    expect(codes('</br>')).toEqual(['FUD0053']);
  });
});

describe('self-closing (§6.5, decision 40)', () => {
  it('parses a self-closing element', () => {
    const el = firstElement('<div/>');
    expect(el.kind).toBe('self-closing');
    expect(el.children).toEqual([]);
    expect(el.closeSpan).toBeUndefined();
    expect(el.span).toEqual(span(0, 6));
  });

  it('keeps attributes on a self-closing element', () => {
    const el = firstElement('<app-icon name="x"/>');
    expect(el.kind).toBe('self-closing');
    expect(el.attributes[0]).toMatchObject({ name: 'name' });
  });
});

describe('raw elements (§6.6, decision 43)', () => {
  it('keeps a script body opaque, @ included', () => {
    const source = '<script>const x=@y;</script>';
    const el = firstElement(source);
    expect(el.kind).toBe('raw');
    expect(el.children).toHaveLength(1);
    expect(el.children[0]).toMatchObject({
      type: 'raw-text',
      element: 'script',
      value: 'const x=@y;',
    });
    expect(text(source, el.closeSpan!)).toBe('</script>');
  });

  it('parses a style body into a StyleNode (SDD-09 wired in)', () => {
    const source = '<style>:host{}</style>';
    const el = firstElement(source);
    // The element is still lexically raw, but its child is the parsed CSS, not
    // opaque text: parseStyle runs inside the parser now (SDD-05 §4.4).
    expect(el.kind).toBe('raw');
    const body = el.children[0]!;
    expect(body.type).toBe('style-content');
    if (body.type !== 'style-content') throw new Error('unreachable');
    expect(body.parts.map((p) => p.type)).toEqual(['css-text']);
    expect(text(source, body.span)).toBe(':host{}');
  });

  it('interpolates a Razor expression inside a style body', () => {
    const source = '<style>.a{color:@brand}</style>';
    const el = firstElement(source);
    const body = el.children[0]!;
    if (body.type !== 'style-content') throw new Error('unreachable');
    expect(body.parts.map((p) => p.type)).toEqual(['css-text', 'razor-expression', 'css-text']);
  });

  it('handles an empty raw body', () => {
    const el = firstElement('<script></script>');
    expect(el.kind).toBe('raw');
    expect(el.children).toEqual([]);
    expect(el.closeSpan).toBeDefined();
  });

  it('reports an unterminated raw element as unclosed', () => {
    expect(codes('<script>a')).toEqual(['FUD0014', 'FUD0052']);
  });
});

describe('attributes (§6.7, §6.8, decisions 44, 47)', () => {
  it('preserves order and treats boolean attributes as empty values', () => {
    const el = firstElement('<input disabled required>');
    expect(el.attributes.map((a) => a.name)).toEqual(['disabled', 'required']);
    expect(el.attributes.every((a) => a.value.length === 0)).toBe(true);
  });

  it('gives an empty value the same AST as a boolean attribute (decision 44)', () => {
    const boolean = firstElement('<input disabled>').attributes[0]!;
    const empty = firstElement('<input disabled="">').attributes[0]!;
    expect(boolean.value).toEqual([]);
    expect(empty.value).toEqual([]);
  });

  it('keeps duplicate attributes, leaving detection to SDD-12 (decision 45)', () => {
    const el = firstElement('<a x="1" x="2">');
    expect(el.attributes).toHaveLength(2);
  });

  it('reads an implicit interpolation in a value', () => {
    const source = '<app-card title="@item.title"></app-card>';
    const attr = firstElement(source).attributes[0]!;
    expect(attr.name).toBe('title');
    expect(attr.value).toHaveLength(1);
    const part = attr.value[0]!;
    expect(part.type).toBe('razor-expression');
    if (part.type !== 'razor-expression') throw new Error('unreachable');
    expect(text(source, part.expr)).toBe('item.title');
  });

  it('keeps a class: name verbatim and reads an explicit expression', () => {
    const source = `<a class:highlight="@(variant === 'highlight')"></a>`;
    const attr = firstElement(source).attributes[0]!;
    expect(attr.name).toBe('class:highlight');
    const part = attr.value[0]!;
    if (part.type !== 'razor-expression') throw new Error('unreachable');
    expect(part.kind).toBe('explicit');
    expect(text(source, part.expr)).toBe("variant === 'highlight'");
  });

  it('concatenates mixed literal and expression parts (decision 20)', () => {
    const source = '<a title="Hola @name!"></a>';
    const attr = firstElement(source).attributes[0]!;
    expect(attr.value.map((p) => p.type)).toEqual([
      'attribute-text',
      'razor-expression',
      'attribute-text',
    ]);
  });

  it('resolves @@ in a value to a literal @ (decision 1)', () => {
    // `@@` outranks the email lookbehind, so this is the literal `a@b`.
    const attr = firstElement('<a title="a@@b"></a>').attributes[0]!;
    expect(attr.value.map((p) => p.type)).toEqual([
      'attribute-text',
      'attribute-text',
      'attribute-text',
    ]);
    expect(attr.value.map((p) => (p.type === 'attribute-text' ? p.value : ''))).toEqual([
      'a',
      '@',
      'b',
    ]);
  });

  it('keeps a real email in a value as one literal run (decision 7)', () => {
    const attr = firstElement('<a title="soporte@fudic.dev"></a>').attributes[0]!;
    expect(attr.value).toHaveLength(1);
    expect(attr.value[0]).toMatchObject({ type: 'attribute-text', value: 'soporte@fudic.dev' });
  });

  it('accepts whitespace around the equals sign', () => {
    const attr = firstElement('<a title = "x"></a>').attributes[0]!;
    expect(attr.name).toBe('title');
    expect(attr.value[0]).toMatchObject({ value: 'x' });
  });

  it('ends the value at EOF when the closing quote is missing', () => {
    const result = parse('<a b="c');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0015', 'FUD0052']);
    const attr = (result.value.children[0] as ElementNode).attributes[0]!;
    expect(attr.value[0]).toMatchObject({ type: 'attribute-text', value: 'c' });
  });

  it('ignores a Razor atom that cannot be a value part', () => {
    // `@{ ... }` has no meaning in value position: it contributes no part, and the
    // surrounding literal text still does.
    const attr = firstElement('<a b="x @{ y }z"></a>').attributes[0]!;
    expect(attr.value.map((p) => p.type)).toEqual(['attribute-text', 'attribute-text']);
    expect(attr.value.map((p) => (p.type === 'attribute-text' ? p.value : ''))).toEqual([
      'x ',
      'z',
    ]);
  });

  it('degrades a control keyword in value position to literal text', () => {
    const attr = firstElement('<a b="@if z"></a>').attributes[0]!;
    expect(attr.value[0]).toMatchObject({ type: 'attribute-text', value: '@if' });
  });

  it('accepts single-quoted values', () => {
    const attr = firstElement("<a title='x'></a>").attributes[0]!;
    expect(attr.value[0]).toMatchObject({ value: 'x' });
  });
});

describe('bus: subscriber (§6.8.b, decision 28.a/b)', () => {
  it('keeps the literal form as a string name', () => {
    const attr = firstElement('<a bus:carrito="@onCarrito"></a>').attributes[0]!;
    expect(attr.name).toBe('bus:carrito');
  });

  it('reads the expression form as a RazorExpression name', () => {
    const source = '<a bus:(EVENTOS.carrito)="@h"></a>';
    const attr = firstElement(source).attributes[0]!;
    expect(typeof attr.name).not.toBe('string');
    const name = attr.name as Exclude<Attribute['name'], string>;
    expect(name.type).toBe('razor-expression');
    expect(text(source, name.expr)).toBe('EVENTOS.carrito');
  });

  it('keeps a host event name verbatim (decision 29)', () => {
    const attr = firstElement('<a @click="@onClick"></a>').attributes[0]!;
    expect(attr.name).toBe('@click');
  });
});

describe('the call suffix of a handler value (decision 99)', () => {
  /** The lone value part of the first attribute, as source text. */
  const value = (source: string): { parts: number; text: string } => {
    const parts = firstElement(source).attributes[0]!.value;
    const only = parts[0]!;
    return {
      parts: parts.length,
      text: only.type === 'attribute-text' ? only.value : text(source, only.expr),
    };
  };

  it('takes `@del($event, item.id)` as ONE expression in an event binding', () => {
    // Without this the value came apart into the path `del` and the literal text
    // `($event, item.id)`, which is FUD0092 and a listener that never sees the data.
    const source = '<a @click="@del($event, item.id)"></a>';
    expect(value(source)).toEqual({ parts: 1, text: 'del($event, item.id)' });
    expect(codes(source)).toEqual([]);
  });

  it('takes it in a bus subscription too, in both forms of the name', () => {
    expect(value('<a bus:carrito="@onCarrito($event)"></a>').text).toBe('onCarrito($event)');
    expect(value('<a bus:(EVENTOS.carrito)="@onCarrito($event)"></a>').text).toBe(
      'onCarrito($event)',
    );
  });

  it('is the balancer that closes it, so a `)` inside a string does not', () => {
    expect(value(`<a @click="@del('a)b')"></a>`).text).toBe(`del('a)b')`);
  });

  it('requires the `(` to be adjacent, like `@raw(`', () => {
    // An implicit expression never crosses whitespace: this is the path `del`, and the
    // rest is text the value carries as its second part.
    expect(value('<a @click="@del ($event)"></a>')).toEqual({ parts: 2, text: 'del' });
  });

  it('reports an unterminated call and degrades, never throws', () => {
    // The balancer's own unterminated-group diagnostic, carried up by the trigger.
    expect(codes('<a @click="@del($event"></a>')).toContain('FUD0003');
  });

  it('does NOT apply outside a handler value: elsewhere a `(` still stops the path', () => {
    // In an ordinary attribute, and in content, `@total(x)` is the interpolation `total`
    // followed by the literal `(x)` — which is what it means today (decision 29).
    expect(value('<a title="@total(2)"></a>')).toEqual({ parts: 2, text: 'total' });
    const content = parse('<a>@total(2)</a>').value;
    const el = content.children.find((c) => c.type === 'element') as ElementNode;
    const first = el.children[0]!;
    expect(text('<a>@total(2)</a>', (first as { expr: Span }).expr)).toBe('total');
  });
});

describe('unquoted values (§4.6, decision 8)', () => {
  it('reports FUD0056 and recovers with the run as verbatim text', () => {
    const source = '<a href=@url>x</a>';
    const result = parse(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0056']);
    const attr = (result.value.children[0] as ElementNode).attributes[0]!;
    expect(attr.name).toBe('href');
    expect(attr.value[0]).toMatchObject({ type: 'attribute-text', value: '@url' });
  });

  it('reports FUD0056 for a bare literal value too', () => {
    expect(codes('<a href=algo></a>')).toEqual(['FUD0056']);
  });

  it('reports FUD0056 when no value follows the equals sign', () => {
    expect(codes('<a href=>x</a>')).toEqual(['FUD0056']);
  });
});

describe('@ in content (§6.9, §6.10)', () => {
  it('parses an implicit interpolation as a child', () => {
    const source = '<h2>@title</h2>';
    const el = firstElement(source);
    expect(el.children).toHaveLength(1);
    const child = el.children[0]!;
    expect(child.type).toBe('razor-expression');
    if (child.type !== 'razor-expression') throw new Error('unreachable');
    expect(text(source, child.expr)).toBe('title');
  });

  it('parses a member chain and the following text separately', () => {
    const source = '<h1>@data.title!</h1>';
    const el = firstElement(source);
    expect(el.children.map((c) => c.type)).toEqual(['razor-expression', 'text']);
    expect(el.children[1]).toMatchObject({ value: '!' });
  });

  it('parses the Razor atoms', () => {
    expect(parse('@@').value.children[0]).toMatchObject({ type: 'at-escape' });
    expect(parse('@* nota *@').value.children[0]).toMatchObject({ type: 'razor-comment' });
    const inline = parse('@{ const n = 1; }').value.children[0]!;
    expect(inline.type).toBe('inline-code');
    if (inline.type !== 'inline-code') throw new Error('unreachable');
    expect(inline.group.closed).toBe(true);
  });

  it('parses @raw( ... ) as a raw expression node', () => {
    const source = '<p>@raw(post.body)</p>';
    const child = firstElement(source).children[0]!;
    expect(child.type).toBe('raw-expression');
    if (child.type !== 'raw-expression') throw new Error('unreachable');
    expect(text(source, child.expr.expr)).toBe('post.body');
  });

  it('surfaces a balancer diagnostic from an unterminated explicit expression', () => {
    // The balancer runs off the end of the file, so the markup after it is scanned
    // as JS: `</p>` reads as a regex literal and the specific code is FUD0006, not
    // the generic FUD0002. That is the documented regex-vs-division edge of SDD-02
    // §4.4 — the point here is that the diagnostic is located and the parser
    // recovers rather than throwing.
    const result = parse('<p>@(a + b</p>');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0006', 'FUD0052']);
    expect(result.value.children[0]).toMatchObject({ type: 'element', name: 'p' });
  });

  it('reports FUD0002 when nothing after the @( looks like a regex', () => {
    expect(codes('<p>@(a + b')).toContain('FUD0002');
  });
});

describe('construct delegation (§6.11, DIP)', () => {
  it('delegates a control construct and stores the returned node', () => {
    const { parser, calls } = makeConstructParser();
    const source = '<div>@if (expanded.value) { <p>x</p> }</div>';
    const div = parse(source, parser).value.children[0] as ElementNode;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'parseControl', keyword: 'if' });
    expect(text(source, calls[0]!.keywordSpan)).toBe('if');

    const construct = div.children.find((c) => c.type === 'if');
    expect(construct).toBeDefined();
    expect(codes(source, parser)).toEqual([]);
  });

  it('lets the sub-parser fill the body through parseContentUntil', () => {
    const { parser } = makeConstructParser();
    const source = '@if (x) { <p>a</p><b>c</b> }';
    const construct = parse(source, parser).value.children[0] as unknown as {
      type: string;
      children: HtmlContent[];
    };
    expect(construct.type).toBe('if');
    const elements = construct.children.filter((c) => c.type === 'element') as ElementNode[];
    expect(elements.map((e) => e.name)).toEqual(['p', 'b']);
  });

  it('delegates @code to parseCodeBlock', () => {
    const { parser, calls } = makeConstructParser();
    const source = '@code { const a = 1; }';
    const node = parse(source, parser).value.children[0]!;
    expect(node.type).toBe('code');
    expect(calls[0]).toMatchObject({ method: 'parseCodeBlock', keyword: 'code' });
  });

  it('degrades to FUD0055 with no injected parser', () => {
    const result = parse('@if (x) { <p>a</p> }');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0055']);
    expect(result.value.children[0]).toMatchObject({
      type: 'unhandled-construct',
      keyword: 'if',
    });
  });

  it('degrades @code the same way', () => {
    const result = parse('@code { }');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0055']);
    expect(result.value.children[0]).toMatchObject({
      type: 'unhandled-construct',
      keyword: 'code',
    });
  });
});

describe('comments, doctype and document mode (§6.12, §6.13, decision 51)', () => {
  it('parses an HTML comment with its inner text', () => {
    const node = parse('<!-- x -->').value.children[0]!;
    expect(node).toMatchObject({ type: 'comment', value: ' x ' });
  });

  it('detects page mode from a leading doctype', () => {
    const result = parse('<!DOCTYPE html>\n<html></html>');
    expect(result.value.mode).toBe('page');
    expect(result.value.children[0]).toMatchObject({ type: 'doctype' });
  });

  it('detects page mode with leading whitespace', () => {
    expect(parse('\n  <!DOCTYPE html>').value.mode).toBe('page');
  });

  it('detects component mode and allows several top-level roots', () => {
    const source = '<link rel="component" href="./a.fud">\n<app-x>hi</app-x>';
    const result = parse(source);
    expect(result.value.mode).toBe('component');
    const roots = result.value.children.filter((c) => c.type === 'element') as ElementNode[];
    expect(roots.map((e) => e.name)).toEqual(['link', 'app-x']);
    expect(result.diagnostics).toEqual([]);
  });

  it('spans the whole source on the document node', () => {
    const source = '<a></a>';
    expect(parse(source).value.span).toEqual(span(0, source.length));
  });
});

describe('svg and CDATA (§6.14, decisions 41.b, 50)', () => {
  it('marks the svg subtree and accepts CDATA inside it', () => {
    const source = '<svg><![CDATA[x]]></svg>';
    const svg = firstElement(source);
    expect(svg.namespace).toBe('svg');
    expect(svg.children[0]).toMatchObject({ type: 'cdata', value: 'x' });
    expect(codes(source)).toEqual([]);
  });

  it('marks svg descendants with the namespace', () => {
    const svg = firstElement('<svg><g><rect/></g></svg>');
    const g = svg.children[0] as ElementNode;
    expect(g.namespace).toBe('svg');
    expect((g.children[0] as ElementNode).namespace).toBe('svg');
  });

  it('keeps an unterminated CDATA body as its value', () => {
    const source = '<svg><![CDATA[x';
    const result = parse(source);
    const svg = result.value.children[0] as ElementNode;
    expect(svg.children[0]).toMatchObject({ type: 'cdata', value: 'x' });
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0016', 'FUD0052']);
  });

  it('reports FUD0054 for CDATA in HTML content', () => {
    expect(codes('<div><![CDATA[x]]></div>')).toEqual(['FUD0054']);
  });

  it('matches svg tag names case-sensitively (decision 41.b)', () => {
    // linearGradient is legal SVG; the close tag must match exactly.
    const source = '<svg><linearGradient></linearGradient></svg>';
    expect(codes(source)).toEqual([]);
  });

  it('matches HTML tag names case-insensitively', () => {
    expect(codes('<DIV></div>')).toEqual([]);
  });
});

describe('recovery (§6.15, decision 38)', () => {
  it('reports the intermediate element unclosed and closes the ancestor', () => {
    const source = '<b><i></b>';
    const result = parse(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0052']);
    const b = result.value.children[0] as ElementNode;
    expect(b.name).toBe('b');
    expect(b.closeSpan).toBeDefined();
    const i = b.children[0] as ElementNode;
    expect(i.name).toBe('i');
    expect(i.closeSpan).toBeUndefined();
  });

  it('reports FUD0051 for a close tag with no open element and keeps going', () => {
    const source = '</p><a></a>';
    const result = parse(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0051']);
    const els = result.value.children.filter((c) => c.type === 'element') as ElementNode[];
    expect(els.map((e) => e.name)).toEqual(['a']);
  });

  it('reports every element left open at EOF', () => {
    expect(codes('<div><span>')).toEqual(['FUD0052', 'FUD0052']);
  });

  it('locates the unclosed diagnostic on the start tag', () => {
    const result = parse('<div>');
    expect(result.diagnostics[0]?.span).toEqual(span(0, 5));
  });

  it('degrades a stray closing brace to text (§4.7)', () => {
    const source = '<p>a } b</p>';
    const p = firstElement(source);
    expect(p.children.map((c) => c.type)).toEqual(['text', 'text', 'text']);
    expect(p.children[1]).toMatchObject({ value: '}' });
    expect(codes(source)).toEqual([]);
  });

  it('never throws on malformed input', () => {
    for (const source of ['<', '</', '<a b=', '<a "', '@', '<script>', '<!--', '<a></b></a>']) {
      expect(() => parse(source)).not.toThrow();
    }
  });
});
