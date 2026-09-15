/**
 * BUG-35 — the runtime tag answers for the ROUTE too, not only for the component tags.
 *
 * `writeRuntimeTags` emits `io.runtime.main` — the hydration runtime — only when the page has
 * something to hydrate, which is BUG-31 §T1 and stays. What SDD-39 added and nobody told this
 * question is that a route now hydrates on its own: the `<body>` carries a `data-fud-id`, the
 * page publishes `fud-route`, and the build emits a chunk. A page whose ONLY reactive thing is
 * its route therefore shipped the claim and not the reader.
 *
 * The assertions are on the emitted module and not on rendered HTML because `io.runtime` is
 * the wrapper's (`@fudic/vite`): the compiler decides WHETHER, and that decision is exactly
 * the presence of the line below.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import { emitLayoutModule, emitPageModule, emitRouteModule } from '../../src/emit/index.js';
import { needsRuntime } from '../../src/emit/maps.js';
import { memoryIo, minimalSsr } from './_support.js';

const LAYOUT = [
  '<!DOCTYPE html><html><head>@RenderHead()</head>',
  '<body><main>@RenderBody()</main></body></html>',
].join('\n');

/** A hydratable component: a `@client` half and a hookup, so it claims an id of its own. */
const COUNTER = [
  '@code { @client { let n = 0; function mas() { n += 1; } } }',
  '<app-counter><template shadowrootmode="open">',
  '<button @click=@mas>+1</button>',
  '</template></app-counter>',
].join('\n');

/** The emitted ROUTE module of `route`, with its layout resolved. */
function routeModule(route: string, routeName?: string, extra: Record<string, string> = {}): string {
  const io = memoryIo({ '/r.fud': route, '/l.fud': LAYOUT, ...extra });
  const graph = resolveDocument('/r.fud', io).value;
  return emitRouteModule(graph, routeName === undefined ? {} : { routeName });
}

/** The emitted module of a STANDALONE page — a route that owns its own shell. */
function pageModule(page: string, routeName?: string, extra: Record<string, string> = {}): string {
  const io = memoryIo({ '/p.fud': page, ...extra });
  const graph = resolveDocument('/p.fud', io).value;
  return emitPageModule(graph, routeName === undefined ? {} : { routeName });
}

/** Whether the module loads the hydration runtime. `boot` rides every page and is not it. */
const loadsRuntime = (module: string): boolean => module.includes('io.runtime.main');

describe('a route with no components still carries the runtime (BUG-35)', () => {
  it('a signal in the route and not one hydratable tag on the page', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { const n = signal(1); } }',
      '<output>@n()</output>',
    ].join('\n');
    const module = routeModule(route, 'ruta-reactiva');
    // The claim and its reader travel together: the `<body>` takes an id here.
    expect(module).toContain('"fud-route"');
    expect(loadsRuntime(module)).toBe(true);
  });

  it('a handler and nothing else — the route that has JavaScript before it has reactivity', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { function sube() { document.title = "x"; } } }',
      '<button @click=@sube>Súmame</button>',
    ].join('\n');
    const module = routeModule(route, 'ruta-evento');
    expect(loadsRuntime(module)).toBe(true);
  });

  it('a standalone page answers it the same way, and it owns its own head', () => {
    const page = [
      '<!DOCTYPE html><html><head><title>t</title>',
      '<script src="fudic:runtime"></script>',
      '@code { @client { const n = signal(1); } }',
      '</head><body><output>@n()</output></body></html>',
    ].join('\n');
    const module = pageModule(page, 'pagina');
    expect(module).toContain('"fud-route"');
    expect(loadsRuntime(module)).toBe(true);
  });
});

describe('and a page with nothing to hydrate still carries none (BUG-31 §T1)', () => {
  it('a route with no client half at all', () => {
    const route = '<link rel="layout" href="./l.fud">\n<p>estática</p>';
    const module = routeModule(route, 'about');
    expect(module).toContain('io.runtime.boot'); // offline-first: this one always rides
    expect(loadsRuntime(module)).toBe(false);
  });

  it('a standalone page with no client half either', () => {
    const page = [
      '<!DOCTYPE html><html><head><title>t</title>',
      '<script src="fudic:runtime"></script>',
      '</head><body><p>hola</p></body></html>',
    ].join('\n');
    const module = pageModule(page, 'about');
    expect(module).toContain('io.runtime.boot'); // the marker WAS there and still answered
    expect(loadsRuntime(module)).toBe(false);
  });

  it('a route that IS reactive but whose name the build does not know', () => {
    // No name, no `fud-route`, no claimed id — so there is nothing for a runtime to read,
    // and the tag follows the claim rather than the `@client` region (§4.7).
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code { @client { const n = signal(1); } }',
      '<output>@n()</output>',
    ].join('\n');
    const module = routeModule(route);
    expect(module).not.toContain('"fud-route"');
    expect(loadsRuntime(module)).toBe(false);
  });
});

