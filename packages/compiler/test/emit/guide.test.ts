/**
 * SDD-79 §4.2, §4.7 — the style guides and the icon in the emit (`pageGuide`, `guideOf`, the
 * `onGuide` slot of `writeHeadElements`, `hasIcon`).
 *
 * The page receives each guide of its chain as a sheet of the document, pruned like one and
 * written before the sheets of its layout; and the guide's icon when no head links one. The
 * expressions are EVALUATED, with a nonce standing in for the response's, and read back.
 */

import { describe, expect, it } from 'vitest';
import {
  AssetLinker,
  emitLayoutModule,
  emitPageModule,
  emitRouteModule,
  resolveDocument,
  type DocumentGraph,
  type EmitOptions,
  type GuideSheet,
} from '../../src/emit/index.js';
import { planPageSheets } from '../../src/emit/page-sheets.js';
import { hasIcon } from '../../src/emit/parts.js';
import { flattenImports } from '../../src/css/flatten.js';
import type { ElementNode } from '../../src/html/index.js';
import { memoryIo, parse } from './_support.js';

const NONCE = ' nonce="N"';
const html = (expr: string): string => new Function('$nonce', `return ${expr};`)(NONCE) as string;

/** A guide as the host flattens it: tokens, the document, two pieces. */
const GUIDE_FILES: Record<string, string> = {
  './guide/guide.css': '@import "./tokens.css";\n@import "./h1.css";\n@import "./button.css";',
  './guide/tokens.css': ':root { --ink: #111; }',
  './guide/h1.css': 'h1 { color: var(--ink); background: url(./h1.png); }',
  './guide/button.css': 'button { color: var(--ink); }',
};

function guide(spec = './guide/guide.css', files = GUIDE_FILES): GuideSheet {
  return { spec, sheet: flattenImports(spec, files[spec]!, (s) => files[s] ?? null) };
}

const LAYOUT =
  '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
  '<link rel="stylesheet" href="./base.css">\n' +
  '@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n';
const LAYOUT_NO_SHEET = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n';
const LAYOUT_ICON =
  '<!DOCTYPE html>\n<html>\n<head>\n<link rel="shortcut icon" href="./mine.png">\n@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n';

const route = (markup: string, head = ''): string =>
  '<link rel="layout" href="./_layout.fud">\n' + (head === '' ? '' : `<head>\n${head}\n</head>\n`) + markup;

function graphOf(files: Record<string, string>, entry = '/app/index.fud'): DocumentGraph {
  return resolveDocument(entry, memoryIo(files)).value;
}

interface Host {
  readonly copies: { spec: string; css: string }[];
  readonly options: EmitOptions;
}

/** A host that names every URL, and publishes pruned copies unless `copies` is false. */
function host(extra: Partial<EmitOptions> = {}, copies = true): Host {
  const published: { spec: string; css: string }[] = [];
  return {
    copies: published,
    options: {
      linkAssets: true,
      pruneStyles: true,
      assetUrl: (spec) => `/assets/${spec.replace(/^\.\//u, '')}`,
      assetText: (spec) => (spec === './base.css' ? 'p { margin: 0; }' : null),
      ...(copies
        ? {
            assetSheet: (spec: string, css: string) => {
              published.push({ spec, css });
              return `/assets/copy-${published.length}.css`;
            },
          }
        : {}),
      guides: [guide()],
      ...extra,
    },
  };
}

function linkerOf(options: EmitOptions): AssetLinker {
  return new AssetLinker(options.linkAssets ?? false, options.assetExists, options.assetUrl, options.assetText, options.assetSheet);
}

/** What the route gives its layout for the guide, evaluated. */
function guideHtml(graph: DocumentGraph, options: EmitOptions): string | null {
  const sheets = planPageSheets(graph, options, linkerOf(options));
  return sheets?.guide === null || sheets === null ? null : html(sheets.guide);
}

