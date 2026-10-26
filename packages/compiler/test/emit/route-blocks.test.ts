/**
 * SDD-39 §6.7, §6.15, §6.16 — what a reactive page publishes about its route.
 *
 * Three things, and all three follow the rule the other blocks already follow: what is empty
 * is not emitted. A route with no client half claims no id, names no chunk and carries no
 * `data` — a level-1 page costs the bytes it always cost.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import { emitLayoutModule, emitRouteModule, emitRouteModuleMapped } from '../../src/emit/index.js';
import { memoryIo, ssrIo } from './_support.js';
import type { LinkedApi, ResolveIo } from '../../src/types/io.js';
import type { SsrDom } from '@fudic/ssr';

/** The facts of the `.fudapi` files these routes link (SDD-60 §3.14), as a host hands them over. */
const APIS: Record<string, LinkedApi> = {
  '/r.fudapi': { id: 'routes/r', load: true, route: '/r.fud', paths: false, layout: false, functions: [], forms: [] },
  '/p.fudapi': { id: 'routes/p', load: false, paths: true, layout: false, functions: [], forms: [] },
};

const routeIo = (files: Record<string, string>): ResolveIo => ({ ...memoryIo(files), api: (path) => APIS[path] });

const LAYOUT = [
  '<!DOCTYPE html><html><head>@RenderHead()</head>',
  '<body>@RenderSection(nav)<main>@RenderBody()</main></body></html>',
].join('\n');

const CHILD = [
  '@code { const { count } = props<{ count: Signal<number> }>(); }',
  '<signal-display><template shadowrootmode="open">',
  '<output>@count()</output>',
  '</template></signal-display>',
].join('\n');

type PageFn = (data: unknown, io: unknown) => Iterable<string>;

function evalModule(code: string, bindings: Record<string, unknown>, returns: string): unknown {
  const body = code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
  const names = Object.keys(bindings);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, body)(...Object.values(bindings)) as unknown;
}

/** A component stand-in that claims its host and fills a slice, as a real `render` does. */
function childRender(tag: string) {
  return (
    $dom: {
      claim: (n: unknown) => void;
      state: (s: unknown, v: readonly unknown[]) => void;
      element: (t: string) => unknown;
      append: (p: unknown, c: unknown) => void;
      text: (s: string) => unknown;
      attachShadow: (h: unknown) => unknown;
    },
    $shadow: unknown,
    props: Record<string, unknown>,
  ): void => {
    $dom.append($shadow, $dom.text(`[${tag}]`));
    $dom.state($shadow, Object.values(props ?? {}));
  };
}

/** Render a route with its layout through the REAL `@fudic/ssr`, keeping the adapter. */
function render(
  route: string,
  options: { routeName?: string } = {},
  extra: Record<string, string> = {},
): { html: string; dom: SsrDom } {
  const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT, ...extra });
  const graph = resolveDocument('/r.fud', io).value;
  const bindings: Record<string, unknown> = {
    renderSignalDisplay: childRender('signal-display'),
    renderSignalDisplayTag: 'signal-display',
    renderSignalDisplayCss: '',
  };
  const layout = evalModule(emitLayoutModule(graph, graph.layouts[0]!), bindings, 'layout');
  const page = evalModule(emitRouteModule(graph, options), { ...bindings, layout }, 'page') as PageFn;
  const { io: ssr, dom } = ssrIo();
  const html = [...page({ user: 'pedro', token: 'x', items: [1] }, ssr)].join('');
  return { html, dom: dom() };
}

const blockOf = (html: string, id: string): string | null => {
  const open = html.indexOf(`id="${id}"`);
  if (open === -1) return null;
  const start = html.indexOf('>', open) + 1;
  return html.slice(start, html.indexOf('</script>', start));
};

