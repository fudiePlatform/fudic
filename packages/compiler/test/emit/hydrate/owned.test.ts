// @vitest-environment happy-dom
/**
 * SDD-68 §6, criteria 12–14 — what the `@code` creates dies with its component, and a task
 * on the server never calls.
 *
 * The emit wraps the `@code` in `$owned` and pours the list into `$d`; that much is text, and
 * the goldens lock it. Whether it WORKS is a question about running it: that the effect the
 * author wrote really is in the list `r` drains, and that a `task` created next to it is too.
 * So the chunks are evaluated here with every import answered by the real package behind it
 * — `@fudic/core`, `@fudic/i18n` — or by a module of the test's own (`./api.js`).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '@fudic/core';
import type { Callable, Controller, FudicElementCtor, Task } from '@fudic/core';
import * as i18n from '@fudic/i18n';
import { browserDom, type DomClient } from '@fudic/dom';
import { resolveDocument } from '../../../src/emit/resolve.js';
import {
  emitComponentClientModule,
  emitLayoutModule,
  emitRouteClientModule,
  emitRouteModule,
  resolveComponents,
} from '../../../src/emit/index.js';
import { drain, fixturesDir, memoryIo, ssrIo, type PageFn } from '../_support.js';

type Modules = Readonly<Record<string, Record<string, unknown>>>;

const IMPORT = /^import \{([^}]*)\} from (['"])([^'"]+)\2;$/gmu;

/** A module's named imports as bindings of `$m[specifier]`; an unknown specifier is a test bug. */
function bindImports(source: string, modules: Modules): string {
  return source.replace(IMPORT, (_all, names: string, _q: string, spec: string) => {
    if (!(spec in modules)) throw new Error(`no module for ${spec}`);
    return `const {${names.replace(/\bas\b/gu, ':')}} = $m[${JSON.stringify(spec)}];`;
  });
}

