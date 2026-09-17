/**
 * SDD-42 §4.1, §4.4 — the project's guide, hoisted once and adopted first.
 *
 * Everything here renders through the REAL `@fudic/ssr`: the subject is
 * `shadowrootadoptedstylesheets`, and the fake serializer of `renderPageHtml` does not
 * write it at all.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  resolveDocument,
  emitPageModule,
  emitRouteModule,
  emitLayoutModule,
  type ProjectStyle,
} from '../../src/emit/index.js';
import { memoryIo, pageModuleOf, ssrIo } from './_support.js';

const CARD =
  '<head><style>.card { padding: 8px; }</style></head>\n' +
  '<s-card><template shadowrootmode="open"><div class="card"><slot></slot></div></template></s-card>';
const PLAIN =
  '<s-plain><template shadowrootmode="open"><span><slot></slot></span></template></s-plain>';

/** A page over the given hosts, with whichever of the two components it names. */
function pageOf(body: string, components: readonly string[]): ReturnType<typeof memoryIo> {
  const links = components.map((c) => `<link rel="component" href="./${c}.fud">`).join('');
  return memoryIo({
    '/home.fud':
      `<!DOCTYPE html>\n<html><head>${links}<title>t</title></head><body>${body}</body></html>`,
    '/s-card.fud': CARD,
    '/s-plain.fud': PLAIN,
  });
}

const THEME: ProjectStyle = { specifier: '_theme', css: ':host { --gap: 8px; }' };
const LAYOUT: ProjectStyle = { specifier: '_layout', css: '.row { display: flex; }' };

async function render(
  io: ReturnType<typeof memoryIo>,
  projectStyles: readonly ProjectStyle[],
): Promise<string> {
  const page = await pageModuleOf(resolveComponents('/home.fud', io), { projectStyles });
  return [...page({}, ssrIo().io)].join('');
}

describe('SDD-42 §4.1 — the hoisted sheet and the adopted list', () => {
  it('§6.1 the project sheet is hoisted BEFORE the component’s, and adopted in front of it', async () => {
    const html = await render(pageOf('<s-card></s-card>', ['s-card']), [THEME]);

    const theme = html.indexOf('<style type="module" specifier="_theme">');
    const card = html.indexOf('<style type="module" specifier="s-card">');
    expect(theme).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(-1);
    // Rule 2 of SDD-18 §3.2: the module has to be in the map before the template that
    // names it is parsed. And it is the cascade: the guide defines, the component adjusts.
    expect(theme).toBeLessThan(card);
    expect(html).toContain('shadowrootadoptedstylesheets="_theme s-card"');
  });

  it('§6.2 both channels carry the same list, in the same order', async () => {
    const html = await render(pageOf('<s-card></s-card>', ['s-card']), [THEME]);
    // The native attribute is consumed by the parser and gone; `data-fud-adopt` is what the
    // polyfill reads. The two disagreeing is a component styled one way natively and
    // another way everywhere else.
    expect(html).toContain('data-fud-adopt="_theme s-card"');
    expect(html).toContain('shadowrootadoptedstylesheets="_theme s-card"');
  });

  it('§6.3 one copy per document, however many components adopt it', async () => {
    const html = await render(
      pageOf('<s-card></s-card><s-card></s-card><s-plain></s-plain>', ['s-card', 's-plain']),
      [THEME],
    );
    const copies = html.split('<style type="module" specifier="_theme">').length - 1;
    expect(copies).toBe(1);
  });

  it('§6.4 the order of the array is the order of the list', async () => {
    const forwards = await render(pageOf('<s-card></s-card>', ['s-card']), [THEME, LAYOUT]);
    expect(forwards).toContain('shadowrootadoptedstylesheets="_theme _layout s-card"');

    const backwards = await render(pageOf('<s-card></s-card>', ['s-card']), [LAYOUT, THEME]);
    expect(backwards).toContain('shadowrootadoptedstylesheets="_layout _theme s-card"');
  });

  it('§6.5 a component with no CSS adopts the guide and publishes no sheet of its own', async () => {
    const html = await render(pageOf('<s-plain></s-plain>', ['s-plain']), [THEME]);
    // BUG-31 §T4 with the premise widened: what it forbade was a CONSTRUCTABLE EMPTY sheet,
    // and that is still forbidden. What it cannot forbid any more is the adoption, because
    // now there is something real to adopt.
    expect(html).toContain('data-fud-adopt="_theme"');
    expect(html).toContain('shadowrootadoptedstylesheets="_theme"');
    expect(html).not.toContain('specifier="s-plain"');
  });

  it('§6.7 the polyfill goes out for a project whose components bring no CSS at all', async () => {
    const withGuide = await render(pageOf('<s-plain></s-plain>', ['s-plain']), [THEME]);
    expect(withGuide).toContain('adoptedStyleSheets');

    // And without a guide the same page emits none of it — BUG-31 §T3, untouched.
    const without = await render(pageOf('<s-plain></s-plain>', ['s-plain']), []);
    expect(without).not.toContain('adoptedStyleSheets');
    expect(without).not.toContain('data-fud-adopt');
  });
});

