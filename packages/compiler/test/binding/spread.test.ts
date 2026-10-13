/**
 * `...item` as an attribute (props-spec §5): what `classifyAttribute` and `spreadExpr` make of
 * it. The object lives in the attribute NAME, so its span is arithmetic over the attribute's
 * start — checked here as the text it covers, which is what Oxc and the editor are handed.
 */

import { describe, expect, it } from 'vitest';
import { classifyAttribute, spreadExpr, SPREAD_PREFIX } from '../../src/binding/index.js';
import { parseDocument, type Attribute, type ElementNode } from '../../src/html/index.js';

function attrOf(markup: string): Attribute {
  const el = parseDocument(markup).value.children.find((n) => n.type === 'element') as ElementNode;
  return el.attributes[0]!;
}

describe('a well-formed spread', () => {
  it.each([
    ['<app-card ...item></app-card>', 'item'],
    ['<app-card ...row.data></app-card>', 'row.data'],
    ['<app-card ...$p._x1></app-card>', '$p._x1'],
  ])('%s spreads `%s`', (markup, object) => {
    const attr = attrOf(markup);
    const { value, diagnostics } = classifyAttribute(attr, markup);
    expect(diagnostics).toEqual([]);
    expect(value.type).toBe('spread');
    if (value.type !== 'spread') return;
    expect(markup.slice(value.span.start, value.span.end)).toBe(`${SPREAD_PREFIX}${object}`);
    expect(markup.slice(value.expr!.start, value.expr!.end)).toBe(object);
    expect(spreadExpr(attr)).toEqual(value.expr);
  });

  it('is asked before `.`: `...x` is never a property named `..x`', () => {
    const markup = '<app-card ...x .y="@z"></app-card>';
    expect(classifyAttribute(attrOf(markup), markup).value.type).toBe('spread');
  });
});

describe('FUD0991 — a malformed spread keeps its binding, with no object', () => {
  it.each([
    ['bare dots', '<app-card ...></app-card>'],
    ['a hyphen', '<app-card ...a-b></app-card>'],
    ['a leading digit', '<app-card ...1a></app-card>'],
    ['a trailing dot', '<app-card ...a.></app-card>'],
    ['four dots', '<app-card ....a></app-card>'],
    ['a static value', '<app-card ...item="x"></app-card>'],
    ['a Razor value', '<app-card ...item="@x"></app-card>'],
  ])('%s', (_label, markup) => {
    const attr = attrOf(markup);
    const { value, diagnostics } = classifyAttribute(attr, markup);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0991']);
    expect(diagnostics[0]!.span).toEqual(attr.span);
    expect(value).toEqual({ type: 'spread', span: attr.span, expr: null });
    expect(spreadExpr(attr)).toBeNull();
  });
});

describe('spreadExpr on what is not a spread', () => {
  it.each(['<p class="a"></p>', '<p .a="@b"></p>', '<p bus:(x)="@f"></p>'])('%s is null', (markup) => {
    expect(spreadExpr(attrOf(markup))).toBeNull();
  });
});
