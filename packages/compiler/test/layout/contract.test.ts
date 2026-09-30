/**
 * SDD-48 §4.6 — the contract between a route and its layout's holes, criterion 6.
 *
 *   `FUD0440`  a `required: true` section the route does not declare: ONE diagnostic, over the
 *              route's `<link rel="layout">`, naming every one that is missing.
 *   `FUD0441`  text or an expression at the root of a slotted hole, constructs seen through.
 *   `FUD0442`  a root of a slotted hole that writes its own `slot=`.
 *
 * Pure over the two structured documents; the build reaches it through `resolveDocument`.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument, type LayoutDocument, type RouteDocument } from '../../src/document/index.js';
import { holeContractDiagnostics, missingRequiredSections } from '../../src/layout/index.js';
import { resolveDocument } from '../../src/emit/resolve.js';
import { memoryIo } from '../emit/_support.js';

function structured(source: string): LayoutDocument | RouteDocument {
  return structureDocument(source, parseDocument(source, { atConstructs }).value).value as
    | LayoutDocument
    | RouteDocument;
}

const layoutOf = (body: string): LayoutDocument =>
  structured(`<!DOCTYPE html><html><head>@RenderHead()</head><body>${body}</body></html>`) as LayoutDocument;

const LINK = '<link rel="layout" href="./l.fud">';

/** `code: text-under-the-span` for the contract of `route` against a layout whose body is `body`. */
function contract(route: string, body: string): string[] {
  const source = `${LINK}\n${route}`;
  return holeContractDiagnostics(structured(source) as RouteDocument, layoutOf(body)).map(
    (d) => `${d.code}: ${source.slice(d.span.start, d.span.end).trim()}`,
  );
}

describe('FUD0440 — a required section the route does not declare', () => {
  const body = '@RenderSection(cabecera, required: true)@RenderSection(nav)@RenderSection(pie, required: true)@RenderBody()';

  it('lists the missing ones in layout order, skipping the optional and the declared', () => {
    const route = structured(`${LINK}\n@section pie { <p>x</p> }`) as RouteDocument;
    expect(missingRequiredSections(route, layoutOf(body)).map((s) => s.name)).toEqual(['cabecera']);
  });

  it('is ONE error over the `<link rel="layout">`, naming every section', () => {
    const source = `${LINK}\n<p>x</p>`;
    const [d, ...rest] = holeContractDiagnostics(structured(source) as RouteDocument, layoutOf(body));
    expect(rest).toEqual([]);
    expect(d!.code).toBe('FUD0440');
    expect(d!.severity).toBe('error');
    expect(source.slice(d!.span.start, d!.span.end)).toBe(LINK);
    expect(d!.message).toContain('sections `cabecera`, `pie`: declare them');
  });

  it('speaks in the singular for one', () => {
    const source = `${LINK}\n@section cabecera { <p>x</p> }`;
    const [d] = holeContractDiagnostics(structured(source) as RouteDocument, layoutOf(body));
    expect(d!.message).toContain('the section `pie`: declare it');
  });

  it('says nothing once every one is declared, nor for an unnamed hole', () => {
    expect(contract('@section cabecera { <p>a</p> }\n@section pie { <p>b</p> }', body)).toEqual([]);
    expect(contract('<p>x</p>', '@RenderSection(required: true)@RenderBody()')).toEqual([]);
  });
});

describe('FUD0441 / FUD0442 — the roots of a slotted hole', () => {
  const slotted = '<app-marco>@RenderBody(slot: "contenido")@RenderSection(lateral, slot: "lateral")</app-marco>';

  it('reports text, an expression and `@raw` at the root of the body, over the node', () => {
    expect(contract('suelto\n<p>ok</p>\n@titulo\n@raw(html)', slotted)).toEqual([
      'FUD0441: suelto',
      'FUD0441: @titulo',
      'FUD0441: @raw(html)',
    ]);
  });

  it('sees through every construct, and ignores whitespace, comments and nested text', () => {
    const route = [
      '@if (a) { hola } else if (b) { <p>b</p> } else { adiós }',
      '@switch (a) { case 1: uno default: <b>d</b> }',
      '@foreach (const x of xs) key (x) { <li>texto dentro</li> @x }',
      '<!-- c -->',
      '@render pie()',
      '@if (c) { <p>sin else</p> }',
    ].join('\n');
    expect(contract(route, slotted)).toEqual([
      'FUD0441: hola',
      'FUD0441: adiós',
      'FUD0441: uno',
      'FUD0441: @x',
    ]);
  });

  it('reports a root that writes its own `slot=`, over the attribute', () => {
    expect(contract('<p slot="otro">x</p>\n<div><span slot="dentro">y</span></div>', slotted)).toEqual([
      'FUD0442: slot="otro"',
    ]);
  });

  it('reads a section against ITS hole, and a section of an unslotted hole not at all', () => {
    expect(contract('<p>x</p>\n@section lateral { texto }\n@section otra { texto }', slotted)).toEqual([
      'FUD0441: texto',
    ]);
  });

  it('says nothing when the layout slots nothing', () => {
    expect(contract('suelto <p slot="x">y</p>', '<main>@RenderBody()</main>')).toEqual([]);
  });
});

describe('in the build: `resolveDocument` reports the contract', () => {
  const LAYOUT = [
    '<!DOCTYPE html><html><head>@RenderHead()</head><body><app-marco>',
    '@RenderSection(lateral, required: true, slot: "lateral")',
    '@RenderBody(slot: "contenido")',
    '</app-marco></body></html>',
  ].join('\n');
  const codes = (route: string): string[] =>
    resolveDocument('/r.fud', memoryIo({ '/r.fud': `${LINK}\n${route}`, '/l.fud': LAYOUT })).diagnostics.map(
      (d) => d.code,
    );

  it('with the build’s other voices, and nothing when it holds', () => {
    expect(codes('<p>x</p>')).toEqual(['FUD0440']);
    expect(codes('suelto\n@section lateral { <p slot="x">a</p> }')).toEqual(['FUD0441', 'FUD0442']);
    expect(codes('<p>x</p>\n@section lateral { <p>a</p> }')).toEqual([]);
  });
});
