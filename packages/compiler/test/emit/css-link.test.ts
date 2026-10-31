/**
 * SDD-73 §3.5, §4.4 — `css: "link"` in the emit: with `componentSheet` injected, a page's CSS
 * leaves the page as files.
 *
 * - The `<style>` of a head — the route's, a page's, the layout's — and an `?inline` sheet are a
 *   `<link>` to a file, pruned for the page and in their place; a `<style>` whose attributes
 *   carry a `@` stays inside. The layout hands them to the route by key, like a pruned sheet.
 * - A component wears `data-fud-sheets` — the project's files first, its own last — and the
 *   page carries no polyfill and no style module.
 * - The page's hints: its heads' sheets, then its components', each once.
 * - The client chunk writes the same `data-fud-sheets`, and its adopt path steps back over the
 *   `<link>`s that end a hydrated root.
 * - Without `componentSheet`, nothing of this: the emit of always.
 */

import { describe, expect, it } from 'vitest';
import {
  AssetLinker,
  emitComponentClientModuleMapped,
  emitLayoutModule,
  emitPageModuleMapped,
  emitRouteModuleMapped,
  resolveComponents,
  resolveDocument,
  type DocumentGraph,
  type EmitOptions,
} from '../../src/emit/index.js';
import { planPageSheets } from '../../src/emit/page-sheets.js';
import { sheetUrlsOf } from '../../src/emit/module.js';
import type { ElementNode } from '../../src/html/index.js';
import { memoryIo } from './_support.js';

/** The HTML a head element expression evaluates to. */
const html = (expr: string): string => new Function('$nonce', `return ${expr};`)(' nonce="N"') as string;

const SHEETS: Record<string, string> = {
  './inline.css': '.a { margin: 0 }\n.zz { x: 1 }',
};

const LAYOUT =
  '<!DOCTYPE html>\n<html>\n<head>\n' +
  '<link rel="component" href="./ui/x-card.fud">\n' +
  '<style>.a { color: red } .gone { x: 1 }</style>\n' +
  '<link rel="stylesheet" href="./inline.css?inline">\n' +
  '<style media=@(data.m)>.b { y: 1 }</style>\n' +
  '@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n';

const CARD =
  '<head><style>:host { display: block } .in { background: url(./img/c.png) }</style></head>\n' +
  '<x-card>\n  <template shadowrootmode="open"><b class="in">c</b></template>\n</x-card>\n';

const ROUTE =
  '<link rel="layout" href="./_layout.fud">\n<link rel="component" href="./ui/x-card.fud">\n' +
  '<head>\n<style media="screen">p.a { z: 1 } .none { z: 2 }</style>\n</head>\n' +
  '<p class="a">x</p><x-card></x-card>\n';

/** What the host published, by name, and the options that publish it. */
function host(link = true): { readonly published: Map<string, string>; readonly options: EmitOptions } {
  const published = new Map<string, string>();
  return {
    published,
    options: {
      linkAssets: true,
      pruneStyles: true,
      assetUrl: (spec) => `/assets/${spec.replace(/^\.\//u, '')}`,
      assetText: (spec) => SHEETS[spec] ?? null,
      assetSheet: (spec) => `/assets/pruned-${spec.replace(/^\.\//u, '').replace(/\?.*$/u, '')}`,
      projectStyles: [{ specifier: 'theme', css: ':host { color: blue }' }],
      ...(link
        ? {
            componentSheet: (name: string, css: string): string => {
              published.set(name, css);
              return `/assets/${name}.css`;
            },
          }
        : {}),
    },
  };
}

function graph(): DocumentGraph {
  return resolveDocument(
    '/app/index.fud',
    memoryIo({ '/app/_layout.fud': LAYOUT, '/app/index.fud': ROUTE, '/app/ui/x-card.fud': CARD }),
  ).value;
}

function plan(g: DocumentGraph, options: EmitOptions) {
  const linker = new AssetLinker(true, undefined, options.assetUrl, options.assetText, options.assetSheet);
  return planPageSheets(g, options, linker)!;
}