describe('what already worked keeps working', () => {
  it('a hydratable component and a route with no client half', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '<link rel="component" href="./c.fud">',
      '<app-counter></app-counter>',
    ].join('\n');
    expect(loadsRuntime(routeModule(route, 'ruta', { '/c.fud': COUNTER }))).toBe(true);
  });
});

/**
 * The marker is written by the OUTERMOST layout and answered by the ROUTE, and until now
 * nothing joined the two across a nested link: the slot object a nested layout builds for its
 * parent carried `head`, `body`, `section` and `blocks`, and the parent's `route.runtime()`
 * therefore called a function nobody had put there. Every route under a nested layout died at
 * prerender with `route.runtime is not a function` — latent only because no route in the
 * example was written under one.
 */
describe('a nested layout passes the runtime question up (BUG-31 §T1)', () => {
  const OUTER = LAYOUT.replace(
    '<head>',
    '<head><script type="module" src="fudic:runtime"></script>',
  );
  const INNER = [
    '<!DOCTYPE html><html><head><link rel="layout" href="./outer.fud">@RenderHead()</head>',
    '<body><section>@RenderBody()</section></body></html>',
  ].join('\n');
  const files = { '/outer.fud': OUTER, '/inner.fud': INNER, '/c.fud': COUNTER };

  /** Emit the whole chain and RUN it: the defect was a call, not a piece of text. */
  function render(route: string): string {
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': route, ...files })).value;
    const evaluate = (code: string, bindings: Record<string, unknown>, returns: string): unknown => {
      const body =
        code.replace(/^import[^\n]*\n/gmu, '').replace(/^export\s+/gmu, '') + `\nreturn ${returns};`;
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return new Function(...Object.keys(bindings), body)(...Object.values(bindings)) as unknown;
    };
    const renderAppCounter = ($dom: Record<string, (...a: unknown[]) => unknown>, $shadow: unknown): void => {
      $dom['append']!($shadow, $dom['text']!('+1'));
    };
    const parentLayout = evaluate(emitLayoutModule(graph, graph.layouts[1]!), {}, 'layout');
    const layout = evaluate(emitLayoutModule(graph, graph.layouts[0]!), { parentLayout }, 'layout');
    const page = evaluate(
      emitRouteModule(graph, { routeName: 'ruta' }),
      { layout, renderAppCounter, renderAppCounterTag: 'app-counter', renderAppCounterCss: '' },
      'page',
    ) as (data: unknown, io: unknown, ioc: unknown, props: unknown) => Iterable<string>;
    return [
      ...page({}, { ...minimalSsr(), nonce: '', runtime: { boot: '/boot.js', main: '/main.js' } }, undefined, undefined),
    ].join('');
  };

  it('forwards it, so the chain renders instead of throwing', () => {
    const route = [
      '<link rel="layout" href="./inner.fud">',
      '<link rel="component" href="./c.fud">',
      '<app-counter></app-counter>',
    ].join('\n');
    const html = render(route);
    expect(html).toContain('/main.js');
    expect(html).toContain('/boot.js');
  });

  it('and the ROUTE is still the one who answers: nothing to hydrate, no runtime', () => {
    const html = render('<link rel="layout" href="./inner.fud">\n<p>hola</p>');
    expect(html).not.toContain('/main.js');
    expect(html).toContain('/boot.js');
  });
});

describe('needsRuntime, at its three doors', () => {
  it('opens on any one of them and on nothing else', () => {
    expect(needsRuntime(new Set(), false, false)).toBe(false);
    expect(needsRuntime(new Set(['app-counter']), false, false)).toBe(true);
    expect(needsRuntime(new Set(), true, false)).toBe(true);
    expect(needsRuntime(new Set(), false, true)).toBe(true);
  });
});