describe('SDD-42 §4.1 — a route with a layout, which is the shape a real app has', () => {
  /** A layout owning the shell, a route inside it, and one styled component. */
  const files = {
    '/_layout.fud':
      '<!DOCTYPE html>\n<html><head><title>t</title>@RenderHead()</head>' +
      '<body><main>@RenderBody()</main></body></html>',
    '/r.fud':
      '<link rel="layout" href="./_layout.fud">' +
      '<link rel="component" href="./s-card.fud">\n' +
      '<s-card></s-card>',
    '/s-card.fud': CARD,
  };

  it('hoists the guide in the ROUTE, which is what fills the layout’s @RenderHead()', () => {
    const graph = resolveDocument('/r.fud', memoryIo(files)).value;
    const route = emitRouteModule(graph, { projectStyles: [THEME] });

    // The shell is the layout's, but everything a page CONTRIBUTES to the head travels in
    // the route's module and is injected at `@RenderHead()` — the polyfill and the sheets
    // included. So that is where the guide is hoisted, and its order rule holds there.
    expect(route).toContain('PROJECT_STYLES');
    expect(route).toContain(':host{--gap:8px;}');
    expect(route.indexOf('PROJECT_STYLES.map')).toBeGreaterThan(route.indexOf('STYLE_POLYFILL'));
    expect(route).toContain(`'data-fud-adopt', "_theme s-card"`);
  });

  it('and a host the LAYOUT itself writes adopts the same list', () => {
    const withHost = {
      ...files,
      '/_layout.fud':
        '<!DOCTYPE html>\n<html><head><link rel="component" href="./s-card.fud">' +
        '<title>t</title>@RenderHead()</head>' +
        '<body><s-card></s-card><main>@RenderBody()</main></body></html>',
    };
    const graph = resolveDocument('/r.fud', memoryIo(withHost)).value;
    const layout = emitLayoutModule(graph, graph.layouts[0]!, { projectStyles: [THEME] });
    expect(layout).toContain(`'data-fud-adopt', "_theme s-card"`);
  });

  it('and with no guide both modules are what they were', () => {
    const graph = resolveDocument('/r.fud', memoryIo(files)).value;
    const route = emitRouteModule(graph);
    expect(route).not.toContain('PROJECT_STYLES');
    expect(route).toContain(`'data-fud-adopt', "s-card"`);
  });
});

describe('SDD-42 §4.7 — one path for CSS', () => {
  it('§6.8 the guide is compacted by the pass a component’s sheet goes through', () => {
    const code = emitPageModule(resolveComponents('/home.fud', pageOf('<s-card></s-card>', ['s-card'])), {
      projectStyles: [{ specifier: '_theme', css: ':host {\n  --gap:   8px;\n}\n' }],
    });
    // The whitespace is gone; what a component's `<style>` loses, this loses too.
    expect(code).toContain('css: `:host{--gap:8px;}`');
  });

  it('§6.8 a url(…) inside the guide is linked, and a missing one is reported not inlined', () => {
    const io = pageOf('<s-card></s-card>', ['s-card']);
    const graph = resolveComponents('/home.fud', io);
    const present = emitPageModule(graph, {
      linkAssets: true,
      assetExists: (spec) => spec === './logo.svg',
      projectStyles: [{ specifier: '_theme', css: ':host{background:url(./logo.svg)}' }],
    });
    expect(present).toContain('import __fudic_asset_0 from "./logo.svg";');
    expect(present).toContain('url(${__fudic_asset_0})');

    // A url nobody can resolve stays a literal, so the build does not abort — the host
    // reports FUD0363 from `missingAssets`, exactly as it does for a component's sheet.
    const missing = emitPageModule(graph, {
      linkAssets: true,
      assetExists: () => false,
      projectStyles: [{ specifier: '_theme', css: ':host{background:url(./nope.svg)}' }],
    });
    expect(missing).toContain('url(./nope.svg)');
    expect(missing).not.toContain('import __fudic_asset');
  });
});
