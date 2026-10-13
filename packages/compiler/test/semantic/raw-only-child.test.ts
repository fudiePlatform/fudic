/**
 * `raw-only-child` (decision 18): an `@raw(…)` is the only content of an element — `FUD0990`
 * everywhere else.
 *
 * The analyzer and both emit branches ask the same `rawChild`, so these cases are also the
 * map of where `@raw` paints: every placement that is not `FUD0990` here is one the emit
 * writes as HTML, and every one that is, it writes nothing for.
 */

import { describe, expect, it } from 'vitest';
import { rawOnlyChild } from '../../src/semantic/analyzers/raw-only-child.js';
import { rawChild } from '../../src/emit/constructs.js';
import { parseDocument, type ElementNode, type HtmlContent } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import type { Diagnostic } from '../../src/types/index.js';
import { viewInput } from './_view.js';

/** The `@raw` texts the rule reports in `source`. */
function reported(source: string): readonly string[] {
  const out: Diagnostic[] = [];
  rawOnlyChild.run(viewInput(source), (d) => out.push(d));
  return out.map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
}

const component = (markup: string): string =>
  '@code {\n  const h = null;\n  const k = 1;\n  const xs = [1];\n}\n' +
  `<x-a><template shadowrootmode="open">${markup}</template></x-a>\n`;

describe('the shapes that own their element', () => {
  it.each([
    ['alone', '<div>@raw(h)</div>'],
    ['with blank text around it', '<div>\n  @raw(h)\n</div>'],
    ['with a Razor comment beside it', '<div>@* the post *@ @raw(h)</div>'],
    ['in an element nested in an element', '<section><article>@raw(h)</article></section>'],
    ['in an element inside a construct body', '@if (k) {<p>@raw(h)</p>}'],
    ['in the light DOM of a component host', '<x-b>@raw(h)</x-b>'],
  ])('%s: no FUD0990', (_label, markup) => {
    expect(reported(component(markup))).toEqual([]);
  });
});

describe('FUD0990', () => {
  it.each([
    ['beside text', '<p>Hola @raw(h)</p>', ['FUD0990 @raw(h)']],
    ['beside an element', '<p><b>x</b>@raw(h)</p>', ['FUD0990 @raw(h)']],
    ['beside an interpolation', '<p>@k @raw(h)</p>', ['FUD0990 @raw(h)']],
    ['two in one element: both', '<p>@raw(h)@raw(h)</p>', ['FUD0990 @raw(h)', 'FUD0990 @raw(h)']],
    ['directly in the shadow root', '@raw(h)', ['FUD0990 @raw(h)']],
    ['inside a <template> element', '<template>@raw(h)</template>', ['FUD0990 @raw(h)']],
    ['in the body of @if', '@if (k) {@raw(h)}', ['FUD0990 @raw(h)']],
    ['in the else of @if', '@if (k) {<b>x</b>} else {@raw(h)}', ['FUD0990 @raw(h)']],
    ['in a @switch case', '@switch (k) { case 1: {@raw(h)} default: {<i>x</i>} }', ['FUD0990 @raw(h)']],
    ['in the body of @foreach', '@foreach (const x of xs) {@raw(h)}', ['FUD0990 @raw(h)']],
    ['in the body of @for', '@for (let i = 0; i < 2; i++) {@raw(h)}', ['FUD0990 @raw(h)']],
    ['in the body of @while', '@while (k < 0) {@raw(h)}', ['FUD0990 @raw(h)']],
  ])('%s', (_label, markup, expected) => {
    expect(reported(component(markup))).toEqual(expected);
  });

  it('in the body of a @snippet', () => {
    const source = component('<p>x</p>') + '@snippet nota(t: string) {@raw(h)}\n';
    expect(reported(source)).toEqual(['FUD0990 @raw(h)']);
  });

  it('in a @section, and at the roots of a route', () => {
    const route =
      '<link rel="layout" href="./_layout.fud">\n' +
      '@section nav {@raw(h)}\n' +
      '<h1>t</h1>\n@raw(h)\n<div>@raw(h)</div>\n';
    expect(reported(route)).toEqual(['FUD0990 @raw(h)', 'FUD0990 @raw(h)']);
  });

  it('a nested FUD0990 does not hide the owner above it, nor the other way round', () => {
    expect(reported(component('<div><p>a @raw(h)</p></div><div>@raw(h)</div>'))).toEqual(['FUD0990 @raw(h)']);
  });
});

describe('rawChild', () => {
  const first = (markup: string): ElementNode =>
    parseDocument(markup, { atConstructs }).value.children.find((n: HtmlContent) => n.type === 'element') as ElementNode;

  it('returns the @raw that owns the element', () => {
    const raw = rawChild(first('<div> @* c *@ @raw(h) </div>'));
    expect(raw?.type).toBe('raw-expression');
  });

  it('is null for no @raw, for company, and for a <template>', () => {
    expect(rawChild(first('<div></div>'))).toBeNull();
    expect(rawChild(first('<div>  </div>'))).toBeNull();
    expect(rawChild(first('<div>@k</div>'))).toBeNull();
    expect(rawChild(first('<div>a @raw(h)</div>'))).toBeNull();
    expect(rawChild(first('<div>@raw(h)@raw(h)</div>'))).toBeNull();
    expect(rawChild(first('<template>@raw(h)</template>'))).toBeNull();
  });
});