describe('the guide is linked by every page, pruned for it (criteria 6, 7)', () => {
  it('a <link> to the pruned copy, which keeps the h1 of the page and its url()', () => {
    const h = host();
    const graph = graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<h1>t</h1>') });
    expect(guideHtml(graph, h.options)).toBe('<link rel="stylesheet" href="/assets/copy-1.css">');
    expect(h.copies[0]!.spec).toBe('./guide/guide.css');
    expect(h.copies[0]!.css).toContain('h1{');
    expect(h.copies[0]!.css).toContain('/assets/guide/h1.png');
    expect(h.copies[0]!.css).not.toContain('button');
  });

  it('an h1 only inside a component is not the page\'s: the copy drops it', () => {
    const h = host();
    const graph = graphOf({
      '/app/_layout.fud': LAYOUT,
      '/app/index.fud': '<link rel="component" href="./x-card.fud">\n' + route('<x-card></x-card><button>b</button>'),
      '/app/x-card.fud': '<x-card>\n  <template shadowrootmode="open"><h1>in</h1></template>\n</x-card>\n',
    });
    guideHtml(graph, h.options);
    expect(h.copies[0]!.css).not.toContain('h1');
    expect(h.copies[0]!.css).toContain('button{');
  });

  it('a guide the page keeps nothing of is not linked', () => {
    const files = { './g/guide.css': '@import "./h6.css";', './g/h6.css': 'h6 { margin: 0; }' };
    const h = host({ guides: [guide('./g/guide.css', files)] });
    expect(guideHtml(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<p>x</p>') }), h.options)).toBeNull();
  });

  it('without copies, a <style> with the nonce and the pruned CSS', () => {
    const h = host({}, false);
    const out = guideHtml(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<h1>t</h1>') }), h.options);
    expect(out).toMatch(/^<style nonce="N">.*h1\{.*<\/style>$/u);
  });

  it('two guides, both, in the order of the chain (criterion 9)', () => {
    const lib = guide();
    const app = guide('./own/guide.css', { './own/guide.css': '@import "./h1.css";', './own/h1.css': 'h1 { font-size: 2rem; }' });
    const h = host({ guides: [lib, app] });
    const out = guideHtml(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<h1>t</h1>') }), h.options);
    expect(out).toBe('<link rel="stylesheet" href="/assets/copy-1.css"><link rel="stylesheet" href="/assets/copy-2.css">');
    expect(h.copies.map((c) => c.spec)).toEqual(['./guide/guide.css', './own/guide.css']);
  });

  it('the route preloads the copy before the sheets of its layout', () => {
    const h = host();
    const sheets = planPageSheets(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<h1>t</h1><p>x</p>') }), h.options, linkerOf(h.options));
    const copy = h.copies.findIndex((c) => c.spec === './guide/guide.css') + 1;
    expect(sheets!.hints[0]).toEqual({ href: `/assets/copy-${copy}.css`, rel: 'preload', as: 'style' });
    expect(sheets!.hints).toHaveLength(2);
  });
});

describe('where the layout writes it', () => {
  const files = { '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<h1>t</h1>') };

  it('before the first sheet of its head', () => {
    const code = emitLayoutModule(graphOf(files), graphOf(files).layouts[0]!, host().options);
    const at = code.indexOf('.guide?.()');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(code.indexOf('.sheet("0:0")'));
  });

  it('before what the route contributes, when the head has no sheet', () => {
    const noSheet = { ...files, '/app/_layout.fud': LAYOUT_NO_SHEET };
    const graph = graphOf(noSheet);
    const code = emitLayoutModule(graph, graph.layouts[0]!, host().options);
    expect(code.indexOf('.guide?.()')).toBeGreaterThan(-1);
  });

  it('not at all without a guide or an icon: the layout is what it was', () => {
    const graph = graphOf(files);
    const { guides: _, ...none } = host().options;
    const before = emitLayoutModule(graph, graph.layouts[0]!, none);
    expect(before).not.toContain('guide');
    expect(emitLayoutModule(graph, graph.layouts[0]!, { ...none, guides: [] })).toBe(before);
  });

  it('the route module answers guide()', () => {
    const code = emitRouteModule(graphOf(files), host().options);
    expect(code).toContain('guide() {');
  });

  it('a route with neither has no guide()', () => {
    const { guides: _, ...none } = host().options;
    expect(emitRouteModule(graphOf(files), none)).not.toContain('guide() {');
  });

  it('without pruning, the whole guide goes', () => {
    const graph = graphOf(files);
    const { pruneStyles: _, ...whole } = host({}, false).options;
    const code = emitRouteModule(graph, whole);
    expect(code).toContain('guide() {');
    expect(code).toContain('button{');
  });
});

describe('a page without a layout', () => {
  const PAGE =
    '<!DOCTYPE html>\n<html>\n<head>\n<title>t</title>\n<link rel="stylesheet" href="./base.css">\n</head>\n<body><h1>t</h1><p>x</p></body>\n</html>\n';

  it('writes the guide in its own head, before its sheet', () => {
    const graph = graphOf({ '/app/index.fud': PAGE });
    const h = host();
    const code = emitPageModule(graph, h.options);
    const copy = (spec: string): string => `copy-${h.copies.findIndex((c) => c.spec === spec) + 1}.css`;
    const guideAt = code.indexOf(copy('./guide/guide.css'));
    expect(guideAt).toBeGreaterThan(-1);
    expect(guideAt).toBeLessThan(code.indexOf(copy('./base.css')));
  });

  it('without pruning too', () => {
    const graph = graphOf({ '/app/index.fud': PAGE });
    const { pruneStyles: _, ...whole } = host({}, false).options;
    expect(emitPageModule(graph, whole)).toContain('button{');
  });
});

describe('the favicon (criteria 15, 16)', () => {
  it('the guide\'s icon when no head links one, published as a head asset', () => {
    const h = host({ guides: [], icon: './guide/logo.svg' });
    const out = guideHtml(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<p>x</p>') }), h.options);
    expect(out).toBe('<link rel="icon" href="/assets/guide/logo.svg">');
  });

  it('after the guide\'s sheet', () => {
    const h = host({ icon: './guide/logo.svg' });
    const out = guideHtml(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<h1>t</h1>') }), h.options);
    expect(out).toBe('<link rel="stylesheet" href="/assets/copy-1.css"><link rel="icon" href="/assets/guide/logo.svg">');
  });

  it('the author\'s wins: in the layout\'s head, or in the route\'s', () => {
    const h = host({ guides: [], icon: './guide/logo.svg' });
    expect(guideHtml(graphOf({ '/app/_layout.fud': LAYOUT_ICON, '/app/index.fud': route('<p>x</p>') }), h.options)).toBeNull();
    const own = route('<p>x</p>', '<link rel="icon" href="./own.png">');
    expect(guideHtml(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': own }), h.options)).toBeNull();
  });

  it('as written when nobody names its URL', () => {
    const h = host({ guides: [], icon: './guide/logo.svg', linkAssets: false });
    const sheets = planPageSheets(graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<p>x</p>') }), h.options, linkerOf(h.options));
    expect(html(sheets!.guide!)).toBe('<link rel="icon" href="./guide/logo.svg">');
  });

  it('a layout with an icon and no guide writes no guide() call', () => {
    const graph = graphOf({ '/app/_layout.fud': LAYOUT, '/app/index.fud': route('<p>x</p>') });
    const code = emitLayoutModule(graph, graph.layouts[0]!, { ...host({ guides: [] }).options, icon: './guide/logo.svg' });
    expect(code).toContain('.guide?.()');
  });
});

describe('hasIcon', () => {
  const head = (inner: string): ElementNode => {
    const doc = parse(`<!DOCTYPE html>\n<html><head>${inner}</head><body></body></html>`);
    return (doc as unknown as { head: ElementNode }).head;
  };

  it('reads the rel tokens, in any case', () => {
    expect(hasIcon(head('<link rel="ICON" href="x">'))).toBe(true);
    expect(hasIcon(head('<link rel="apple-touch-icon" href="x">'))).toBe(false);
    expect(hasIcon(head('<link href="x">'))).toBe(false);
    expect(hasIcon(head('<meta name="icon">'))).toBe(false);
    expect(hasIcon(undefined)).toBe(false);
  });
});
