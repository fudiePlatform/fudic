/**
 * `event-handler-shape` (BUG-23 task 15): `FUD0291` stops being the emit's alone.
 *
 * The rule of decisions 96–98 lived inside `emit/events.ts`, so a value that can never be a
 * listener was reported by `pnpm build` and by nobody else — the editor stayed silent over the
 * very line being typed. The analyzer applies the SAME function (`handlerShape`), which is what
 * keeps the two from drifting apart again.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId } from '../../src/oxc/index.js';
import { documentRoots, walk } from '../../src/semantic/index.js';
import type { SemanticInput } from '../../src/semantic/index.js';
import type { Node } from '../../src/types/index.js';
import { eventHandlerShape } from '../../src/semantic/analyzers/event-handler-shape.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** Wrap markup in a minimal valid component (DSD host wrapper, decision 75). */
const component = (inner: string): string =>
  `<app-test><template shadowrootmode="open">${inner}</template></app-test>`;

/**
 * The semantic input of one snippet, with the ATTRIBUTE values registered — which is what the
 * language server's batch does since task 14, and what the analyzer asks of it.
 */
function inputFor(inner: string): SemanticInput {
  const source = component(inner);
  const document = structureDocument(
    source,
    parseDocument(source, { atConstructs: constructs }).value,
  ).value;

  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  walk(documentRoots(document), {
    binding(expr) {
      if (expr.expr.end > expr.expr.start) ids.set(expr, batch.add('expression', expr.expr));
    },
  });

  return {
    source,
    document,
    js: batch.parse().value,
    fragmentId: (node) => ids.get(node),
    components: { has: () => true },
  };
}

/** The codes the analyzer reports over a snippet. */
function codes(inner: string): readonly string[] {
  const found: string[] = [];
  eventHandlerShape.run(inputFor(inner), (d) => void found.push(d.code));
  return found;
}

describe('the four shapes are accepted', () => {
  it.each([
    ['a reference', '<div @click="@toggle"></div>'],
    ['a call', '<div @click="@del($event, 1)"></div>'],
    ['a call with no quotes (decision 103)', '<div @click=@del($event)></div>'],
    ['an arrow', '<div @click="@((e) => f(e))"></div>'],
    ['a function expression', '<div @click="@(function (e) { f(e); })"></div>'],
    ['an arrow the author wrapped in parens', '<div @click="@(((e) => f(e)))"></div>'],
  ])('says nothing about %s', (_title, markup) => {
    expect(codes(markup)).toEqual([]);
  });

  it('takes a `bus:` handler by the same rule', () => {
    expect(codes('<div bus:cart="@onCart($event)"></div>')).toEqual([]);
  });
});

describe('anything else is FUD0291', () => {
  it.each([
    ['a literal', '<div @click="@(1)"></div>'],
    ['an operation', '<div @click="@(a + b)"></div>'],
    ['an object', '<div @click="@({ a: 1 })"></div>'],
  ])('reports %s', (_title, markup) => {
    expect(codes(markup)).toEqual(['FUD0291']);
  });

  it('reports it on a `bus:` too, and on the value rather than on the name', () => {
    const input = inputFor('<div bus:(EVENTS.cart)="@(1)"></div>');
    const spans: { start: number; end: number }[] = [];
    eventHandlerShape.run(input, (d) => void spans.push(d.span));

    expect(spans).toHaveLength(1);
    expect(input.source.slice(spans[0]!.start, spans[0]!.end)).toBe('@(1)');
  });
});

describe('what it stays quiet about', () => {
  it('an attribute that is not a handler, whatever shape its value has', () => {
    expect(codes('<div id="@(1)" .tone="@({ a: 1 })"></div>')).toEqual([]);
  });

  it('a value with no AST: FUD0170 already said what there was to say', () => {
    const input = inputFor('<div @click="@(1)"></div>');
    const codesFound: string[] = [];
    eventHandlerShape.run({ ...input, fragmentId: () => undefined }, (d) =>
      void codesFound.push(d.code),
    );

    expect(codesFound).toEqual([]);
  });

  it('a value the author has not finished: an empty span registers no fragment', () => {
    expect(codes('<div @click="@()"></div>')).toEqual([]);
  });
});
