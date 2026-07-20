/**
 * SDD-05 against the canonical `.fud` fixtures, with a stand-in for the SDD-06/08
 * sub-parsers so the control and @code constructs are consumed the way they will be.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  type AtConstructParser,
  type ElementNode,
  type HtmlContent,
  type HtmlDocument,
} from '../../src/html/index.js';
import { scanBraces, scanParens } from '../../src/balancer/index.js';
import { ok, span } from '../../src/types/index.js';

const FIXTURES = ['home.fud', 'app-card.fud', 'app-button.fud', 'app-badge.fud'] as const;

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

function skipWhitespace(source: string, from: number): number {
  let i = from;
  while (i < source.length && /\s/u.test(source[i] ?? '')) i++;
  return i;
}

/** Control bodies recurse through the seam; @code is balanced opaquely (as SDD-08 will). */
const constructs: AtConstructParser = {
  parseControl(ctx, keyword, keywordSpan) {
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
  parseCodeBlock(ctx, keywordSpan) {
    const at = skipWhitespace(ctx.source, keywordSpan.end);
    const end = ctx.source[at] === '{' ? scanBraces(ctx.source, at).value.span.end : keywordSpan.end;
    ctx.lexer.seekTo(end);
    return ok({ type: 'code', span: span(keywordSpan.start, end) });
  },
};

/** Depth-first walk over every node that carries children. */
function walk(node: HtmlDocument | HtmlContent, visit: (n: HtmlContent) => void): void {
  const children = (node as { children?: readonly HtmlContent[] }).children;
  if (children === undefined) return;
  for (const child of children) {
    visit(child);
    walk(child, visit);
  }
}

describe.each(FIXTURES)('%s', (name) => {
  const source = read(name);
  const result = parseDocument(source, { atConstructs: constructs });

  it('parses with no diagnostics', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('nests every child span inside its parent', () => {
    const check = (parent: HtmlDocument | HtmlContent): void => {
      const children = (parent as { children?: readonly HtmlContent[] }).children ?? [];
      for (const child of children) {
        expect(child.span.start).toBeGreaterThanOrEqual(parent.span.start);
        expect(child.span.end).toBeLessThanOrEqual(parent.span.end);
        check(child);
      }
    };
    check(result.value);
  });

  it('closes every normal element', () => {
    walk(result.value, (node) => {
      if (node.type !== 'element') return;
      const el = node as ElementNode;
      if (el.kind === 'normal' || el.kind === 'raw') expect(el.closeSpan).toBeDefined();
    });
  });
});

describe('home.fud specifics', () => {
  const source = read('home.fud');
  const result = parseDocument(source, { atConstructs: constructs });
  const doc = result.value;

  it('is a page (decision 51)', () => {
    expect(doc.mode).toBe('page');
    expect(doc.children[0]).toMatchObject({ type: 'doctype' });
  });

  it('keeps <title> interpolation as a Razor expression, not raw text', () => {
    let title: ElementNode | null = null;
    walk(doc, (n) => {
      if (n.type === 'element' && (n as ElementNode).name === 'title') title = n as ElementNode;
    });
    expect(title).not.toBeNull();
    const child = title!.children[0]!;
    expect(child.type).toBe('razor-expression');
    if (child.type !== 'razor-expression') throw new Error('unreachable');
    expect(source.slice(child.expr.start, child.expr.end)).toBe('data.title');
  });

  it('delegates the @code block and the control constructs', () => {
    const types = new Set<string>();
    walk(doc, (n) => types.add(n.type));
    expect(types.has('code')).toBe(true);
    expect(types.has('if')).toBe(true);
    expect(types.has('foreach')).toBe(true);
  });

  it('reads the app-card bindings as attributes with expression values', () => {
    let card: ElementNode | null = null;
    walk(doc, (n) => {
      if (n.type === 'element' && (n as ElementNode).name === 'app-card') card = n as ElementNode;
    });
    expect(card).not.toBeNull();
    const names = card!.attributes.map((a) => a.name);
    expect(names).toEqual(['title', 'variant']);
    const variant = card!.attributes[1]!.value[0]!;
    if (variant.type !== 'razor-expression') throw new Error('unreachable');
    expect(source.slice(variant.expr.start, variant.expr.end)).toBe(
      "item.featured ? 'highlight' : 'default'",
    );
  });

  it('marks the void meta elements', () => {
    const metas: ElementNode[] = [];
    walk(doc, (n) => {
      if (n.type === 'element' && (n as ElementNode).name === 'meta') metas.push(n as ElementNode);
    });
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      expect(meta.kind).toBe('void');
      expect(meta.closeSpan).toBeUndefined();
    }
  });
});
