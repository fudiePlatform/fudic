/**
 * SDD-07 against the canonical `.fud` fixtures: every attribute of every element is
 * classified, and every content expression is interpolated. The fixtures are the real
 * grammar in use, so this is the strongest check that the dispatch is right — a
 * misclassification shows up as a diagnostic on code that is known to be valid.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  type AtConstructParser,
  type HtmlContent,
  type HtmlDocument,
} from '../../src/html/index.js';
import { classifyAttribute, interpolate, type Binding } from '../../src/binding/index.js';
import { scanBraces, scanParens } from '../../src/balancer/index.js';
import { ok, span, type Diagnostic } from '../../src/types/index.js';

const FIXTURES = ['home.fud', 'app-card.fud', 'app-button.fud', 'app-badge.fud'] as const;

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

function skipWhitespace(source: string, from: number): number {
  let i = from;
  while (i < source.length && /\s/u.test(source[i] ?? '')) i++;
  return i;
}

/** The SDD-06/08 stand-in, so control bodies and @code are consumed as they will be. */
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

interface Classified {
  readonly bindings: readonly Binding[];
  readonly diagnostics: readonly Diagnostic[];
  readonly interpolations: number;
  readonly unescaped: number;
}

/** Classify every attribute and interpolate every content expression in the tree. */
function classifyAll(doc: HtmlDocument, source: string): Classified {
  const bindings: Binding[] = [];
  const diagnostics: Diagnostic[] = [];
  let interpolations = 0;
  let unescaped = 0;

  const walk = (node: HtmlDocument | HtmlContent): void => {
    if (node.type === 'element') {
      for (const attr of node.attributes) {
        const result = classifyAttribute(attr, source);
        bindings.push(result.value);
        diagnostics.push(...result.diagnostics);
      }
    }
    // Decision 18: a bare expression escapes, `@raw( ... )` does not.
    if (node.type === 'razor-expression') {
      interpolations++;
      expect(interpolate(node, true).escaped).toBe(true);
    }
    if (node.type === 'raw-expression') {
      interpolations++;
      unescaped++;
      expect(interpolate(node.expr, false).escaped).toBe(false);
    }
    for (const child of (node as { children?: readonly HtmlContent[] }).children ?? []) {
      walk(child);
    }
  };

  walk(doc);
  return { bindings, diagnostics, interpolations, unescaped };
}

function kinds(bindings: readonly Binding[]): readonly string[] {
  return bindings.map((b) => b.type);
}

describe.each(FIXTURES)('%s', (name) => {
  const source = read(name);
  const parsed = parseDocument(source, { atConstructs: constructs });
  const classified = classifyAll(parsed.value, source);

  it('classifies every attribute with no diagnostics', () => {
    expect(parsed.diagnostics).toEqual([]);
    expect(classified.diagnostics).toEqual([]);
  });

  it('every binding span lies inside the source', () => {
    for (const binding of classified.bindings) {
      expect(binding.span.start).toBeGreaterThanOrEqual(0);
      expect(binding.span.end).toBeLessThanOrEqual(source.length);
      expect(binding.span.end).toBeGreaterThan(binding.span.start);
    }
  });

  it('escapes every content interpolation (no @raw in the fixtures)', () => {
    expect(classified.unescaped).toBe(0);
  });
});

describe('fixture-specific classifications', () => {
  it('app-badge: two class: bindings plus the static class', () => {
    const source = read('app-badge.fud');
    const { bindings } = classifyAll(
      parseDocument(source, { atConstructs: constructs }).value,
      source,
    );
    const classBindings = bindings.filter((b) => b.type === 'class');
    expect(classBindings.map((b) => (b.type === 'class' ? b.className : ''))).toEqual([
      'success',
      'warning',
    ]);
    // `class="badge"` stays a plain attribute (decision 22 is only the `class:` form).
    expect(kinds(bindings)).toContain('attr');
  });

  it('app-button: `@click` is an event, `disabled="@disabled"` stays a plain attribute', () => {
    const source = read('app-button.fud');
    const { bindings } = classifyAll(
      parseDocument(source, { atConstructs: constructs }).value,
      source,
    );
    const events = bindings.filter((b) => b.type === 'event');
    expect(events.map((b) => (b.type === 'event' ? b.name : ''))).toEqual(['click']);
    // Decision 21 (omit if falsy) is emit's; here it is just an `attr`.
    const disabled = bindings.find((b) => b.type === 'attr' && b.name === 'disabled');
    expect(disabled).toBeDefined();
  });

  it('app-card: `@press` on a custom element is an event, not a bus subscription (28.d)', () => {
    const source = read('app-card.fud');
    const { bindings } = classifyAll(
      parseDocument(source, { atConstructs: constructs }).value,
      source,
    );
    const events = bindings.filter((b) => b.type === 'event');
    expect(events.map((b) => (b.type === 'event' ? b.name : ''))).toEqual(['press']);
    expect(kinds(bindings)).not.toContain('bus');
  });

  it('home.fud: interpolations are found, and a prop is a prop (BUG-16)', () => {
    const source = read('home.fud');
    const classified = classifyAll(
      parseDocument(source, { atConstructs: constructs }).value,
      source,
    );
    expect(classified.interpolations).toBeGreaterThan(0);
    // Two vocabularies and no third: `.title`/`.variant`/`.tone` are props, `class` is HTML.
    expect(new Set(kinds(classified.bindings))).toEqual(new Set(['attr', 'property']));
  });
});
