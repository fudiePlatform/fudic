/**
 * SDD-49 §6, criteria 30–35 — the sheets of one page in the emit (`src/emit/page-sheets.ts`).
 *
 * The route prunes every sheet its page receives and hands its layout the finished element
 * for each one under a key; the layout writes `route.sheet(key)` where the `<link>` was. The
 * element is a JS expression, so the tests EVALUATE it — with a nonce standing in for the
 * response's — and read the HTML back.
 */

import { describe, expect, it } from 'vitest';
import {
  AssetLinker,
  emitLayoutModule,
  emitPageModuleMapped,
  emitRouteModule,
  emitRouteModuleMapped,
  resolveDocument,
  type DocumentGraph,
  type EmitOptions,
} from '../../src/emit/index.js';
import { planPageSheets, rebaseSpec, type PageSheets } from '../../src/emit/page-sheets.js';
import type { ElementNode } from '../../src/html/index.js';
import { memoryIo } from './_support.js';

const NONCE = ' nonce="N"';

/** The HTML a head element expression evaluates to. */
function html(expr: string): string {
  return new Function('$nonce', `return ${expr};`)(NONCE) as string;
}

/** The sheets the host can read, by the specifier the compiler asks with (no query). */
const SHEETS: Record<string, string> = {
  './base.css':
    '@import "./parts/inputs.css";\np { color: red; background: url(./bg.png) }\n' +
    'table { border: 0; background: url(./t.png) }',
  './parts/inputs.css': 'input { border: 1px solid }',
  './inline.css': '.a { margin: 0; background: url(./i.png) }\n.zz { x: 1 }',
  './empty.css': '.nothing { a: 1 }',
  './broken.css': 'p { color: red',
  './own.css': 'em { font-style: normal }',
};

const LAYOUT =
  '<!DOCTYPE html>\n<html>\n<head>\n' +
  '<link rel="component" href="./x-card.fud">\n' +
  '<meta charset="utf-8">\n' +
  '<link rel="stylesheet" href="./base.css" media="screen">\n' +
  '<link rel="stylesheet" href="./inline.css?inline">\n' +
  '<link rel="stylesheet" href="https://cdn.example/x.css">\n' +
  '<link rel="stylesheet" href="/public.css">\n' +
  '<link rel="stylesheet" href="./missing.css">\n' +
  '<link rel="stylesheet" href="./@(data.theme).css">\n' +
  '<link rel="stylesheet" href="./empty.css">\n' +
  '<link rel="icon" href="./i.png">\n' +
  '@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n';

const CARD = '<x-card>\n  <template shadowrootmode="open"><b class="in">c</b></template>\n</x-card>\n';

/** A route over `LAYOUT`, with `markup` as its body and `head` as its head. */
const route = (markup: string, head = ''): string =>
  '<link rel="layout" href="./_layout.fud">\n<link rel="component" href="./x-card.fud">\n' +
  (head === '' ? '' : `<head>\n${head}\n</head>\n`) +
  markup;

function graphOf(entry: string, files: Record<string, string>): DocumentGraph {
  return resolveDocument(entry, memoryIo(files)).value;
}

const appFiles = (markup: string, head = ''): Record<string, string> => ({
  '/app/_layout.fud': LAYOUT,
  '/app/index.fud': route(markup, head),
  '/app/x-card.fud': CARD,
});

interface Host {
  readonly urls: string[];
  readonly copies: { spec: string; css: string; origin: string }[];
  readonly options: EmitOptions;
}

/** A host that names every URL and publishes pruned copies — and records what it was asked. */
function host(extra: Partial<EmitOptions> = {}, sheet = true): Host {
  const urls: string[] = [];
  const copies: { spec: string; css: string; origin: string }[] = [];
  const options: EmitOptions = {
    linkAssets: true,
    pruneStyles: true,
    assetUrl: (spec) => {
      urls.push(spec);
      return `/assets/${spec.replace(/^\.\//u, '')}`;
    },
    assetText: (spec) => SHEETS[spec] ?? null,
    ...(sheet
      ? {
          assetSheet: (spec: string, css: string, origin: string) => {
            copies.push({ spec, css, origin });
            return `/assets/pruned-${copies.length}.css`;
          },
        }
      : {}),
    ...extra,
  };
  return { urls, copies, options };
}

