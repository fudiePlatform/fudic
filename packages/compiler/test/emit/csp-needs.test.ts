/**
 * SDD-84 §3.4 and §4.7 — what the emit puts in a page that a CSP has to let in, and the nonce on it.
 *
 * Every place that writes something inline, or a script of the app, records its need in the output
 * of the compilation, declared beside the code that writes it; the build compares them with
 * `page.headers`. And everything the parser meets under `'strict-dynamic'` carries the response's
 * nonce: the runtime's tags, each `modulepreload`, and the author's own scripts and import map —
 * never JSON-LD, which nothing runs.
 */

import { describe, expect, it } from 'vitest';
import { TRUSTED_TYPES_NEEDS } from '@fudic/dom';
import {
  emitComponentClientModuleMapped,
  emitLayoutModuleMapped,
  emitPageModuleMapped,
  emitRouteClientModuleMapped,
  emitRouteModuleMapped,
  resolveComponents,
  resolveDocument,
  type EmitOptions,
} from '../../src/emit/index.js';
import { HEAD_NEEDS, headScriptNeeds, runtimeFormOf, runtimeNeeds, uniqueNeeds } from '../../src/emit/parts.js';
import { POLYFILL_NEEDS } from '../../src/emit/polyfill.js';
import { drain, memoryIo, minimalSsr, pageModuleOf, parse } from './_support.js';
import type { ElementNode } from '../../src/html/index.js';

/** A styled component that hydrates: the polyfill, a style module and the runtime. */
const COUNTER = [
  '@code { const n = signal(0); }',
  '<head><style>p { color: red; }</style></head>',
  '<x-count><template shadowrootmode="open"><p @click=@(() => n.set(n() + 1))>@n()</p></template></x-count>',
].join('\n');

/** A standalone page whose head is `head`, composing the counter. */
function page(head: string): string {
  return [
    '<!DOCTYPE html><html><head>',
    '<link rel="component" href="./x-count.fud">',
    head,
    '</head><body><x-count></x-count></body></html>',
  ].join('\n');
}

const RUNTIME = { boot: '/boot.js', main: '/main.js', pieces: ['/p1.js', '/p2.js'], inline: 'go()' };

describe('the nonce on everything the parser meets (§4.7)', () => {
  it('the runtime, its boot, each modulepreload and the import map carry it; JSON-LD does not', async () => {
    const io = memoryIo({
      '/home.fud': page(
        [
          '<script type="importmap">{"imports":{}}</script>',
          '<script type="application/ld+json">{"@type":"Thing"}</script>',
          '<script src="fudic:runtime"></script>',
        ].join('\n'),
      ),
      '/x-count.fud': COUNTER,
    });
    const render = await pageModuleOf(resolveComponents('/home.fud', io));
    const html = await drain(render({}, { ...minimalSsr(), nonce: 'N0', runtime: RUNTIME }));
    expect(html).toContain('<script nonce="N0" type="importmap">{"imports":{}}</script>');
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('<script type="module" nonce="N0" src="/boot.js"></script>');
    expect(html).toContain('<link rel="modulepreload" nonce="N0" href="/p1.js"><link rel="modulepreload" nonce="N0" href="/p2.js">');
    expect(html).toContain('<script type="module" nonce="N0" src="/main.js"></script>');
    // The page's own inline things, as before.
    expect(html).toContain('<script nonce="N0">');
    expect(html).toContain('<style type="module" nonce="N0" specifier="x-count">');
    // Without a nonce, not a trace of one (criterion 15).
    const plain = await drain(render({}, { ...minimalSsr(), runtime: RUNTIME }));
    expect(plain).not.toContain('nonce');
    expect(plain).toContain('<script type="module" src="/main.js"></script>');
  });

  it('a script of the head with an interpolated attribute carries it too', async () => {
    const io = memoryIo({
      '/home.fud': page('<script src="/a.js" data-v="@data.v"></script>\n<meta name="x" content="@data.v">'),
      '/x-count.fud': COUNTER,
    });
    const render = await pageModuleOf(resolveComponents('/home.fud', io));
    const html = await drain(render({ v: '1' }, { ...minimalSsr(), nonce: 'N1' }));
    expect(html).toContain('<script src="/a.js" data-v="1" nonce="N1"></script>');
    expect(html).toContain('<meta name="x" content="1">');
  });

  it('the inline runtime carries it, and records the need of a script inside the page', () => {
    const io = memoryIo({ '/home.fud': page('<script src="fudic:runtime?inline"></script>'), '/x-count.fud': COUNTER });
    const out = emitPageModuleMapped(resolveComponents('/home.fud', io));
    expect(out.needs).toEqual(uniqueNeeds([...HEAD_NEEDS.inlineRuntime, ...POLYFILL_NEEDS, ...HEAD_NEEDS.styleModules]));
  });
});

