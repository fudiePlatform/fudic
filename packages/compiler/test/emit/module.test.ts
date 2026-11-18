/**
 * Module emit (SDD-15 server branch) — the real deliverable: one `.mjs` per component
 * and one for the page, produced from the AST + the resolved dependency graph. The
 * compiler emits TEXT and imports no runtime; these tests assert the generated source
 * structurally AND, where possible, EXECUTE it (a leaf component and the whole route, with its
 * layout) to
 * prove the codegen actually runs.
 *
 * Not covered here (browser-only): the style polyfill's runtime behaviour — it uses
 * MutationObserver / CSSStyleSheet / shadowRoot, so we only assert it is EMITTED. Its
 * effect (adopting sheets so styles apply) still requires opening the page in a browser.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { join } from 'node:path';
import {
  resolveComponents,
  resolveDocument,
  emitComponentModule,
  emitLayoutModule,
  emitRouteModule,
  type DocumentGraph,
} from '../../src/emit/index.js';
import {
  drain,
  fixturesDir,
  fixtureIo,
  LINK_LAYOUT,
  memoryIo,
  pageModuleOf,
  recordingDom,
  evalLeafModule,
  minimalSsr,
  withLayout,
} from './_support.js';

const graph: DocumentGraph = resolveDocument(join(fixturesDir, 'home.fud'), fixtureIo).value;
const module = (tag: string): string => emitComponentModule(graph, graph.components.get(tag)!);

describe('emitComponentModule — a leaf component (app-badge)', () => {
  const src = module('app-badge');

  it('exports tag, css and render', () => {
    expect(src).toContain('export const tag = "app-badge";');
    expect(src).toContain('export const css = `');
    // The fourth parameter is the container this component resolves from, and every
    // component declares it: a component cannot know whether the page it lands in has DI,
    // and forwarding a container it never names costs nothing (SDD-38 §4.3).
    expect(src).toContain('export function render($dom, $shadow, props, $ioc) {');
  });

  it('has no ES imports (a leaf depends on nothing)', () => {
    expect(src).not.toContain('import ');
  });

  it('runs against a recording Dom and builds the expected calls', () => {
    const { render } = evalLeafModule(src);
    const { dom, calls } = recordingDom();
    render(dom, { $node: 'shadow' }, { tone: 'success' });

    const ops = calls.map((c) => c.op);
    expect(ops).toContain('element');
    expect(ops).toContain('append');

    // The static class is a literal, and each `class:` toggles its own token (SDD-85 §4.5).
    const classCall = calls.find((c) => c.op === 'setAttr' && c.args[1] === 'class');
    expect(classCall!.args[2]).toBe('badge');
    const toggles = calls.filter((c) => c.op === 'toggleClass').map((c) => c.args.slice(1));
    expect(toggles).toEqual([
      ['success', true],
      ['warning', false],
    ]);
  });

  it("defaults props<T>() when omitted (tone → 'neutral')", () => {
    const { render } = evalLeafModule(src);
    const { dom, calls } = recordingDom();
    render(dom, { $node: 'shadow' }, {}); // no props
    const toggles = calls.filter((c) => c.op === 'toggleClass').map((c) => c.args.slice(1));
    expect(toggles).toEqual([
      ['success', false],
      ['warning', false],
    ]); // neither success nor warning
  });
});

describe('emitComponentModule — composition & control flow (app-card)', () => {
  const src = module('app-card');

  it('imports only the child components it uses', () => {
    expect(src).toContain("import { render as renderAppButton } from './app-button.mjs';");
    expect(src).not.toContain('renderAppBadge'); // app-card never renders a badge
  });

  it('emits an inert signal (SSR contributes only the initial value)', () => {
    expect(src).toContain('const expanded = () => (false);');
  });

  it('renders a nested component host with data-fud-adopt + attachShadow + its render call', () => {
    // The ids moved with BUG-21: the whitespace nodes the emit can prove render nothing are
    // not emitted, and the counter is sequential. And again with SDD-85: the comments that keep
    // two texts apart take ids too.
    expect(src).toContain('$dom.setAttr($n12, \'data-fud-adopt\', "app-button");');
    expect(src).toContain('$dom.attachShadow($n12)');
    expect(src).toContain('renderAppButton($dom, $n13, { "variant": "ghost" }, $ioc);');
  });

  it('lowers @if/@else to real JS control flow', () => {
    expect(src).toContain('if (expanded()) {');
    expect(src).toContain('} else {');
  });

  it('lowers content interpolation to $dom.text(String((expr) ?? ""))', () => {
    expect(src).toContain("$dom.text(String((title) ?? ''))");
  });
});

describe('the inert stubs of the server branch (SDD-31 §6.16)', () => {
  const stubbed = (code: string, markup: string): string => {
    const io = memoryIo({
      '/page.fud':
        '<link rel="component" href="./x-stub.fud">\n' +
        '<html><head></head><body><x-stub></x-stub></body></html>\n',
      '/x-stub.fud':
        `@code {\n${code}}\n` +
        `<x-stub>\n  <template shadowrootmode="open">${markup}</template>\n</x-stub>\n`,
    });
    const g = resolveComponents('/page.fud', io);
    return emitComponentModule(g, g.components.get('x-stub')!);
  };

  it('a signal read with the call form prerenders instead of throwing', () => {
    const src = stubbed('  const expanded = signal(false);\n', '<p>@(expanded())</p>');
    expect(src).toContain('const expanded = () => (false); // inert signal');
    const { render } = evalLeafModule(src);
    const { dom, calls } = recordingDom();
    expect(() => render(dom, { $node: 'shadow' }, {})).not.toThrow();
    expect(calls.some((c) => c.op === 'text' && c.args[0] === 'false')).toBe(true);
  });

  it('a derived value is its own function, evaluated when read', () => {
    const src = stubbed(
      '  const count = signal(3);\n  const total = computed(() => count() * 2);\n',
      '<p>@(total())</p>',
    );
    expect(src).toContain('const total = (() => count() * 2); // inert computed');
    const { render } = evalLeafModule(src);
    const { dom, calls } = recordingDom();
    render(dom, { $node: 'shadow' }, {});
    expect(calls.some((c) => c.op === 'text' && c.args[0] === '6')).toBe(true);
  });
});

describe('emitComponentModule — attrExpr shapes', () => {
  // A crafted component exercising a MIXED (static + interpolation) attribute, which the
  // fixtures do not have. Resolved via an in-memory route that links it.
  const io = memoryIo(withLayout({
    '/home.fud': LINK_LAYOUT + '<link rel="component" href="./m.fud">\n',
    '/m.fud':
      // Non-props declarations: `y` is read by the markup, `helper` through it, `unused` by nobody.
      '@code {\n  const helper = 1;\n  const y = helper;\n  const unused = 2;\n}\n' +
      '<m-el>\n  <template shadowrootmode="open">' +
      '<div id="z" title="x-@y"></div><!-- a comment is dropped -->' +
      '</template>\n</m-el>\n',
  }));
  const g = resolveComponents('/home.fud', io);
  const src = emitComponentModule(g, g.components.get('m-el')!);

  it('emits a template literal for a mixed attribute and omits it when falsy', () => {
    expect(src).toContain("`x-${(y) ?? ''}`");
    // `$v`, not `$a`: `$a` is the client's apply closure now (BUG-12 §3.3), and a bound
    // value that shadowed it inside its own body is a trap waiting for the next edit.
    expect(src).toContain('if ($v === true)');
    expect(src).toContain('$v !== false && $v != null');
    expect(src).not.toContain('removeAttr'); // the server writes once: nothing to take back
  });

  it('emits a static non-class attribute as a setAttr with a JSON value', () => {
    expect(src).toContain('$dom.setAttr($n0, "id", "z");');
  });

  it('drops an author comment and carries into render only the server cut (SDD-60 §4.8)', () => {
    expect(src).not.toContain('a comment is dropped');
    // The `@code` is browser code; render gets what the markup reads, transitively: `y`, and
    // `helper` because `y` reads it. `unused` stays in the browser.
    expect(src).toContain('const helper = 1;');
    expect(src).toContain('const y = helper;');
    expect(src).not.toContain('const unused = 2;');
  });

  it('emits a static attribute value as a JSON string (via the page fixtures)', () => {
    // app-button variant="ghost" is passed as a static prop by app-card.
    expect(module('app-card')).toContain('{ "variant": "ghost" }');
  });
});

describe('emitRouteModule — home.mjs, the fixture route, and its layout', () => {
  const src = emitRouteModule(graph);
  const layoutSrc = emitLayoutModule(graph, graph.layouts[0]!);

  it('imports render/tag/css of every component', () => {
    for (const tag of ['AppCard', 'AppButton', 'AppBadge']) {
      expect(src).toContain(`import { render as render${tag}, tag as render${tag}Tag, css as render${tag}Css } from`);
    }
  });

  it('builds a COMPONENTS array and a page(data, io) that hands its pieces to the layout', () => {
    expect(src).toContain('const COMPONENTS = [');
    expect(src).toContain('export async function* page(data, io, $ioc, $props) {'); // streaming generator (SDD-19 §4.3)
    expect(src).toContain('const { serialize, escapeText, jsonBlock } = io;');
    expect(src).toContain('yield* layout(data, io, {');
  });

  it('interpolates the title via escapeText, and the layout passes its <meta> through', () => {
    expect(src).toContain("escapeText(String((data.title) ?? ''))");
    expect(layoutSrc).toContain('<meta charset=\\"utf-8\\">');
  });

  it('emits the style polyfill and places its <script> BEFORE the style modules', () => {
    expect(src).toContain('const STYLE_POLYFILL = `');
    expect(src).toContain('MutationObserver');
    // The `<script>` carries the per-response CSP nonce (SDD-20 §4.9); empty without one.
    // No indent before it since BUG-07 §4.2: head whitespace never reaches the tree.
    const scriptAt = src.indexOf("'<script' + $nonce + '>' + STYLE_POLYFILL");
    // The sheets carry the nonce too, so the tag is built rather than written whole.
    const stylesAt = src.indexOf(`<style type="module"' + $nonce + ' specifier=`);
    expect(scriptAt).toBeGreaterThan(-1);
    expect(stylesAt).toBeGreaterThan(scriptAt); // head order: polyfill first, then sheets
  });

  it('lowers @foreach to a real for-loop and marks component hosts with data-fud-adopt', () => {
    expect(src).toContain('for (const item of data.items) {');
    expect(src).toMatch(/\$dom\.setAttr\(\$n\d+, 'data-fud-adopt', "app-card"\);/u);
  });
});

describe('the fixture route — executed end to end, inside its layout', () => {
  let html = '';

  beforeAll(async () => {
    // Emit every module to a temp dir and import the route, exactly like build.ts does,
    // then run page() with a minimal DOM/serializer to get real HTML out.
    const page = await pageModuleOf(graph);
    const data = {
      title: 'Inicio',
      items: [{ id: '1', title: 'Primero', description: 'Desc', featured: true }],
    };
    // `page` streams a trozos: join the pieces into the full document (SDD-19 §4.3).
    html = await drain(page(data, minimalSsr()));
  });

  it('produces a full HTML document with the interpolated title', () => {
    // The document is the layout's: the fixture's writes a bare `<html>` (SDD-88).
    expect(html.startsWith('<!DOCTYPE html><html><head>')).toBe(true);
    expect(html).toContain('<title>Inicio</title>');
  });

  it('emits the blocking style polyfill and the per-component style modules in <head>', () => {
    // Minified since BUG-07 §4.3, so this asserts the polyfill is THERE, not how it reads.
    // What it still does is pinned by `minify.test.ts`, which runs the emitted text.
    expect(html).toContain('<script>(function(){');
    expect(html).toContain('MutationObserver');
    expect(html).toContain('<style type="module" specifier="app-card">');
    expect(html).toContain('<style type="module" specifier="app-badge">');
  });

  it('renders component hosts as DSD with data-fud-adopt, its props and projected light DOM', () => {
    // The props are ON the host since BUG-16: level 1 is HTML with no JS, so a `.prop`
    // that lived only in the props literal would not have reached the document at all.
    // `data-fud-id` comes first and only on the hydratable host: `app-card` has a
    // `@code { @client }`, `app-badge` has nothing of its own and receives no reactive prop.
    expect(html).toContain(
      // Since BUG-32 T1 the props are NOT reflected here: `title` and `variant` reach the
      // child through `render`, and the host carries only what the runtime needs.
      '<app-card data-fud-id="0" data-fud-adopt="app-card">' +
        '<template shadowrootmode="open">',
    );
    expect(html).toContain('<app-badge data-fud-adopt="app-badge">');
    // The `tone` prop is gone from the host and alive in the child's markup, which is the
    // whole of BUG-32 T1: the value crosses once, where it is read.
    expect(html).toContain('<span class="badge success">');
    expect(html).toContain('Destacado'); // badge light DOM projected through <slot>
  });

  it('takes the @if branch driven by the injected data (featured item shows a badge)', () => {
    // items has one featured entry → the grid branch, not the empty branch.
    expect(html).not.toContain('No hay elementos todavía.');
    expect(html).toContain('<section class="grid">');
  });
});

describe('emitComponentModule — head edge cases', () => {
  // A component whose <head> style has no closing </style> (the head trails the component
  // so the raw-text run ends at EOF, not by eating the template): the CSS slice must fall
  // back to the element's span end instead of a missing close span.
  it('slices the CSS to the element end when the <style> has no close tag', () => {
    const io = memoryIo(withLayout({
      '/home.fud': LINK_LAYOUT + '<link rel="component" href="./m.fud">\n',
      '/m.fud':
        '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n<head><style>.x{color:red}',
    }));
    const g = resolveComponents('/home.fud', io);
    const src = emitComponentModule(g, g.components.get('m-el')!);
    expect(src).toContain('export const css = `.x{color:red}`;');
  });
});

describe('emitRouteModule — <title> child shapes', () => {
  const pageWithTitle = (title: string): string => {
    const io = memoryIo(withLayout({ '/home.fud': `${LINK_LAYOUT}<head>${title}</head>\n` }));
    return emitRouteModule(resolveDocument('/home.fud', io).value);
  };

  it('emits a plain-text title as a JSON string literal', () => {
    expect(pageWithTitle('<title>Static</title>')).toContain('head += \'<title>\' + ("Static") + \'</title>\';');
  });

  it('emits an empty title as the empty-string fallback', () => {
    expect(pageWithTitle('<title></title>')).toContain('head += \'<title>\' + (\'\') + \'</title>\';');
  });

  it('emits the empty-string fallback for a non-text, non-expression child (razor comment)', () => {
    expect(pageWithTitle('<title>@* c *@</title>')).toContain('head += \'<title>\' + (\'\') + \'</title>\';');
  });
});
