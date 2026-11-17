// @vitest-environment happy-dom
/**
 * SDD-86 §4.1–§4.4, criteria 2–10 and 26 — the hooks, end to end: the EMITTED chunk, driven
 * through the real `FudicElement` (and the real `hooks()` of `@fudic/core`), over the DOM the
 * server painted or the one `c` creates.
 *
 * Every hook writes into `globalThis.__life`, so the order a test reads is the order things
 * happened in, across the author's code, the element and the runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserDom } from '@fudic/dom';
import { computed, effect, hooks, live, owned, painted as paintedFn, signal, subscribe, written, writtenIf, type FudicElement } from '@fudic/core';
import { emit } from '@fudic/dom';
import { resolveComponents, emitRouteClientModule } from '../../../src/emit/index.js';
import { resolveDocument } from '../../../src/emit/resolve.js';
import { memoryIo } from '../_support.js';
import { clientFactory, mountAsDsd, serverShadowHtml } from './_harness.js';

declare global {
  // eslint-disable-next-line no-var
  var __life: string[];
}

let reported: unknown[];
beforeEach(async () => {
  // The hosts of the test before leave now, and their onDispose runs on a microtask: let it
  // land in the old log, not in this test's.
  document.body.innerHTML = '';
  await Promise.resolve();
  await Promise.resolve();
  globalThis.__life = [];
  reported = [];
  vi.stubGlobal('reportError', (e: unknown) => reported.push(e));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const log = (s: string): string => `globalThis.__life.push(${JSON.stringify(s)})`;

let n = 0;
/** A fresh component file under a fresh tag (customElements is one-shot per name). */
function build(code: string, markup = '<p>x</p>', extra: Record<string, string> = {}, links = ''): { tag: string; graph: ReturnType<typeof resolveComponents> } {
  const tag = `life-el${n++}`;
  const files = {
    '/p.fud': `<link rel="component" href="./c.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    '/c.fud': `${links}@code {\n${code}\n}\n<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`,
    ...extra,
  };
  return { tag, graph: resolveComponents('/p.fud', memoryIo(files)) };
}

/** Define the emitted class under its tag and paint the server's shadow, as the parser leaves it. */
function painted(code: string, markup?: string, props: Record<string, unknown> = {}): { host: FudicElement; tag: string } {
  const { tag, graph } = build(code, markup);
  customElements.define(tag, clientFactory(graph, tag) as unknown as CustomElementConstructor);
  const { host } = mountAsDsd(tag, serverShadowHtml(graph, tag, props));
  return { host: host as FudicElement, tag };
}

/** Define it and create one in the browser, out of the document, as `live()` does. */
function created(code: string, markup?: string, values: readonly unknown[] = []): FudicElement {
  const { tag, graph } = build(code, markup);
  customElements.define(tag, clientFactory(graph, tag) as unknown as CustomElementConstructor);
  const host = document.createElement(tag) as FudicElement;
  host.c(values);
  return host;
}

const ALL = [
  `beforeHydrate((h) => { ${log('beforeHydrate')}; });`,
  `afterHydrate((h) => { ${log('afterHydrate')}; });`,
  `beforeCreate((h) => { ${log('beforeCreate')}; });`,
  `afterCreate((h) => { ${log('afterCreate')}; });`,
  `onConnect((h) => { ${log('onConnect')}; return () => { ${log('onConnect cleanup')}; }; });`,
  `onDisconnect((h) => { ${log('onDisconnect')}; });`,
  `onDispose((h) => { ${log('onDispose')}; });`,
].join('\n');

describe('hydrating (criteria 2, 3)', () => {
  it('top-level code, beforeHydrate, afterHydrate, onConnect — in that order', () => {
    const { host } = painted(`${log('top')};\n${ALL}`);
    expect(globalThis.__life).toEqual([]);
    host.h([]);
    expect(globalThis.__life).toEqual(['top', 'beforeHydrate', 'afterHydrate', 'onConnect']);
  });

  it('a ref is null in beforeHydrate and its element in afterHydrate', () => {
    // Declared as the guide declares a ref: the compiler never initialises an author's variable.
    const { host } = painted(
      `let box = null;\nbeforeHydrate(() => { ${log('before:')} ; globalThis.__life.push(String(box)); });\nafterHydrate(() => { globalThis.__life.push(box?.className ?? 'none'); });`,
      '<div class="box" ref="@box"></div>',
    );
    host.h([]);
    expect(globalThis.__life).toEqual(['before:', 'null', 'box']);
  });

  it('beforeHydrate sees the server’s DOM, nothing adopted yet', () => {
    const { host } = painted(`beforeHydrate((h) => { globalThis.__life.push(h.shadowRoot.innerHTML); });`, '<p>server</p>');
    host.h([]);
    expect(globalThis.__life[0]).toContain('<p>server</p>');
  });
});

describe('creating (criterion 4)', () => {
  it('top-level code, beforeCreate on an empty shadow root, afterCreate, and onConnect only on insertion', () => {
    const host = created(
      `${log('top')};\nbeforeCreate((h) => { globalThis.__life.push('beforeCreate:' + h.shadowRoot.childNodes.length); });\nafterCreate((h) => { globalThis.__life.push('afterCreate:' + h.shadowRoot.querySelectorAll('p').length); });\nonConnect(() => { ${log('onConnect')}; });\nbeforeHydrate(() => { ${log('beforeHydrate')}; });\nafterHydrate(() => { ${log('afterHydrate')}; });`,
    );
    expect(globalThis.__life).toEqual(['top', 'beforeCreate:0', 'afterCreate:1']);
    document.body.append(host);
    expect(globalThis.__life).toEqual(['top', 'beforeCreate:0', 'afterCreate:1', 'onConnect']);
  });
});

describe('leaving (criterion 5)', () => {
  it('onDisconnect at once; on the next microtask onDispose, then the after* cleanups — the ref still set in onDispose', async () => {
    const { host } = painted(
      `let box = null;\nafterHydrate(() => () => { globalThis.__life.push('afterHydrate cleanup:' + (box === null ? 'null' : 'el')); });\nonDisconnect(() => { ${log('onDisconnect')}; });\nonDispose(() => { globalThis.__life.push('onDispose:' + (box?.className ?? 'null')); });`,
      '<div class="box" ref="@box"></div>',
    );
    host.h([]);
    host.remove();
    expect(globalThis.__life).toEqual(['onDisconnect']);
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.__life).toEqual(['onDisconnect', 'onDispose:box', 'afterHydrate cleanup:el']);
  });

  it('a created one: the cleanup of afterCreate at dispose', async () => {
    const host = created(`afterCreate(() => () => { ${log('afterCreate cleanup')}; });\nonDispose(() => { ${log('onDispose')}; });`);
    document.body.append(host);
    host.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.__life).toEqual(['onDispose', 'afterCreate cleanup']);
  });
});

describe('moving (criterion 6)', () => {
  it('the cleanup of onConnect, onDisconnect, onConnect — and no onDispose', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const { host } = painted(ALL);
    a.append(host);
    document.body.append(a, b);
    host.h([]);
    globalThis.__life = [];
    b.append(host);
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.__life).toEqual(['onConnect cleanup', 'onDisconnect', 'onConnect']);
  });
});

describe('several, and one that throws (criteria 7, 8)', () => {
  it('three afterHydrate run in source order', () => {
    const { host } = painted([1, 2, 3].map((i) => `afterHydrate(() => { ${log(`ah${i}`)}; });`).join('\n'));
    host.h([]);
    expect(globalThis.__life).toEqual(['ah1', 'ah2', 'ah3']);
  });

  it('a throwing afterHydrate goes to reportError, the next runs, and the component still answers its events', () => {
    const { host } = painted(
      [
        "import { signal } from '@fudic/core';",
        'const n = signal(0);',
        "afterHydrate(() => { throw new Error('boom'); });",
        `afterHydrate(() => { ${log('next')}; });`,
      ].join('\n'),
      '<button @click=@(() => n.set(n() + 1))>@n()</button>',
    );
    host.h([]);
    expect(reported.map((e) => (e as Error).message)).toEqual(['boom']);
    expect(globalThis.__life).toEqual(['next']);
    const button = host.shadowRoot!.querySelector('button')!;
    button.click();
    expect(button.textContent).toBe('1');
  });
});

describe('the host in fn (criterion 9)', () => {
  it('every hook receives the component’s own element', async () => {
    const same = (k: string): string => `${k}((h) => { globalThis.__life.push('${k}:' + (h === globalThis.__host)); });`;
    const code = ['beforeHydrate', 'afterHydrate', 'onConnect', 'onDisconnect', 'onDispose'].map(same).join('\n');
    const { host } = painted(code);
    (globalThis as { __host?: unknown }).__host = host;
    host.h([]);
    host.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(globalThis.__life).toEqual([
      'beforeHydrate:true',
      'afterHydrate:true',
      'onConnect:true',
      'onDisconnect:true',
      'onDispose:true',
    ]);

    globalThis.__life = [];
    const created2 = created(['beforeCreate', 'afterCreate'].map(same).join('\n').replaceAll('globalThis.__host', 'globalThis.__host2'));
    expect(globalThis.__life).toEqual(['beforeCreate:false', 'afterCreate:false']);
    (globalThis as { __host2?: unknown }).__host2 = created2;
    globalThis.__life = [];
    const again = created(['beforeCreate', 'afterCreate'].map((k) => `${k}((h) => { globalThis.__life.push('${k}:' + (h.localName)); });`).join('\n'));
    expect(globalThis.__life).toEqual([`beforeCreate:${again.localName}`, `afterCreate:${again.localName}`]);
  });
});

describe('a route with its layout (criterion 26)', () => {
  it('route top level, beforeHydrate, the layout’s afterHydrate then the route’s, onConnect — with the <body> as host', () => {
    // A layout's @code holds props, hooks and imports only (FUD0700 for the rest): its «top
    // level» in the route's chunk is its hooks, registered before the route's (decision 21).
    const layout = [
      '<!DOCTYPE html><html><head>',
      '@code {',
      `afterHydrate((h) => { globalThis.__life.push('layout afterHydrate:' + h.localName); });`,
      '}',
      '@RenderHead()</head><body><main>@RenderBody()</main></body></html>',
    ].join('\n');
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code {',
      `${log('route top')};`,
      `beforeHydrate((h) => { globalThis.__life.push('beforeHydrate:' + h.localName); });`,
      `afterHydrate((h) => { globalThis.__life.push('afterHydrate:' + h.localName); });`,
      `onConnect((h) => { globalThis.__life.push('onConnect:' + h.localName); });`,
      '}',
      '<p>x</p>',
    ].join('\n');
    const chunk = emitRouteClientModule(resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': layout })).value)!;
    const body = chunk.replace(/^import[^\n]*\n/gmu, '').replace(/^export default /mu, 'return ');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function('signal', 'computed', 'effect', '$sub', '$written', '$writtenIf', '$live', '$owned', '$hooks', '$painted', 'emit', body)(
      signal, computed, effect, subscribe, written, writtenIf, live, owned, hooks, paintedFn, emit,
    ) as (p: readonly unknown[]) => { h(): void; on?(): void };
    document.body.innerHTML = '<main><p>x</p></main>';
    const ctl = factory([browserDom, document.body, {}]);
    ctl.h();
    ctl.on?.();
    expect(globalThis.__life).toEqual([
      'route top',
      'beforeHydrate:body',
      'layout afterHydrate:body',
      'afterHydrate:body',
      'onConnect:body',
    ]);
  });
});
