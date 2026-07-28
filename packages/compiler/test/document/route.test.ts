/**
 * SDD-21 §6.2–§6.8 — the two document roles the layout feature adds, decided in the
 * structuring pass (SDD-10): a shell with `@RenderBody()` is a layout, a fragment with
 * `<link rel="layout">` is a route. Everything else must keep behaving exactly as before.
 *
 * Parsed with the real pipeline (SDD-05 + SDD-06 + SDD-08 + SDD-21) so the structured
 * document comes from an authentic tree.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import {
  structureDocument,
  isLayoutLink,
  type LayoutDocument,
  type RouteDocument,
} from '../../src/document/index.js';
import type { Diagnostic } from '../../src/types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function structure(source: string) {
  const parsed = parseDocument(source, { atConstructs: constructs });
  const result = structureDocument(source, parsed.value);
  return {
    value: result.value,
    codes: [...parsed.diagnostics, ...result.diagnostics].map((d: Diagnostic) => d.code),
    structureCodes: result.diagnostics.map((d: Diagnostic) => d.code),
  };
}

/** An SDD-21 fixture (layout / route), which lives under `test/` — see `emit/_support.ts`. */
function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');
}

/** One of the four canonical fixtures of the repo (page / components). */
function canonical(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

describe('role detection (§6.2, §6.3, §6.4 — decisions 81, 82)', () => {
  it('structures the blog fixture as a route with every field named (§6.2)', () => {
    const { value, structureCodes } = structure(fixture('blog.fud'));
    expect(value.type).toBe('route-document');
    const route = value as RouteDocument;
    expect(route.layoutHref).toBe('./_layout.fud');
    expect(route.links).toHaveLength(1);
    expect(route.code).toBeDefined();
    expect(route.head).toBeDefined();
    // Two significant roots: the <h1> and the @foreach. The @section is lifted out.
    expect(route.markup.filter((n) => n.type !== 'text')).toHaveLength(2);
    expect(route.sections.map((s) => s.name)).toEqual(['scripts']);
    // No FUD0156: a route needs no host wrapper (decision 83).
    expect(structureCodes).toEqual([]);
  });

  it('structures the layout fixture as a layout with its directives (§6.4)', () => {
    const { value, structureCodes } = structure(fixture('_layout.fud'));
    expect(value.type).toBe('layout-document');
    const layout = value as LayoutDocument;
    expect(layout.renderBody).toBeDefined();
    expect(layout.renderHead).toBeDefined();
    expect(layout.renderSections.map((s) => s.name)).toEqual(['scripts']);
    expect(layout.links).toHaveLength(1);
    expect(structureCodes).toEqual([]);
  });

  it('reads a nested layout chain link (decision 87)', () => {
    const { value } = structure(fixture('_layout-admin.fud'));
    expect(value.type).toBe('layout-document');
    expect((value as LayoutDocument).layoutHref).toBe('./_layout.fud');
  });

  it('leaves the existing roles untouched (§6.3)', () => {
    expect(structure(canonical('home.fud')).value.type).toBe('page-document');
    expect(structure(canonical('app-card.fud')).value.type).toBe('component-document');
    // A shell WITHOUT @RenderBody() is still a plain page, not a broken layout.
    const page = structure('<!DOCTYPE html><html><head></head><body><p>x</p></body></html>');
    expect(page.value.type).toBe('page-document');
    expect(page.structureCodes).toEqual([]);
  });

  it('still demands a host wrapper from a fragment with no layout link (§6.3)', () => {
    expect(structure('<p>orphan</p>').structureCodes).toContain('FUD0156');
  });

  it('recognizes a static rel="layout" link only', () => {
    const parsed = parseDocument('<link rel="layout" href="./l.fud"><p>x</p>', { atConstructs: constructs });
    const link = parsed.value.children.find((c) => c.type === 'element');
    expect(link && isLayoutLink(link)).toBe(true);
  });
});

describe('route structure rules (decisions 81, 83)', () => {
  const ROUTE = '<link rel="layout" href="./_layout.fud">';

  it('accepts multiple markup roots with no wrapper', () => {
    const { value, structureCodes } = structure(`${ROUTE}<h1>a</h1><p>b</p><p>c</p>`);
    expect((value as RouteDocument).markup.filter((n) => n.type === 'element')).toHaveLength(3);
    expect(structureCodes).toEqual([]);
  });

  it('reports a second layout link with FUD0420', () => {
    const { structureCodes } = structure(`${ROUTE}${ROUTE}<p>x</p>`);
    expect(structureCodes).toContain('FUD0420');
  });

  it('reports an out-of-phase node with FUD0421', () => {
    const { structureCodes } = structure(`${ROUTE}<p>x</p><link rel="component" href="./app-card.fud">`);
    expect(structureCodes).toContain('FUD0421');
  });

  it('reports an absent or interpolated href with FUD0436', () => {
    expect(structure('<link rel="layout"><p>x</p>').structureCodes).toContain('FUD0436');
    expect(structure('<link rel="layout" href="@data.l"><p>x</p>').structureCodes).toContain('FUD0436');
  });

  it('reports a nested @section with FUD0421 and keeps it out of `sections`', () => {
    const { value, structureCodes } = structure(`${ROUTE}<div>@section s { <p>x</p> }</div>`);
    expect(structureCodes).toContain('FUD0421');
    expect((value as RouteDocument).sections).toHaveLength(0);
  });

  it('reports a duplicate section name with FUD0428', () => {
    const { structureCodes } = structure(`${ROUTE}@section s { <p>a</p> }@section s { <p>b</p> }`);
    expect(structureCodes).toContain('FUD0428');
  });

  it('rejects Render* directives inside a route with FUD0426 (§6.6)', () => {
    expect(structure(`${ROUTE}<main>@RenderBody()</main>`).structureCodes).toContain('FUD0426');
  });
});

describe('layout directive rules (§6.5, §6.6 — decision 86)', () => {
  const shell = (head: string, body: string): string =>
    `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

  it('reports a repeated @RenderBody() with FUD0424 and keeps the first', () => {
    const { value, structureCodes } = structure(shell('@RenderHead()', '@RenderBody()@RenderBody()'));
    expect(structureCodes).toContain('FUD0424');
    expect((value as LayoutDocument).renderBody).toBeDefined();
  });

  it('warns FUD0425 when the layout has no @RenderHead()', () => {
    const { value, structureCodes } = structure(shell('', '@RenderBody()'));
    expect(value.type).toBe('layout-document');
    expect(structureCodes).toContain('FUD0425');
  });

  it('reports @RenderHead() outside <head> with FUD0431', () => {
    const { structureCodes } = structure(shell('', '@RenderBody()@RenderHead()'));
    expect(structureCodes).toContain('FUD0431');
  });

  it('reports a duplicate @RenderSection name with FUD0428', () => {
    const { structureCodes } = structure(
      shell('@RenderHead()', '@RenderBody()@RenderSection(s)@RenderSection(s)'),
    );
    expect(structureCodes).toContain('FUD0428');
  });

  it('rejects @section inside a layout with FUD0427 (§6.6)', () => {
    const { structureCodes } = structure(
      shell('@RenderHead()', '@RenderBody()@section s { <p>x</p> }'),
    );
    expect(structureCodes).toContain('FUD0427');
  });

  it('finds a @RenderBody() nested inside control flow', () => {
    const { value } = structure(shell('@RenderHead()', '@if (x) { @RenderBody() }'));
    expect(value.type).toBe('layout-document');
    expect((value as LayoutDocument).renderBody).toBeDefined();
  });
});

describe('directives in the roles that do not own them (§6.6)', () => {
  it('rejects them in a page with FUD0426 / FUD0427', () => {
    const page = (body: string): string =>
      `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
    expect(structure(page('@RenderHead()')).structureCodes).toContain('FUD0426');
    expect(structure(page('@section s { <p>x</p> }')).structureCodes).toContain('FUD0427');
  });

  it('rejects them in a component with FUD0426 / FUD0427', () => {
    const component = (inner: string): string =>
      `<app-x><template shadowrootmode="open">${inner}</template></app-x>`;
    expect(structure(component('@RenderBody()')).structureCodes).toContain('FUD0426');
    expect(structure(component('@section s { <p>x</p> }')).structureCodes).toContain('FUD0427');
  });
});