/** The class a component chunk hands to `customElements.define`. */
function componentFactory(source: string, modules: Modules): FudicElementCtor {
  let captured: FudicElementCtor | undefined;
  const registry = {
    define: (_name: string, ctor: FudicElementCtor): void => {
      captured = ctor;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('$m', 'customElements', bindImports(source, modules))(modules, registry);
  return captured!;
}

interface PendingCall<A> {
  readonly args: A;
  readonly signal: AbortSignal;
  resolve(value: string[]): void;
}

/** A fake server function: records each call and its signal, and settles only when told. */
function pendingFn<A>(): { fn: Callable<A, string[]>; calls: PendingCall<A>[] } {
  const calls: PendingCall<A>[] = [];
  const fn: Callable<A, string[]> = (args, { signal }) =>
    new Promise<string[]>((resolve) => {
      calls.push({ args, signal, resolve });
    });
  return { fn, calls };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function mountComponent(tag: string, source: string, modules: Modules): Controller {
  const io = memoryIo({
    '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    [`/${tag}.fud`]: source,
  });
  const graph = resolveComponents('/page.fud', io);
  const chunk = emitComponentClientModule(graph, graph.components.get(tag)!);
  const factory = componentFactory(chunk, modules);
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const controller = factory.c([browserDom, shadow]);
  controller.c?.();
  return controller;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('criterion 12 — a component takes its task and its effect with it', () => {
  const SOURCE =
    '@code {\n' +
    '  import { task, effect } from "@fudic/core";\n' +
    '  import { search, probe } from "./api.js";\n' +
    '  const found = task(search);\n' +
    '  void found.run("an");\n' +
    '  probe.found = found;\n' +
    '  effect(() => {\n' +
    '    const id = setInterval(() => probe.tick(), 1000);\n' +
    '    return () => clearInterval(id);\n' +
    '  });\n' +
    '}\n' +
    '<x-owns>\n  <template shadowrootmode="open"><b>@found.state()</b></template>\n</x-owns>\n';

  it('r() aborts the call in flight, stops the interval, and leaves run inert', async () => {
    vi.useFakeTimers();
    const { fn, calls } = pendingFn<string>();
    const probe: { found?: Task<string, string[]>; tick: () => void } = { tick: vi.fn() };
    const controller = mountComponent('x-owns', SOURCE, { '@fudic/core': core, './api.js': { search: fn, probe } });

    expect(calls.map((c) => c.args)).toEqual(['an']);
    expect(probe.found!.state()).toBe('pending');
    vi.advanceTimersByTime(3000);
    expect(probe.tick).toHaveBeenCalledTimes(3);

    controller.r();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(probe.tick).toHaveBeenCalledTimes(3);

    expect(await probe.found!.run('ana')).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('a teardown that writes what the view reads runs after the view stopped listening', () => {
    // The view's subscriptions go first, what the `@code` created goes last: otherwise this
    // write would repaint a node `r` has already released, and `setText(null, �)` throws.
    const controller = mountComponent(
      'x-late',
      '@code {\n' +
        '  import { signal, effect } from "@fudic/core";\n' +
        '  const n = signal(0);\n' +
        '  effect(() => () => n.set(1));\n' +
        '}\n' +
        '<x-late>\n  <template shadowrootmode="open"><b>@n()</b></template>\n</x-late>\n',
      { '@fudic/core': core },
    );
    const b = document.querySelector('x-late')!.shadowRoot!.querySelector('b')!;
    expect(b.textContent).toBe('0');
    expect(() => controller.r()).not.toThrow();
    expect(b.textContent).toBe('0');
  });
});

describe('criterion 13 — app-clock removed stops updating its signal', () => {
  // The example's own file, not a copy: the clock this criterion names is that one.
  const CLOCK = readFileSync(resolve(fixturesDir, '../../..', 'examples/basic/src/components/app-clock.fud'), 'utf8');

  it('ticks while mounted and has no timer left once removed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    const controller = mountComponent('app-clock', CLOCK, { '@fudic/core': core, '@fudic/i18n': i18n });
    const shadow = document.querySelector('app-clock')!.shadowRoot!;
    const time = (): string => shadow.querySelector('time.hora')!.textContent;

    // Mounted, the interval drives the signal and the signal drives the view.
    const before = time();
    vi.advanceTimersByTime(1000);
    expect(time()).not.toBe(before);
    expect(vi.getTimerCount()).toBe(1);

    // Removed, nothing is left to write it: the interval went with the component.
    controller.r();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('criterion 14 — a task on the server never calls, and the page hydrates as painted', () => {
  const LAYOUT =
    '<!DOCTYPE html><html><head>@RenderHead()</head><body><main>@RenderBody()</main></body></html>';
  const ROUTE = [
    '<link rel="layout" href="./l.fud">',
    '@code {',
    '  import { task } from "@fudic/core";',
    '  import { search } from "./api.js";',
    "  const found = task(search, undefined, { initial: ['ana', 'eva'] });",
    "  function buscar() { void found.run('x'); }",
    '}',
    '<button @click=@buscar>buscar</button>',
    '@if (found.pending()) { <span class="busy">Buscando</span> }',
    '<ul>@foreach (const p of found.value()) key (p) { <li>@p</li> }</ul>',
  ].join('\n');

  /** `browserDom` that throws on any construction while `h` adopts, and builds afterwards. */
  function guardedDom(): { dom: DomClient<Node>; open: () => void } {
    let adopting = true;
    const forbid =
      (op: 'element' | 'text' | 'append') =>
      (...args: unknown[]): unknown => {
        if (adopting) throw new Error(`hydrate must not call ${op}: it adopts, it does not build`);
        return (browserDom[op] as (...a: unknown[]) => unknown)(...args);
      };
    return {
      dom: {
        ...browserDom,
        element: forbid('element') as DomClient<Node>['element'],
        text: forbid('text') as DomClient<Node>['text'],
        append: forbid('append') as DomClient<Node>['append'],
      },
      open: () => {
        adopting = false;
      },
    };
  }

  it('paints initial without calling fn, hydrates without building, and is live afterwards', async () => {
    const { fn, calls } = pendingFn<string>();
    const modules: Modules = { '@fudic/core': core, './api.js': { search: fn } };
    const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': ROUTE, '/l.fud': LAYOUT })).value;

    // The server: layout and route evaluated, the route's own imports answered for real.
    const layoutSource = emitLayoutModule(graph, graph.layouts[0]!).replace(/^export\s+/gmu, '');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const layout = new Function(`${layoutSource}\nreturn layout;`)() as unknown;
    const routeSource = bindImports(
      emitRouteModule(graph).replace(/^import \{ layout \} from '\.\/l\.mjs';$/mu, ''),
      modules,
    ).replace(/^export\s+/gmu, '');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const page = new Function('$m', 'layout', `${routeSource}\nreturn page;`)(modules, layout) as PageFn;
    const html = await drain(page({}, ssrIo().io));
    expect(calls).toHaveLength(0);
    const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>'));
    expect(body).toContain('<li>ana</li>');
    expect(body).toContain('<li>eva</li>');
    expect(body).not.toContain('Buscando');

    // The browser: the same markup, adopted with construction forbidden.
    document.body.innerHTML = body;
    const painted = document.body.innerHTML;
    const chunk = bindImports(emitRouteClientModule(graph)!, modules).replace(/^export default /mu, 'return ');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function('$m', chunk)(modules) as (props: readonly unknown[]) => Controller;
    const guard = guardedDom();
    const controller = factory([guard.dom, document.body, {}]);
    controller.h!();
    guard.open();
    expect(calls).toHaveLength(0);
    expect(document.body.innerHTML).toBe(painted);

    // Hydrated, the task is the browser's: a click calls, and the view follows its state.
    (document.querySelector('button') as HTMLElement).click();
    expect(calls.map((c) => c.args)).toEqual(['x']);
    expect(document.querySelector('span.busy')).not.toBeNull();
    const rows = [...document.querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toEqual(['ana', 'eva']); // the old value, kept while the call is in flight

    calls[0]!.resolve(['eva', 'zoe']);
    await flush();
    expect(document.querySelector('span.busy')).toBeNull();
    expect([...document.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['eva', 'zoe']);

    (document.querySelector('button') as HTMLElement).click();
    controller.r();
    expect(calls[1]!.signal.aborted).toBe(true);
  });
});