const styleOf = (head: ElementNode, n = 0): ElementNode =>
  head.children.filter((c): c is ElementNode => c.type === 'element' && c.name === 'style')[n]!;

describe('the `<style>` of a head is a file, pruned for the page (criterion 16)', () => {
  it('the route’s: a `<link>` in its place, with its attributes, holding what the page uses', () => {
    const g = graph();
    const { published, options } = host();
    const sheets = plan(g, options);
    const own = sheets.own(styleOf((g.entry as { head: ElementNode }).head));
    expect(html(own!)).toBe('<link rel="stylesheet" href="/assets/index.css" media="screen">');
    expect(published.get('index')).toBe('p.a{z:1}');
  });

  it('the layout’s: handed by key, like a pruned sheet; an `?inline` sheet stays a file', () => {
    const g = graph();
    const { published, options } = host();
    const sheets = plan(g, options);
    expect([...sheets.layout.keys()]).toEqual(['0:0', '0:1']);
    expect(html(sheets.layout.get('0:0')!)).toBe('<link rel="stylesheet" href="/assets/_layout.css">');
    expect(html(sheets.layout.get('0:1')!)).toBe('<link rel="stylesheet" href="/assets/pruned-inline.css">');
    expect(published.get('_layout')).toBe('.a{color:red}');
    // The layout asks for both, and writes the `<style>` with a `@` as ever.
    const layout = emitLayoutModule(g, g.layouts[0]!, options);
    expect(layout).toContain(`.sheet("0:0")`);
    expect(layout).toContain(`.sheet("0:1")`);
    expect(layout).not.toContain(`.sheet("0:2")`);
  });

  it('a `<style>` whose attributes carry a `@` stays inside the page', () => {
    const g = graph();
    const sheets = plan(g, host().options);
    expect(sheets.own(styleOf(g.layouts[0]!.doc.head, 1))).toBeNull();
  });

  it('they are hinted in their place in the head, before the components', () => {
    const out = emitRouteModuleMapped(graph(), host().options);
    expect(out.hints!.map((h) => h.href)).toEqual([
      '/assets/_layout.css',
      '/assets/pruned-inline.css',
      '/assets/index.css',
      '/assets/theme.css',
      '/assets/x-card.css',
    ]);
  });
});

describe('the components wear their sheets as files (criteria 7, 9)', () => {
  it('no polyfill, no style module; the host names the project’s file, then its own', () => {
    const { published, options } = host();
    const code = emitRouteModuleMapped(graph(), options).code;
    expect(code).not.toContain('STYLE_POLYFILL');
    expect(code).not.toContain('PROJECT_STYLES');
    expect(code).not.toContain('css as');
    expect(code).toContain(`'data-fud-sheets', "/assets/theme.css /assets/x-card.css"`);
    expect(code).not.toContain('data-fud-adopt');
    // The component's `url(…)` resolved from its own file, then linked.
    expect(published.get('x-card')).toBe(':host{display:block}.in{background:url("/assets/ui/img/c.png")}');
    expect(published.get('theme')).toBe(':host{color:blue}');
  });

  it('a page without a layout, the same; its hints name each file once', () => {
    const page =
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./ui/x-card.fud"></head>' +
      '<body><x-card></x-card><x-card></x-card></body></html>\n';
    const g = resolveDocument('/app/p.fud', memoryIo({ '/app/p.fud': page, '/app/ui/x-card.fud': CARD })).value;
    const out = emitPageModuleMapped(g, host().options);
    expect(out.code).not.toContain('STYLE_POLYFILL');
    expect(out.code).toContain(`'data-fud-sheets', "/assets/theme.css /assets/x-card.css"`);
    expect(out.hints!.map((h) => h.href)).toEqual(['/assets/theme.css', '/assets/x-card.css']);
  });
});

