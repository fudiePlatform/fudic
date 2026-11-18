/**
 * SDD-88 §6, criteria 1-5: a `.fud` that starts with `<!DOCTYPE` is always a layout (decision
 * 183). Without any hole it is `FUD1580` over its doctype, and nothing else; the page without a
 * layout, its node and its emit are gone.
 */
import { describe, expect, it } from 'vitest';
import * as compiler from '../../src/index.js';
import * as emit from '../../src/emit/index.js';
import * as documents from '../../src/document/index.js';
import { resolveDocument } from '../../src/emit/index.js';
import { memoryIo } from '../emit/_support.js';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';

/** The structured document of `source` and the codes of what it said. */
function structure(source: string) {
  const html = parseDocument(source, { atConstructs });
  const result = structureDocument(source, html.value);
  return { value: result.value, diagnostics: result.diagnostics, codes: result.diagnostics.map((d) => d.code) };
}

const WHOLE = '<!DOCTYPE html>\n<html lang="es">\n<head><title>Inicio</title></head>\n<body><h1>Hola</h1></body>\n</html>\n';

describe('criterion 1: a whole document without a hole is FUD1580', () => {
  it('is a layout-document with exactly FUD1580, over the doctype', () => {
    const { value, diagnostics } = structure(WHOLE);
    expect(value.type).toBe('layout-document');
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1580']);
    const doctype = '<!DOCTYPE html>';
    expect(diagnostics[0]!.span).toEqual({ start: 0, end: doctype.length });
    expect(diagnostics[0]!.severity).toBe('error');
  });

  it('says it once: no FUD0423 (no @RenderBody), FUD0425 (no @RenderHead) nor FUD1112 (a server link) besides', () => {
    const withServer =
      '<!DOCTYPE html>\n<html>\n<head><link rel="server" href="./x.fudapi"><title>t</title></head>\n<body><p>x</p></body>\n</html>\n';
    expect(structure(withServer).codes).toEqual(['FUD1580']);
  });

  it('a doctype in any case is the same', () => {
    expect(structure('<!dOcTyPe html><html><head></head><body></body></html>').codes).toEqual(['FUD1580']);
  });

  it('a whole document WITH a hole is a layout without FUD1580', () => {
    const layout = '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';
    const { value, codes } = structure(layout);
    expect(value.type).toBe('layout-document');
    expect(codes).toEqual([]);
  });

  it('a section alone is a hole: a layout missing its body (FUD0423), not FUD1580', () => {
    const { codes } = structure('<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderSection(nav)</body>\n</html>\n');
    expect(codes).toContain('FUD0423');
    expect(codes).not.toContain('FUD1580');
  });
});

describe('criterion 2: holes but no @RenderBody is still FUD0423', () => {
  it('@RenderHead() and no @RenderBody(): FUD0423, not FUD1580', () => {
    const { value, codes } = structure('<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body><p>x</p></body>\n</html>\n');
    expect(value.type).toBe('layout-document');
    expect(codes).toContain('FUD0423');
    expect(codes).not.toContain('FUD1580');
  });
});

describe('criterion 3: a route that links a document without holes', () => {
  const ROUTE = '<link rel="layout" href="./_layout.fud">\n<h1>x</h1>\n';

  it('is FUD0423 in the route, over its link, naming the layout; the layout is not followed', () => {
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': ROUTE, '/_layout.fud': WHOLE }));
    const found = graph.diagnostics.filter((d) => d.code === 'FUD0423');
    expect(found).toHaveLength(1);
    const link = '<link rel="layout" href="./_layout.fud">';
    expect(found[0]!.span).toEqual({ start: 0, end: link.length });
    expect(found[0]!.message).toContain('_layout.fud');
    expect(graph.value.layouts).toEqual([]);
    // The route says it in the route's terms: FUD1580 is said in the layout's own file.
    expect(graph.diagnostics.map((d) => d.code)).not.toContain('FUD1580');
  });

  it('a link to a component is still FUD0435', () => {
    const component = '<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n';
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': ROUTE, '/_layout.fud': component }));
    expect(graph.diagnostics.map((d) => d.code)).toContain('FUD0435');
    expect(graph.diagnostics.map((d) => d.code)).not.toContain('FUD0423');
  });

  it('a link to a real layout follows it, with no diagnostic', () => {
    const layout = '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': ROUTE, '/_layout.fud': layout }));
    expect(graph.diagnostics).toEqual([]);
    expect(graph.value.layouts.map((l) => l.path)).toEqual(['/_layout.fud']);
  });
});