describe('what each writer records (§3.4)', () => {
  it('a page: its scripts, its runtime, the polyfill and the style modules, each once', () => {
    const io = memoryIo({
      '/home.fud': page(
        [
          '<script type="importmap">{}</script>',
          '<script type="application/ld+json">{}</script>',
          '<script src="/a.js"></script>',
          '<script type="module" src="/b.js"></script>',
          '<script type="text/plain">x</script>',
          '<style>body { margin: 0; }</style>',
          '<script src="fudic:runtime"></script>',
        ].join('\n'),
      ),
      '/x-count.fud': COUNTER,
    });
    const out = emitPageModuleMapped(resolveComponents('/home.fud', io));
    expect(out.needs).toEqual([
      ...HEAD_NEEDS.runtime,
      ...HEAD_NEEDS.importMap,
      ...HEAD_NEEDS.headScript,
      ...HEAD_NEEDS.headStyle,
      ...POLYFILL_NEEDS,
      ...HEAD_NEEDS.styleModules,
    ]);
  });

  it('a page with nothing inline and nothing to hydrate needs nothing', () => {
    const io = memoryIo({ '/home.fud': '<!DOCTYPE html><html><head><title>t</title></head><body><p>x</p></body></html>' });
    expect(emitPageModuleMapped(resolveComponents('/home.fud', io)).needs).toEqual([]);
  });

  it('an embedded stylesheet and a guide written inside the page need the nonce of a style', () => {
    const io = memoryIo({
      '/home.fud': '<!DOCTYPE html><html><head><link rel="stylesheet" href="./t.css?inline"></head><body><p>x</p></body></html>',
    });
    const options: EmitOptions = { linkAssets: true, assetExists: () => true, assetText: () => 'p { color: red }' };
    expect(emitPageModuleMapped(resolveComponents('/home.fud', io), options).needs).toEqual(HEAD_NEEDS.embeddedSheet);
  });

  it('a route records the form of its layout’s marker, and the layout what its own head writes', () => {
    const route = ['<link rel="layout" href="./l.fud">', '@code { const n = signal(1); }', '<output>@n()</output>'].join('\n');
    const layoutOf = (marker: string): string =>
      ['<!DOCTYPE html><html><head>', marker, '<style>body { margin: 0; }</style>', '@RenderHead()</head>', '<body>@RenderBody()</body></html>'].join('\n');
    for (const [marker, needs] of [
      ['<script src="fudic:runtime"></script>', HEAD_NEEDS.runtime],
      ['<script src="fudic:runtime?inline"></script>', HEAD_NEEDS.inlineRuntime],
      ['<title>t</title>', []],
    ] as const) {
      const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': layoutOf(marker) })).value;
      // A built route, so it claims an id and carries the runtime that reads it.
      expect(emitRouteModuleMapped(graph, { routeName: 'r' }).needs).toEqual(needs);
      expect(emitLayoutModuleMapped(graph, graph.layouts[0]!).needs).toEqual(HEAD_NEEDS.headStyle);
    }
  });

  it('a layout with a script of its own reads the nonce, and one without reads none', () => {
    const route = '<link rel="layout" href="./l.fud">\n<p>x</p>';
    const layoutWith = (head: string): string => {
      const layout = `<!DOCTYPE html><html><head>${head}@RenderHead()</head><body>@RenderBody()</body></html>`;
      const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': layout })).value;
      return emitLayoutModuleMapped(graph, graph.layouts[0]!).code;
    };
    const own = layoutWith('<script src="/a.js"></script>');
    expect(own).toContain("const $nonce = io.nonce ? ' nonce=\"' + io.nonce + '\"' : '';");
    expect(own).toContain('"<script" + $nonce + " src=\\"/a.js\\"></script>"');
    // The marker is the route's slot, written in the route's module: nothing to read here.
    expect(layoutWith('<script src="fudic:runtime"></script>')).not.toContain('const $nonce');
  });

  it('a route’s own head contributions record theirs', () => {
    const route = ['<link rel="layout" href="./l.fud">', '<head><script src="/x.js"></script></head>', '<p>x</p>'].join('\n');
    const layout = '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': layout })).value;
    expect(emitRouteModuleMapped(graph).needs).toEqual(HEAD_NEEDS.headScript);
  });
});

