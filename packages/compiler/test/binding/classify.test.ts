/**
 * SDD-07 acceptance criteria (§9) for attribute classification and content
 * interpolation. Attributes are produced by the real SDD-05 parser rather than by hand,
 * so the tests exercise the actual shapes `classifyAttribute` has to reinterpret.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyAttribute,
  interpolate,
  type Binding,
  type BusBinding,
} from '../../src/binding/index.js';
import {
  parseDocument,
  type Attribute,
  type ElementNode,
  type HtmlContent,
  type HtmlDocument,
} from '../../src/html/index.js';
import type { RazorExpression } from '../../src/at/index.js';
import type { Diagnostic } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstElement(children: readonly HtmlContent[]): ElementNode {
  for (const child of children) {
    if (child.type === 'element') return child;
  }
  throw new Error('fixture has no element');
}

/** Parse a one-element snippet and classify its single attribute. */
function classifyOne(markup: string): {
  readonly binding: Binding;
  readonly diagnostics: readonly Diagnostic[];
  readonly source: string;
} {
  const doc: HtmlDocument = parseDocument(markup).value;
  const element = firstElement(doc.children);
  const attr = element.attributes[0];
  if (attr === undefined) throw new Error('snippet has no attribute');
  const result = classifyAttribute(attr, markup);
  return { binding: result.value, diagnostics: result.diagnostics, source: markup };
}

function codes(diagnostics: readonly Diagnostic[]): readonly string[] {
  return diagnostics.map((d) => d.code);
}

/** The source text a span covers — the readable form of the span assertions. */
function text(source: string, node: { readonly span: { start: number; end: number } }): string {
  return source.slice(node.span.start, node.span.end);
}

function isBus(binding: Binding): asserts binding is BusBinding {
  expect(binding.type).toBe('bus');
}

// ---------------------------------------------------------------------------
// Dispatch by name (§4)
// ---------------------------------------------------------------------------