describe('sheetUrlsOf: the files of one tag', () => {
  const g = (): DocumentGraph => graph();
  const linker = (o: EmitOptions) => new AssetLinker(true, undefined, o.assetUrl);

  it('a `url(…)` that is no relative path is not rebased: the host links it as it was written', () => {
    const card = '<head><style>.a { background: url(/abs.png) } .b { background: url(https://x/y.png) }</style></head>\n' +
      '<x-c>\n  <template shadowrootmode="open"><b class="a">c</b></template>\n</x-c>\n';
    const doc = resolveDocument(
      '/app/p.fud',
      memoryIo({ '/app/p.fud': '<!DOCTYPE html>\n<html><head><link rel="component" href="./x-c.fud"></head><body><x-c></x-c></body></html>\n', '/app/x-c.fud': card }),
    ).value;
    const { published, options } = host();
    sheetUrlsOf(doc, options, linker(options))!('x-c');
    // `/abs.png` reaches the host's `assetUrl` as `/abs.png` (a file of `public/`), not as a
    // path rebased onto the page; another origin is no file of the project.
    expect(published.get('x-c')).toBe('.a{background:url("/assets//abs.png")}.b{background:url(https://x/y.png)}');
  });

  it('with no project sheets, or a chain naming one the project does not have, only its own', () => {
    const { options } = host();
    const { projectStyles: _, ...bare } = options;
    expect(sheetUrlsOf(g(), bare, linker(bare))!('x-card')).toBe('/assets/x-card.css');
    const chained = { ...options, styleChains: new Map([['x-card', ['nadie', 'theme']]]) };
    expect(sheetUrlsOf(g(), chained, linker(chained))!('x-card')).toBe('/assets/theme.css /assets/x-card.css');
  });

  it('a tag the graph has no component for wears only the project’s; none without `componentSheet`', () => {
    const { options } = host();
    expect(sheetUrlsOf(g(), options, linker(options))!('x-nadie')).toBe('/assets/theme.css');
    expect(sheetUrlsOf(g(), host(false).options, linker(options))).toBeUndefined();
  });
});

describe('the client chunk (criterion 10)', () => {
  const COUNTER =
    '@code {\n  import { signal } from "@fudic/core";\n  const n = signal(0);\n}\n' +
    '<head><style>:host { color: red }</style></head>\n' +
    '<x-n>\n  <template shadowrootmode="open">@n()</template>\n</x-n>\n';
  const PARENT =
    '<link rel="component" href="./x-n.fud">\n' +
    '@code {\n  import { signal } from "@fudic/core";\n  const on = signal(true);\n}\n' +
    '<x-p>\n  <template shadowrootmode="open"><b>@on()</b>@if (on()) {<x-n></x-n>}</template>\n</x-p>\n';

  function client(tag: string, options: EmitOptions): string {
    const io = memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      '/x-n.fud': COUNTER,
      '/x-p.fud': PARENT,
    });
    const g = resolveComponents('/page.fud', io);
    return emitComponentClientModuleMapped(g, g.components.get(tag)!, options).code;
  }

  it('a fabricated child host carries the same `data-fud-sheets` the server writes', () => {
    const code = client('x-p', host().options);
    expect(code).toContain(`'data-fud-sheets', "/assets/theme.css /assets/x-n.css"`);
    expect(client('x-p', host(false).options)).toContain(`'data-fud-adopt', "theme x-n"`);
  });

  it('the adopt path finds the root’s first element past the `<link>`s that open it', () => {
    // `x-p` wears one file, the project's: one step.
    expect(client('x-p', host().options)).toContain('= $dom.nextElementSibling($dom.firstElementChild($shadow));');
    expect(client('x-p', host(false).options)).toContain('= $dom.firstElementChild($shadow);');
  });

  it('a run at the end of the root is still its last node: the links are in front', () => {
    expect(client('x-n', host().options)).toContain('= $dom.lastChild($shadow);');
  });
});

describe('without `componentSheet`, the emit of always (criterion 11)', () => {
  it('style modules and the polyfill in the page, `<style>`s inside it', () => {
    const { options } = host(false);
    const out = emitRouteModuleMapped(graph(), options);
    expect(out.code).toContain('STYLE_POLYFILL');
    expect(out.code).toContain(`'data-fud-adopt', "theme x-card"`);
    // The `?inline` sheet is a `<style>` in the page, so nothing is hinted.
    expect(out.hints).toEqual([]);
  });
});