describe('the `<body>` claims its id, and it is the last (§6.7, §4.2)', () => {
  it('takes the highest id of the page and fills its slice through `stateOf`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./d.fud">',
      '@code { const count = signal(7); }',
      '<signal-display .count=@count></signal-display>',
    ].join('\n');
    const { html } = render(route, { routeName: 'ruta' }, { '/d.fud': CHILD });
    // The child claimed 0 while the body was being built; the route claims when it ends.
    expect(html).toContain('<signal-display data-fud-id="0"');
    expect(html).toContain('<body data-fud-id="1">');
  });

  it('hands the child THE SAME cell: one address, written down once', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./d.fud">',
      '@code { const count = signal(7); }',
      '<signal-display .count=@count></signal-display>',
    ].join('\n');
    const { html } = render(route, { routeName: 'ruta' }, { '/d.fud': CHILD });
    const [offsets, data] = JSON.parse(blockOf(html, 'fud-state')!) as [number[], unknown[]];
    // Instance 0 is the child: its one slot is a marker pointing at the route's cell.
    expect(data.slice(offsets[0], offsets[1])).toEqual([{ $: [1, 0] }]);
    // Instance 1 is the `<body>`: no props, one cell, carrying the value it was painted with.
    expect(data.slice(offsets[1], offsets[2])).toEqual([7]);
  });

  it('publishes the route name, and it is what the runtime derives the URL from', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { const n = signal(1); }',
      '<output>@n()</output>',
    ].join('\n');
    const { html } = render(route, { routeName: 'blog-slug' });
    expect(blockOf(html, 'fud-route')).toBe('"blog-slug"');
  });

  it('claims nothing and publishes nothing when the route has no client half', () => {
    const route = '<link rel="layout" href="./l.fud">\n<p>estática</p>';
    const { html } = render(route, { routeName: 'ruta' });
    expect(html).not.toContain('data-fud-id');
    expect(blockOf(html, 'fud-route')).toBeNull();
    expect(blockOf(html, 'fud-state')).toBeNull();
  });

  it('and nothing either when the build does not know what the route is called', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { const n = signal(1); }',
      '<output>@n()</output>',
    ].join('\n');
    const { html } = render(route);
    expect(html).not.toContain('<body data-fud-id');
    expect(blockOf(html, 'fud-route')).toBeNull();
  });
});

describe('what the route contributes to the page maps (§6.8, §4.6)', () => {
  const ISLAND = [
    '@code { const n = signal(0); function nada() {} }',
    '<app-island><template shadowrootmode="open">',
    '<button @click=@nada>@n()</button>',
    '</template></app-island>',
  ].join('\n');

  const treeOf = (code: string): Record<string, readonly string[]> => {
    const match = /const FUD_TREE = (\{.*\});/u.exec(code);
    return match === null ? {} : (JSON.parse(match[1]!) as Record<string, readonly string[]>);
  };
  const eagerOf = (code: string): readonly string[] => {
    const match = /const FUD_EAGER = (\[.*\]);/u.exec(code);
    return match === null ? [] : (JSON.parse(match[1]!) as readonly string[]);
  };

  it('lists ONLY the components it hands a prop to, and not the islands beside them', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./d.fud">',
      '<link rel="component" href="./i.fud">',
      '@code { const count = signal(1); }',
      '<signal-display .count=@count></signal-display>',
      '<app-island></app-island>',
      '<app-island></app-island>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT, '/d.fud': CHILD, '/i.fud': ISLAND });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(treeOf(code)['ruta']).toEqual(['signal-display']);
  });

  it('has no entry at all when it hands nobody anything', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./i.fud">',
      '@code { const n = signal(1); function mas() { n.set(n() + 1); } }',
      '<button @click=@mas>+1</button>',
      '<app-island></app-island>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT, '/i.fud': ISLAND });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(treeOf(code)['ruta']).toBeUndefined();
  });

  it('names itself in `fud-eager` when its `@code` calls `effect(...)`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code {',
      '  const ahora = signal(0);',
      '  effect(() => { const id = setInterval(() => ahora.set(1), 1000); return () => clearInterval(id); });',
      '}',
      '<time>@ahora()</time>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(eagerOf(code)).toEqual(['ruta']);
  });

  it('and a COMPONENT whose `@code` calls `effect(...)` joins the same list', () => {
    const clock = [
      '@code {',
      '  const ahora = signal(0);',
      '  effect(() => { const id = setInterval(() => ahora.set(1), 1000); return () => clearInterval(id); });',
      '}',
      '<app-clock><template shadowrootmode="open">',
      '<time>@ahora()</time>',
      '</template></app-clock>',
    ].join('\n');
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./c.fud">',
      '<app-clock></app-clock>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT, '/c.fud': clock });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(eagerOf(code)).toEqual(['app-clock']);
  });

  it('stays out of the list when nothing has to come up without a gesture', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { const n = signal(1); }',
      '<output>@n()</output>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(eagerOf(code)).toEqual([]);
  });
});