describe('classifyAttribute — plain attributes (decision 20)', () => {
  it('classifies a purely static attribute as `attr` with its text part', () => {
    const { binding, diagnostics } = classifyOne('<x class="card"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.name).toBe('class');
    expect(binding.value).toHaveLength(1);
    expect(binding.value[0]?.type).toBe('attribute-text');
  });

  it('treats static and dynamic parts uniformly: `title="@item.title"`', () => {
    const { binding, diagnostics } = classifyOne('<x title="@item.title"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.name).toBe('title');
    expect(binding.value[0]?.type).toBe('razor-expression');
  });

  it('accepts concatenation in a plain attribute: `href="/x/@id"`', () => {
    const { binding, diagnostics } = classifyOne('<x href="/x/@id"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.value.length).toBeGreaterThan(1);
  });

  it('keeps an empty value for a boolean attribute (decision 44)', () => {
    const { binding, diagnostics } = classifyOne('<x disabled></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.value).toEqual([]);
  });

  it('does not treat `refx` or `classy` as reserved names', () => {
    expect(classifyOne('<x refx="@a"></x>').binding.type).toBe('attr');
    expect(classifyOne('<x classy="@a"></x>').binding.type).toBe('attr');
  });
});

describe('classifyAttribute — property bindings (decisions 24, 25; 23 retired by BUG-16)', () => {
  it('strips the leading `.` and keeps the single expression', () => {
    const { binding, diagnostics, source } = classifyOne('<x .value="@model.name"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('property');
    if (binding.type !== 'property') return;
    expect(binding.name).toBe('value');
    expect(binding.value).toHaveLength(1);
    expect(text(source, binding.value[0]!)).toBe('@model.name');
  });

  it('preserves the case of the property name (decision 25)', () => {
    const { binding } = classifyOne('<x .innerHTML="@body"></x>');
    expect(binding.type).toBe('property');
    if (binding.type !== 'property') return;
    expect(binding.name).toBe('innerHTML');
  });

  // BUG-16: the dot is the ONLY way to write a prop, so it accepts what a prop can be.
  it('accepts a constant value, with no diagnostic (FUD0090 retired)', () => {
    const { binding, diagnostics, source } = classifyOne('<x .value="hola"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('property');
    if (binding.type !== 'property') return;
    expect(binding.name).toBe('value');
    expect(text(source, binding.value[0]!)).toBe('hola');
  });

  it('accepts a bare property: no value at all is `true` (decision 44)', () => {
    const { binding, diagnostics } = classifyOne('<x .disabled></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('property');
    if (binding.type !== 'property') return;
    expect(binding.value).toEqual([]);
  });

  it('FUD0091: concatenating text and an expression (decision 24)', () => {
    const { binding, diagnostics } = classifyOne('<x .value="/x/@b"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0091']);
    // The binding survives the error: a prop hidden from the editor over a bad value
    // helps nobody.
    expect(binding.type).toBe('property');
  });

  it('FUD0091: two expressions are a concatenation too, and stay a property', () => {
    const { binding, diagnostics } = classifyOne('<x .value="@a @b"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0091']);
    expect(binding.type).toBe('property');
  });

  // The two shapes only the OTHER bindings can still reach, now that a property takes its
  // value as it comes: no value at all, and more than one expression.
  it('a binding with no value at all is blamed on the whole attribute', () => {
    const { diagnostics } = classifyOne('<x @click></x>');
    expect(codes(diagnostics)).toEqual(['FUD0092']);
    // No value text to point at, so the span is the attribute: an empty span contains no
    // offset and would make the diagnostic unclickable.
    expect(diagnostics[0]!.span).toEqual({ start: 3, end: 9 });
  });

  it('two expressions in a handler are a concatenation, and none of them is the handler', () => {
    const { binding, diagnostics } = classifyOne('<x @click="@a @b"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0092']);
    expect(binding.type).toBe('attr');
  });

  it('FUD0099: `.` with no property name', () => {
    const { diagnostics } = classifyOne('<x .="@a"></x>');
    expect(codes(diagnostics)).toContain('FUD0099');
  });
});

describe('classifyAttribute — event bindings (decisions 26–28)', () => {
  it('strips the leading `@` and keeps the handler', () => {
    const { binding, diagnostics, source } = classifyOne('<x @click="@onClick"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('event');
    if (binding.type !== 'event') return;
    expect(binding.name).toBe('click');
    expect(text(source, binding.value)).toBe('@onClick');
  });

  it('accepts a custom, dashed event name (decision 27)', () => {
    const { binding } = classifyOne('<x @my-event="@onThing"></x>');
    expect(binding.type).toBe('event');
    if (binding.type !== 'event') return;
    expect(binding.name).toBe('my-event');
  });

  it('accepts an explicit expression as the handler (a lambda)', () => {
    const { binding, diagnostics } = classifyOne('<x @click="@(() => go(1))"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('event');
  });

  it('FUD0092: a literal handler', () => {
    const { binding, diagnostics } = classifyOne('<x @click="onClick"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0092']);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.name).toBe('@click');
  });

  it('FUD0092: a concatenated handler', () => {
    const { diagnostics } = classifyOne('<x @click="@a@b"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0092']);
  });

  it('FUD0099: `@` with no event name', () => {
    const { diagnostics } = classifyOne('<x @="@h"></x>');
    expect(codes(diagnostics)).toContain('FUD0099');
  });
});

describe('classifyAttribute — class:/style: (decision 22)', () => {
  it('classifies `class:foo`', () => {
    const { binding, diagnostics } = classifyOne('<x class:success="@(tone === \'ok\')"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('class');
    if (binding.type !== 'class') return;
    expect(binding.className).toBe('success');
  });

  it('classifies `style:foo`', () => {
    const { binding, diagnostics } = classifyOne('<x style:color="@tone"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('style');
    if (binding.type !== 'style') return;
    expect(binding.property).toBe('color');
  });

  it('FUD0093: `class:` with a literal value', () => {
    const { binding, diagnostics } = classifyOne('<x class:on="yes"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0093']);
    expect(binding.type).toBe('attr');
  });

  it('FUD0093: `style:` with a concatenated value', () => {
    const { diagnostics } = classifyOne('<x style:color="@a@b"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0093']);
  });

  it('FUD0095: `class:` with no name after the colon', () => {
    const { diagnostics } = classifyOne('<x class:="@a"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0095']);
  });

  it('FUD0095 + FUD0093: `style:` with no name and no expression', () => {
    const { diagnostics } = classifyOne('<x style:="no"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0095', 'FUD0093']);
  });
});

describe('classifyAttribute — bus bindings (decision 28)', () => {
  it('classifies a literal event name `bus:carrito`', () => {
    const { binding, diagnostics, source } = classifyOne('<x bus:carrito="@onCart"></x>');
    expect(diagnostics).toEqual([]);
    isBus(binding);
    expect(binding.eventName).toBe('carrito');
    expect(text(source, binding.value)).toBe('@onCart');
  });

  it('classifies an expression event name `bus:(EVENTS.cart)` (decision 28.b)', () => {
    const { binding, diagnostics, source } = classifyOne('<x bus:(EVENTS.cart)="@onCart"></x>');
    expect(diagnostics).toEqual([]);
    isBus(binding);
    expect(typeof binding.eventName).not.toBe('string');
    const eventName = binding.eventName as RazorExpression;
    expect(text(source, eventName)).toBe('(EVENTS.cart)');
    expect(source.slice(eventName.expr.start, eventName.expr.end)).toBe('EVENTS.cart');
  });

  it('`@click` and `bus:` are opposites, not inferred from each other (28.d)', () => {
    const doc = parseDocument('<x @click="@a" bus:cart="@b"></x>').value;
    const element = firstElement(doc.children);
    const kinds = element.attributes.map(
      (a: Attribute) => classifyAttribute(a, '<x @click="@a" bus:cart="@b"></x>').value.type,
    );
    expect(kinds).toEqual(['event', 'bus']);
  });

  it('FUD0096: `bus:` with a literal value', () => {
    const { binding, diagnostics } = classifyOne('<x bus:cart="onCart"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0096']);
    expect(binding.type).toBe('attr');
  });

  it('FUD0096: expression name with no handler', () => {
    const { binding, diagnostics } = classifyOne('<x bus:(E.c)="nope"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0096']);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.name).toBe('bus:');
  });

  it('FUD0096: expression name with a concatenated handler keeps the BusBinding', () => {
    const { binding, diagnostics } = classifyOne('<x bus:(E.c)="/x/@h"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0096']);
    expect(binding.type).toBe('bus');
  });

  it('FUD0097: `bus:` with no event name', () => {
    const { diagnostics } = classifyOne('<x bus:="@onCart"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0097']);
  });

  it('FUD0098: an expression name after a prefix other than `bus:`', () => {
    const { binding, diagnostics } = classifyOne('<x class:(x)="@a"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0098']);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.name).toBe('class:');
  });
});