describe('the policy of Trusted Types, where the client paints HTML (§4.6)', () => {
  const client = (template: string, code = ''): readonly unknown[] => {
    const io = memoryIo({
      '/home.fud': '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
      '/m.fud': `@code {\n${code}\n}\n<m-el>\n  <template shadowrootmode="open">${template}</template>\n</m-el>\n`,
    });
    const graph = resolveComponents('/home.fud', io);
    return emitComponentClientModuleMapped(graph, graph.components.get('m-el')!).needs;
  };

  it('an @raw that the client rewrites needs the policy’s name', () => {
    expect(client('<div>@raw(html())</div>', '  const html = signal("<b>x</b>");')).toEqual(TRUSTED_TYPES_NEEDS);
  });

  it('a form’s summary does too; an error marker and a plain component do not', () => {
    const form = "  import { f } from './user.form.js';";
    expect(client('<form control="@f"><div summary="@f"></div></form>', form)).toEqual(TRUSTED_TYPES_NEEDS);
    expect(client('<input control="@f.title"><p error="@f.title"></p>', form)).toEqual([]);
    expect(client('<p @click=@(() => n.set(1))>@n()</p>', '  const n = signal(0);')).toEqual([]);
  });

  it('a route’s client half that paints HTML needs it as well', () => {
    const layout = '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';
    const routed = (markup: string) =>
      resolveDocument('/r.fud', memoryIo({ '/r.fud': `<link rel="layout" href="./l.fud">\n${markup}`, '/l.fud': layout })).value;
    const graph = routed('@code { const h = signal("<i>x</i>"); }\n<div>@raw(h())</div>');
    expect(emitRouteClientModuleMapped(graph)!.needs).toEqual(TRUSTED_TYPES_NEEDS);
    const plain = routed('@code { const n = signal(1); }\n<output>@n()</output>');
    expect(emitRouteClientModuleMapped(plain)!.needs).toEqual([]);
  });
});

describe('the pieces of the decision', () => {
  /** The first element of a parsed head-less document's body. */
  const element = (markup: string): ElementNode =>
    (parse(`<!DOCTYPE html><html><head>${markup}</head><body></body></html>`) as unknown as {
      readonly head: ElementNode;
    }).head.children.find((c): c is ElementNode => c.type === 'element')!;

  it('headScriptNeeds reads the type: code, the import map, or nothing', () => {
    expect(headScriptNeeds(element('<script src="/a.js"></script>'))).toBe(HEAD_NEEDS.headScript);
    expect(headScriptNeeds(element('<script type="text/javascript" src="/a.js"></script>'))).toBe(HEAD_NEEDS.headScript);
    expect(headScriptNeeds(element('<script type="application/x-ecmascript" src="/a.js"></script>'))).toBe(HEAD_NEEDS.headScript);
    expect(headScriptNeeds(element('<script type=" ImportMap ">{}</script>'))).toBe(HEAD_NEEDS.importMap);
    expect(headScriptNeeds(element('<script type="application/ld+json">{}</script>'))).toBeNull();
    expect(headScriptNeeds(element('<meta charset="utf-8">'))).toBeNull();
  });

  it('runtimeFormOf and runtimeNeeds', () => {
    expect(runtimeFormOf([element('<title>t</title>')])).toBeNull();
    expect(runtimeNeeds(false, 'file')).toEqual([]);
    expect(runtimeNeeds(true, null)).toEqual([]);
    expect(runtimeNeeds(true, 'file')).toBe(HEAD_NEEDS.runtime);
  });

  it('uniqueNeeds keeps each need once, in the order first met', () => {
    expect(uniqueNeeds([...HEAD_NEEDS.runtime, ...POLYFILL_NEEDS, ...HEAD_NEEDS.runtime])).toEqual([...HEAD_NEEDS.runtime, ...POLYFILL_NEEDS]);
  });
});