describe('`fud-data`: only what the client half reads (§6.15, §6.16)', () => {
  // `load` lives in the linked `.fudapi` (SDD-60 §3.14); the host hands over its facts.
  const withLoad = (client: string): string =>
    [
      '<link rel="layout" href="./l.fud">',
      '<link rel="server" href="./r.fudapi">',
      `@code { ${client} }`,
      '<output>@n()</output>',
    ].join('\n');

  it('publishes the roots it reads and nothing else', () => {
    const route = withLoad('const n = signal(1); function saluda() { alert(data.user); }');
    const { html } = render(route, { routeName: 'ruta' });
    expect(JSON.parse(blockOf(html, 'fud-data')!)).toEqual({ user: 'pedro' });
  });

  it('publishes what the TEMPLATE reads too: a reactive route repaints it in the browser', () => {
    // Before, only the browser code was read: `fud-data` went out without `items`, and every
    // repaint of the `@foreach` threw «U.items is not iterable».
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="server" href="./r.fudapi">',
      '@code { const n = signal(1); }',
      '<output>@n()</output>',
      '<ul>@foreach (const i of data.items) { <li>@i</li> }</ul>',
    ].join('\n');
    const { html } = render(route, { routeName: 'ruta' });
    // The roots read and only those: `user` and `token` stay on the server.
    expect(JSON.parse(blockOf(html, 'fud-data')!)).toEqual({ items: [1] });
  });

  it('publishes no block at all when the client half never names `data`', () => {
    const route = withLoad('const n = signal(1);');
    const { html } = render(route, { routeName: 'ruta' });
    expect(blockOf(html, 'fud-data')).toBeNull();
  });

  it('sends `data` whole for a dynamic access, and says nothing about it (§6.16)', () => {
    const route = withLoad('const n = signal(1); function lee(k) { return data[k]; }');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT });
    const out = emitRouteModuleMapped(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(out.diagnostics).toEqual([]);
    const { html } = render(route, { routeName: 'ruta' });
    expect(JSON.parse(blockOf(html, 'fud-data')!)).toEqual({ user: 'pedro', token: 'x', items: [1] });
  });

  it('sends it whole when `data` is handed to something, with no diagnostic either', () => {
    const route = withLoad('const n = signal(1); function manda() { console.log(data); }');
    const { html } = render(route, { routeName: 'ruta' });
    expect(JSON.parse(blockOf(html, 'fud-data')!)).toEqual({ user: 'pedro', token: 'x', items: [1] });
  });

  it('warns FUD0621 when the client reads `data` and the route declares no `load`', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { const n = signal(1); function saluda() { alert(data.user); } }',
      '<output>@n()</output>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT });
    const out = emitRouteModuleMapped(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    const found = out.diagnostics.filter((d) => d.code === 'FUD0621');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warning');
    // The span points at the `data` the author wrote, not at the top of the file.
    expect(route.slice(found[0]!.span.start, found[0]!.span.end)).toBe('data');
  });

  it('a `load` written in the `@code` is no `load`: it is the `.fudapi`’s to declare (SDD-60)', () => {
    for (const load of [
      'export const load = async () => ({ user: "pedro" });',
      'async function load() { return { user: "pedro" }; } export { load };',
    ]) {
      const route = [
        '<link rel="layout" href="./l.fud">',
        `@code { ${load} const n = signal(1); function s() { alert(data.user); } }`,
        '<output>@n()</output>',
      ].join('\n');
      const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT });
      const out = emitRouteModuleMapped(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
      expect(out.diagnostics.map((d) => d.code)).toEqual(['FUD0621']);
    }
  });

  it('gives a callback of the route its own cell slot', () => {
    const BTN = [
      '@code { const { onSave } = props<{ onSave: () => void }>(); }',
      '<app-btn><template shadowrootmode="open"><button @click=@onSave()>ok</button></template></app-btn>',
    ].join('\n');
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./b.fud">',
      '@code { function guarda() {} }',
      '<app-btn .onSave=@guarda></app-btn>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT, '/b.fud': BTN });
    const code = emitRouteModule(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    // A callback has no value to serialise, so its declaration carries `of` alone.
    expect(code).toContain('$dom.stateOf($parent, [], [{ of: guarda }]);');
  });

  it('stays silent when the route declares `paths` but the client reads nothing', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="server" href="./p.fudapi">',
      '@code { const n = signal(1); }',
      '<output>@n()</output>',
    ].join('\n');
    const io = routeIo({ '/r.fud': route, '/l.fud': LAYOUT });
    const out = emitRouteModuleMapped(resolveDocument('/r.fud', io).value, { routeName: 'ruta' });
    expect(out.diagnostics).toEqual([]);
  });
});