describe('classifyAttribute — ref (decision 30)', () => {
  it('accepts a single simple identifier', () => {
    const { binding, diagnostics, source } = classifyOne('<x ref="@input"></x>');
    expect(diagnostics).toEqual([]);
    expect(binding.type).toBe('ref');
    if (binding.type !== 'ref') return;
    expect(source.slice(binding.value.expr.start, binding.value.expr.end)).toBe('input');
  });

  it('FUD0094: a property path is not a simple identifier', () => {
    const { binding, diagnostics } = classifyOne('<x ref="@a.b"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0094']);
    // The RefBinding survives so the editor still sees a ref.
    expect(binding.type).toBe('ref');
  });

  it('FUD0094: an explicit expression is rejected', () => {
    const { diagnostics } = classifyOne('<x ref="@(a)"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0094']);
  });

  it('FUD0094: a literal value degrades to the plain attribute', () => {
    const { binding, diagnostics } = classifyOne('<x ref="input"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0094']);
    expect(binding.type).toBe('attr');
    if (binding.type !== 'attr') return;
    expect(binding.name).toBe('ref');
  });

  it('FUD0094: a concatenated value is rejected even with one expression', () => {
    const { diagnostics } = classifyOne('<x ref="/x/@input"></x>');
    expect(codes(diagnostics)).toEqual(['FUD0094']);
  });
});