describe('criterion 4: a <link rel="layout"> in the head of a whole document', () => {
  it('is FUD0439 over the link, in a layout with holes', () => {
    const link = '<link rel="layout" href="./other.fud">';
    const source = `<!DOCTYPE html>\n<html>\n<head>${link}@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n`;
    const { value, diagnostics } = structure(source);
    expect(value.type).toBe('layout-document');
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0439']);
    const at = source.indexOf(link);
    expect(diagnostics[0]!.span).toEqual({ start: at, end: at + link.length });
  });

  it('is FUD0439 too in one without holes, beside its FUD1580: two different facts', () => {
    const source = '<!DOCTYPE html>\n<html>\n<head><link rel="layout" href="./other.fud"></head>\n<body></body>\n</html>\n';
    expect([...structure(source).codes].sort()).toEqual(['FUD0439', 'FUD1580']);
  });
});

describe('FUD1583: the runtime is the layout’s, never a route’s', () => {
  const MARKER = '<script type="module" src="fudic:runtime"></script>';
  const ROUTE = (head: string, markup = '<h1>x</h1>'): string =>
    `<link rel="layout" href="./_layout.fud">\n<head>${head}<title>t</title></head>\n${markup}\n`;

  it('a runtime marker in a route’s <head> is FUD1583, over the script element', () => {
    for (const marker of [
      '<script type="module" src="fudic:runtime"></script>',
      '<script src="fudic:runtime"></script>',
      '<script type="module" src="fudic:runtime?inline"></script>',
    ]) {
      const source = ROUTE(marker);
      const { value, diagnostics } = structure(source);
      expect(value.type, marker).toBe('route-document');
      expect(diagnostics.map((d) => d.code), marker).toEqual(['FUD1583']);
      const at = source.indexOf(marker);
      expect(diagnostics[0]!.span, marker).toEqual({ start: at, end: at + marker.length });
    }
  });

  it('another script in a route’s <head> is no runtime: nothing to say', () => {
    expect(structure(ROUTE('<script type="module" src="./app.js"></script>')).codes).toEqual([]);
  });

  it('anywhere else is FUD1583 too, over the script: a route’s markup, a component, a layout’s body', () => {
    const cases = [
      `<link rel="layout" href="./_layout.fud">\n<h1>x</h1>\n${MARKER}\n`,
      `<link rel="layout" href="./_layout.fud">\n<div><p>${MARKER}</p></div>\n`,
      `<link rel="layout" href="./_layout.fud">\n@if (true) {\n  ${MARKER}\n}\n`,
      `<x-a>\n  <template shadowrootmode="open">${MARKER}</template>\n</x-a>\n`,
      `<head>${MARKER}</head>\n<x-a>\n  <template shadowrootmode="open"></template>\n</x-a>\n`,
      `<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>${MARKER}@RenderBody()</body>\n</html>\n`,
    ];
    for (const source of cases) {
      const found = structure(source).diagnostics.filter((d) => d.code === 'FUD1583');
      expect(found, source).toHaveLength(1);
      const at = source.indexOf(MARKER);
      expect(found[0]!.span, source).toEqual({ start: at, end: at + MARKER.length });
    }
  });

  it('in a layout’s <head> it is where it belongs: nothing to say', () => {
    const layout = '<!DOCTYPE html>\n<html>\n<head><script type="module" src="fudic:runtime"></script>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';
    expect(structure(layout).codes).toEqual([]);
  });
});

describe('criterion 5: the page without a layout is gone', () => {
  it('no export names it, in the package or in its emit and document entries', () => {
    const gone = ['PageDocument', 'emitPageModule', 'emitPageModuleMapped', 'buildPageModule', 'htmlLang', 'pageBoxes'];
    for (const ns of [compiler, emit, documents] as Record<string, unknown>[]) {
      for (const name of gone) expect(name in ns, name).toBe(false);
    }
  });

  it('no structured document has the role page-document, from any shell', () => {
    const shells = [
      WHOLE,
      '<!DOCTYPE html><html><head></head><body></body></html>',
      '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
      '<!DOCTYPE html><html><head></head></html>',
      '<!DOCTYPE html>',
    ];
    for (const source of shells) expect(structure(source).value.type, source).toBe('layout-document');
  });
});