function plan(graph: DocumentGraph, options: EmitOptions): PageSheets {
  const linker = new AssetLinker(
    options.linkAssets ?? false,
    options.assetExists,
    options.assetUrl,
    options.assetText,
    options.assetSheet,
  );
  const out = planPageSheets(graph, options, linker);
  if (out === null) throw new Error('no plan');
  return out;
}

// ---------------------------------------------------------------------------

describe('the layout writes `route.sheet(K)` (criterion 31)', () => {
  it('one call per prunable `<link>`, in order, and the others as they were', () => {
    const graph = graphOf('/app/index.fud', appFiles('<p class="a">x</p>'));
    const layout = emitLayoutModule(graph, graph.layouts[0]!, host().options);
    expect(layout.match(/\.sheet\("[^"]+"\)/gu)).toEqual(['.sheet("0:0")', '.sheet("0:1")', '.sheet("0:2")']);
    expect(layout).toContain('https://cdn.example/x.css');
    expect(layout).toContain('/public.css');
    expect(layout).toContain('missing.css');
  });

  it('without `pruneStyles` it writes no call', () => {
    const graph = graphOf('/app/index.fud', appFiles('<p class="a">x</p>'));
    const { pruneStyles: _, ...off } = host().options;
    expect(emitLayoutModule(graph, graph.layouts[0]!, off)).not.toContain('.sheet(');
  });
});

describe('the route delivers each sheet (criteria 31, 34)', () => {
  const h = host();
  const graph = graphOf('/app/index.fud', appFiles('<p class="a">x</p>'));
  const sheets = plan(graph, h.options);

  it('a `<link>` to the pruned copy, keeping the author’s other attributes', () => {
    expect(html(sheets.layout.get('0:0')!)).toBe('<link rel="stylesheet" href="/assets/pruned-1.css" media="screen">');
    expect(h.copies[0]).toEqual({
      spec: './base.css',
      css: 'p{color:red;background:url("/assets/bg.png")}',
      origin: 'markup',
    });
  });

  it('a `url()` that stays is linked; the one of a pruned rule is not', () => {
    expect(h.urls).toContain('./bg.png');
    expect(h.urls).not.toContain('./t.png');
  });

  it('`?inline` becomes a `<style>` with the nonce and the pruned CSS', () => {
    expect(html(sheets.layout.get('0:1')!)).toBe('<style nonce="N">.a{margin:0;background:url(/assets/i.png)}</style>');
  });

  it('a sheet left empty is nothing', () => {
    expect(sheets.layout.get('0:2')).toBe("''");
    expect(html(sheets.layout.get('0:2')!)).toBe('');
  });

  it('`EmitOutput.sheets`: each file, what it flattened, what kept a rule, what it says', () => {
    expect(sheets.uses).toEqual([
      {
        spec: './base.css',
        css: 'p{color:red;background:url(./bg.png)}',
        files: ['./base.css', './parts/inputs.css'],
        contributing: ['./base.css'],
        diagnostics: [],
        sites: expect.any(Array),
      },
      {
        spec: './inline.css?inline',
        css: '.a{margin:0;background:url(./i.png)}',
        files: ['./inline.css'],
        contributing: ['./inline.css'],
        diagnostics: [],
        sites: expect.any(Array),
      },
      {
        spec: './empty.css',
        css: '',
        files: ['./empty.css'],
        contributing: [],
        diagnostics: [],
        sites: expect.any(Array),
      },
    ]);
  });

  it('`sites`: where each file came in — the `<link>` in its `.fud`, or the `@import` (FUD0852)', () => {
    const base = sheets.uses[0]!;
    if (!('sites' in base)) throw new Error('a linked sheet');
    const link = '<link rel="stylesheet" href="./base.css" media="screen">';
    const at = LAYOUT.indexOf(link);
    const css = SHEETS['./base.css']!;
    const imp = '@import "./parts/inputs.css";';
    expect(base.sites).toEqual([
      { file: './base.css', at: '/app/_layout.fud', span: { start: at, end: at + link.length } },
      { file: './parts/inputs.css', at: './base.css', span: { start: css.indexOf(imp), end: css.indexOf(imp) + imp.length } },
    ]);
  });

  it('the route module answers `sheet(key)`, and its mapped output carries the uses', () => {
    const out = emitRouteModuleMapped(graph, host().options);
    expect(out.code).toContain('sheet(key) {');
    expect(out.code).toContain('case "0:0": return');
    expect(out.code).toContain("default: return '';");
    expect(out.sheets?.map((s) => ('spec' in s ? s.spec : s.specifier))).toEqual([
      './base.css',
      './inline.css?inline',
      './empty.css',
    ]);
  });
});

describe('two routes, one layout (criterion 32)', () => {
  it('deliver different CSS for the same key', () => {
    const files = {
      ...appFiles('<p>x</p>'),
      '/app/other.fud': route('<table><tr><td>t</td></tr></table>'),
    };
    const a = host();
    const b = host();
    plan(graphOf('/app/index.fud', files), a.options);
    plan(graphOf('/app/other.fud', files), b.options);
    expect(a.copies[0]!.css).toBe('p{color:red;background:url("/assets/bg.png")}');
    expect(b.copies[0]!.css).toBe('table{border:0;background:url("/assets/t.png")}');
  });
});

describe('without a host that publishes copies', () => {
  it('the `<link>` keeps the URL of the whole file', () => {
    const graph = graphOf('/app/index.fud', appFiles('<p class="a">x</p>'));
    const sheets = plan(graph, host({}, false).options);
    expect(html(sheets.layout.get('0:0')!)).toBe('<link rel="stylesheet" href="/assets/base.css" media="screen">');
  });

  it('with no host naming URLs either, the `href` as written', () => {
    const graph = graphOf('/app/index.fud', appFiles('<p class="a">x</p>'));
    const { assetUrl: _, ...noUrl } = host({}, false).options;
    // No URL port: the linker registers an import, whose binding the expression names.
    const linked = plan(graph, noUrl).layout.get('0:0')!;
    expect(linked).toContain('__fudic_asset_');
    const off = plan(graph, { ...noUrl, assetExists: () => false }).layout.get('0:0')!;
    expect(html(off)).toBe('<link rel="stylesheet" href="./base.css" media="screen">');
  });
});

describe('the route’s own head, and a page without a layout', () => {
  it('a route writes its own prunable `<link>`s; other head elements are not its business', () => {
    const graph = graphOf(
      '/app/index.fud',
      appFiles('<em>e</em>', '<link rel="stylesheet" href="./own.css">\n<title>t</title>'),
    );
    const h = host();
    const sheets = plan(graph, h.options);
    const head = graph.entry.type === 'route-document' ? graph.entry.head! : undefined;
    const elements = head!.children.filter((c) => c.type === 'element');
    expect(html(sheets.own(elements[0] as ElementNode)!)).toBe('<link rel="stylesheet" href="/assets/pruned-1.css">');
    expect(sheets.own(elements[1] as ElementNode)).toBeNull();
    // Nothing of the layout's `base.css` matches an `<em>`: the route's own sheet is the one copy.
    expect(h.copies.map((c) => c.css)).toEqual(['em{font-style:normal}']);
    const code = emitRouteModule(graph, host().options);
    expect(code).toContain('/assets/pruned-1.css');
  });

  it('a page prunes its own sheets in its own module', () => {
    const page =
      '<!DOCTYPE html>\n<html><head>\n<link rel="stylesheet" href="./own.css">\n<link rel="stylesheet" href="./base.css">\n' +
      '</head><body><em>e</em></body></html>';
    const graph = graphOf('/app/p.fud', { '/app/p.fud': page });
    const h = host();
    const out = emitPageModuleMapped(graph, h.options);
    expect(out.code).toContain('/assets/pruned-1.css');
    // Nothing of `base.css` matches an `<em>`: its `<link>` is gone.
    expect(h.copies).toHaveLength(1);
    expect(out.sheets).toEqual([
      { spec: './own.css', css: 'em{font-style:normal}', files: ['./own.css'], contributing: ['./own.css'], diagnostics: [], sites: expect.any(Array) },
      { spec: './base.css', css: '', files: ['./base.css', './parts/inputs.css'], contributing: [], diagnostics: [], sites: expect.any(Array) },
    ]);
    // The page's own `<link>` is in the page itself.
    const own = out.sheets![0]!;
    expect('sites' in own && own.sites[0]!.at).toBe('/app/p.fud');
  });
});

describe('a sheet that says something about itself', () => {
  it('its diagnostics travel with its use, over its own file', () => {
    const files = appFiles('<p>x</p>');
    files['/app/_layout.fud'] = LAYOUT.replace('./empty.css', './broken.css');
    const sheets = plan(graphOf('/app/index.fud', files), host().options);
    const broken = sheets.uses.find((u) => 'spec' in u && u.spec === './broken.css')!;
    expect(broken.css).toBe('p{color:red');
    expect('diagnostics' in broken ? broken.diagnostics.map((d) => [d.file, d.diagnostic.code]) : []).toEqual([
      ['./broken.css', 'FUD0851'],
    ]);
  });
});

describe('the project’s sheets (criterion 33)', () => {
  const projectStyles = [
    { specifier: 'guide', css: '.in { a: 1 }\n.out { b: 2 }' },
    { specifier: 'empty', css: '.never { a: 1 }' },
    { specifier: 'nobody', css: 'b { a: 1 }' },
  ];
  const styleChains = new Map([['x-card', ['guide', 'empty']]]);
  const graph = graphOf('/app/index.fud', appFiles('<x-card></x-card>'));

  it('one no component adopts leaves; one adopted and emptied stays, empty', () => {
    const sheets = plan(graph, host({ projectStyles, styleChains }).options);
    expect(sheets.projectStyles).toEqual([
      { specifier: 'guide', css: '.in{a:1}' },
      { specifier: 'empty', css: '' },
    ]);
    expect(sheets.uses.filter((u) => 'specifier' in u)).toEqual([
      { specifier: 'guide', css: '.in{a:1}' },
      { specifier: 'empty', css: '' },
      { specifier: 'nobody', css: '' },
    ]);
  });

  it('the adoption lists do not change', () => {
    const on = emitRouteModule(graph, host({ projectStyles, styleChains }).options);
    const { pruneStyles: _, ...rest } = host({ projectStyles, styleChains }).options;
    const off = emitRouteModule(graph, rest);
    const adopt = (code: string): string[] => code.match(/data-fud-adopt[^,;]*/gu) ?? [];
    expect(adopt(on)).toEqual(adopt(off));
    expect(on).not.toContain('"nobody"');
  });

  it('without a chain every sheet is adopted by every component', () => {
    const sheets = plan(graph, host({ projectStyles }).options);
    expect(sheets.projectStyles?.map((s) => s.specifier)).toEqual(['guide', 'empty', 'nobody']);
  });

  it('a project with no sheets of its own', () => {
    expect(plan(graph, host().options).projectStyles).toBeUndefined();
  });
});

describe('without `pruneStyles` (criterion 35)', () => {
  it('there is no plan, and the output carries no uses', () => {
    const graph = graphOf('/app/index.fud', appFiles('<p>x</p>'));
    const { pruneStyles: _, ...off } = host().options;
    expect(planPageSheets(graph, off, new AssetLinker(true))).toBeNull();
    const out = emitRouteModuleMapped(graph, off);
    expect('sheets' in out).toBe(false);
    expect(out.code).not.toContain('sheet(key)');
  });
});

describe('a layout in another folder (rebaseSpec)', () => {
  it('the route reads the layout’s sheets as seen from its own folder', () => {
    const files = {
      '/app/layouts/_layout.fud':
        '<!DOCTYPE html>\n<html><head>\n<link rel="stylesheet" href="../styles/base.css">\n@RenderHead()\n</head>\n' +
        '<body>@RenderBody()</body>\n</html>\n',
      '/app/pages/index.fud': '<link rel="layout" href="../layouts/_layout.fud">\n<p>x</p>\n',
    };
    const read: string[] = [];
    const sheets = plan(graphOf('/app/pages/index.fud', files), {
      pruneStyles: true,
      linkAssets: true,
      assetText: (spec) => {
        read.push(spec);
        return spec === '../styles/base.css' ? 'p { a: 1 }\nq { b: 2 }' : null;
      },
    });
    expect(read).toContain('../styles/base.css');
    expect(sheets.uses).toEqual([
      { spec: '../styles/base.css', css: 'p{a:1}', files: ['../styles/base.css'], contributing: ['../styles/base.css'], diagnostics: [], sites: expect.any(Array) },
    ]);
  });

  it('same folder, down, up, with a query, POSIX or Windows separators', () => {
    expect(rebaseSpec('./a.css', '/app/_layout.fud', '/app/index.fud')).toBe('./a.css');
    expect(rebaseSpec('a.css', '/app/_layout.fud', '/app/index.fud')).toBe('./a.css');
    expect(rebaseSpec('./s/a.css?inline', '/app/_layout.fud', '/app/index.fud')).toBe('./s/a.css?inline');
    expect(rebaseSpec('./a.css', '/app/layouts/_layout.fud', '/app/index.fud')).toBe('./layouts/a.css');
    expect(rebaseSpec('../a.css', '/app/layouts/_layout.fud', '/app/pages/deep/index.fud')).toBe('../../a.css');
    expect(rebaseSpec('./a.css', '/app/_layout.fud', '/app/pages/index.fud')).toBe('../a.css');
    expect(rebaseSpec('.//x/./a.css', '/app/_layout.fud', '/app/index.fud')).toBe('./x/a.css');
    expect(rebaseSpec('../a.css','C:\\app\\l\\_layout.fud', 'C:\\app\\p\\index.fud')).toBe('../a.css');
    expect(rebaseSpec('./a.css', 'C:\\app\\l\\_layout.fud', 'C:\\app\\p\\index.fud')).toBe('../l/a.css');
  });
});

describe('`@import` in a component’s `<style>` — `FUD0855` (criterion 30)', () => {
  it('over each `@import`, also without `pruneStyles`; a commented one is not read', () => {
    const source =
      '<head>\n  <style>@import "./x.css";\n/* @import "./no.css"; */\n:host { a: 1 } @IMPORT url(y.css) screen;</style>\n</head>\n' +
      '<x-a>\n  <template shadowrootmode="open"><b>b</b></template>\n</x-a>\n';
    const result = resolveDocument('/x-a.fud', memoryIo({ '/x-a.fud': source }));
    const found = result.diagnostics.filter((d) => d.code === 'FUD0855');
    expect(found.map((d) => source.slice(d.span.start, d.span.end))).toEqual([
      '@import "./x.css";',
      '@IMPORT url(y.css) screen;',
    ]);
  });

  it('nothing for a `<style>` without one, or an empty one', () => {
    const source =
      '<head>\n  <style></style>\n</head>\n<x-a>\n  <template shadowrootmode="open"><b>b</b></template>\n</x-a>\n';
    expect(resolveDocument('/x-a.fud', memoryIo({ '/x-a.fud': source })).diagnostics).toEqual([]);
  });
});