// ---------------------------------------------------------------------------
// LSP invariants (§7)
// ---------------------------------------------------------------------------

describe('classifyAttribute — LSP invariants', () => {
  it('every binding keeps the span of its source attribute', () => {
    const source = '<x .value="@a"></x>';
    const doc = parseDocument(source).value;
    const attr = firstElement(doc.children).attributes[0];
    expect(attr).toBeDefined();
    if (attr === undefined) return;
    expect(classifyAttribute(attr, source).value.span).toEqual(attr.span);
  });

  it('every diagnostic carries a non-empty, in-range span', () => {
    for (const markup of [
      '<x .value="/x/@b"></x>',
      '<x .="@a"></x>',
      '<x @click="x"></x>',
      '<x class:="@a"></x>',
      '<x bus:="nope"></x>',
      '<x ref="@a.b"></x>',
      '<x class:(x)="@a"></x>',
    ]) {
      const { diagnostics, source } = classifyOne(markup);
      expect(diagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of diagnostics) {
        expect(diagnostic.span.end).toBeGreaterThan(diagnostic.span.start);
        expect(diagnostic.span.end).toBeLessThanOrEqual(source.length);
        expect(diagnostic.severity).toBe('error');
        expect(diagnostic.code).toMatch(/^FUD\d{4}$/u);
      }
    }
  });

  it('never throws and is pure: the same attribute classifies identically twice', () => {
    const source = '<x bus:(E.c)="@h"></x>';
    const attr = firstElement(parseDocument(source).value.children).attributes[0];
    expect(attr).toBeDefined();
    if (attr === undefined) return;
    expect(classifyAttribute(attr, source)).toEqual(classifyAttribute(attr, source));
  });

  it('all SDD-07 codes stay inside the reserved FUD0090–FUD0109 range', () => {
    for (const markup of [
      '<x .value="hola"></x>',
      '<x .value="/x/@b"></x>',
      '<x @click="x"></x>',
      '<x class:on="x"></x>',
      '<x ref="@a.b"></x>',
      '<x class:="@a"></x>',
      '<x bus:cart="x"></x>',
      '<x bus:="@h"></x>',
      '<x class:(x)="@a"></x>',
      '<x .="@a"></x>',
    ]) {
      for (const code of codes(classifyOne(markup).diagnostics)) {
        const n = Number(code.slice(3));
        expect(n).toBeGreaterThanOrEqual(90);
        expect(n).toBeLessThanOrEqual(109);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Content interpolation (§5)
// ---------------------------------------------------------------------------

describe('interpolate', () => {
  function contentExpression(source: string): RazorExpression {
    const doc = parseDocument(source).value;
    const element = firstElement(doc.children);
    for (const child of element.children) {
      if (child.type === 'razor-expression') return child;
      if (child.type === 'raw-expression') return child.expr;
    }
    throw new Error('snippet has no content expression');
  }

  it('a bare `@expr` is escaped by default (decision 18)', () => {
    const expr = contentExpression('<x>@post.body</x>');
    const node = interpolate(expr, true);
    expect(node.type).toBe('interpolation');
    expect(node.escaped).toBe(true);
    expect(node.expr).toBe(expr);
  });

  it('`@(expr)` is escaped too', () => {
    const expr = contentExpression('<x>@(post.body)</x>');
    expect(interpolate(expr, true).escaped).toBe(true);
  });

  it('`@raw( ... )` is not escaped (option A)', () => {
    const source = '<x>@raw(post.body)</x>';
    const expr = contentExpression(source);
    const node = interpolate(expr, false);
    expect(node.escaped).toBe(false);
    // The atom spans the whole directive, so emit can replace `@raw(...)` wholesale.
    expect(text(source, node)).toBe('@raw(post.body)');
  });

  it('the interpolation adopts the expression span', () => {
    const expr = contentExpression('<x>@post.body</x>');
    expect(interpolate(expr, true).span).toEqual(expr.span);
  });
});
