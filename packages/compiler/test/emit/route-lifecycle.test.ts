/**
 * SDD-86 §4.5, tasks 12, 13 and 14 — the hooks of a route, a page and a layout.
 *
 * The route's client chunk registers them in one `$hk`, the layout's first and then the route's,
 * with `$root` (the `<body>`) as the host; there is no `c`. `on` / `off` come out when the route
 * connects, disconnects or disposes: that is how the runtime knows to follow `pagehide` /
 * `pageshow` (decision 14). The server module of the route and of its layout never see a hook.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  emitLayoutModule,
  emitRouteClientModule,
  emitRouteModule,
  isReactiveRoute,
  type ResolveIo,
} from '../../src/emit/index.js';
import { resolveDocument } from '../../src/emit/resolve.js';
import { fixtureIo, layoutFixturesDir, memoryIo } from './_support.js';
import { withoutHooks } from './_hooks.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const golden = (file: string): string => join(goldenDir, file);

const HOOKS = ['beforeHydrate', 'afterHydrate', 'beforeCreate', 'afterCreate', 'onConnect', 'onDisconnect', 'onDispose'];

const ROUTE = join(layoutFixturesDir, 'ruta-ciclo.fud');
const graphOf = (io: ResolveIo) => resolveDocument(ROUTE, io).value;
const graph = graphOf(fixtureIo);
const stripped = graphOf({ ...fixtureIo, read: (p) => withoutHooks(fixtureIo.read(p)) });

const chunk = emitRouteClientModule(graph)!;

/** A route in memory, with a layout that has `layoutCode` in its `@code` (or no `@code`). */
function routeChunk(code: string, layoutCode: string | null = null): string | null {
  const layout = [
    '<!DOCTYPE html><html><head>',
    // A layout's `@code` lives in its <head> (decision 21): in the <body> it is FUD0153.
    layoutCode === null ? '' : `@code {\n${layoutCode}\n}`,
    '@RenderHead()</head><body>',
    '<main>@RenderBody()</main>',
    '</body></html>',
  ].join('\n');
  const route = `<link rel="layout" href="./l.fud">\n@code {\n${code}\n}\n<p>x</p>\n`;
  return emitRouteClientModule(resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': layout })).value);
}

/** The body of one method of the route's controller. */
function method(code: string, name: 'h' | 'r' | 'u'): string {
  const ctl = code.slice(code.lastIndexOf('return {'));
  const start = ctl.search(new RegExp(`\\n {6}${name}: `, 'u'));
  expect(start).toBeGreaterThan(-1);
  const next = ctl.slice(start + 1).search(/\n {6}[a-z]+: /u);
  return (next === -1 ? ctl.slice(start) : ctl.slice(start, start + 1 + next)).trimStart();
}

describe('goldens (tasks 12, 14)', () => {
  it('ruta-ciclo.client.mjs', async () => {
    await expect(chunk).toMatchFileSnapshot(golden('ruta-ciclo.client.mjs'));
  });

  it('ruta-ciclo.server.mjs', async () => {
    await expect(emitRouteModule(graph)).toMatchFileSnapshot(golden('ruta-ciclo.server.mjs'));
  });

  it('_ciclo-layout.server.mjs', async () => {
    await expect(emitLayoutModule(graph, graph.layouts[0]!)).toMatchFileSnapshot(golden('_ciclo-layout.server.mjs'));
  });
});

describe('the route registers and runs (§4.5, task 12)', () => {
  it('one $hk, the layout’s hooks first and then the route’s', () => {
    expect(chunk.match(/const \$hk = \$hooks\(\);/gu)).toHaveLength(1);
    const adds = [...chunk.matchAll(/\$hk\.add\("(\w+)"/gu)].map((m) => m[1]);
    expect(adds).toEqual(['afterHydrate', 'onDisconnect', 'beforeHydrate', 'afterHydrate', 'onConnect', 'onDisconnect', 'onDispose']);
  });

  it('the host is $root, the <body>', () => {
    expect(chunk).toMatch(/\$hk\.run\("beforeHydrate", \$root\)|\$hk\.run\("beforeHydrate", (\$\w+)\)/u);
    const host = /\$hk\.on\((\$\w+)\)/u.exec(chunk)![1];
    expect(host === '$root' || chunk.includes(`const ${host} = $root;`)).toBe(true);
  });

  it('h: beforeHydrate first, afterHydrate after $s()', () => {
    const h = method(chunk, 'h');
    expect(h.indexOf('$hk.run("beforeHydrate"')).toBeGreaterThan(-1);
    expect(h.indexOf('$hk.run("beforeHydrate"')).toBeLessThan(h.indexOf('$dom.'));
    expect(h.indexOf('$hk.run("afterHydrate"')).toBeGreaterThan(h.indexOf('$s()'));
  });

  it('there is no c, and no create hook runs', () => {
    expect(chunk).not.toMatch(/\n {6}c: /u);
    expect(chunk).not.toContain('Create"');
  });

  it('r: $hk.dispose first', () => {
    expect(method(chunk, 'r')).toMatch(/^r: \(\) => \{ \$hk\.dispose\(/u);
  });

  it('on / off forward to $hk', () => {
    expect(chunk).toMatch(/on: \(\) => \$hk\.on\(\$\w+\)/u);
    expect(chunk).toMatch(/off: \(\) => \$hk\.off\(\$\w+\)/u);
  });

  it('no hook is called bare in the chunk', () => {
    for (const hook of HOOKS) expect(chunk).not.toMatch(new RegExp(`(?<![."\\w])${hook}\\(`, 'u'));
  });
});

describe('on / off only when needed (task 13, decision 14)', () => {
  it('only afterHydrate: no on / off — the page follows nothing', () => {
    const code = routeChunk('afterHydrate(() => {});')!;
    expect(code).toContain('$hk.add("afterHydrate"');
    expect(code).not.toMatch(/\bon: /u);
    expect(code).not.toMatch(/\boff: /u);
  });

  it.each([['onConnect'], ['onDisconnect'], ['onDispose']])('only %s: on and off', (hook) => {
    const code = routeChunk(`${hook}(() => {});`)!;
    expect(code).toMatch(/\bon: \(\) => \$hk\.on\(/u);
    expect(code).toMatch(/\boff: \(\) => \$hk\.off\(/u);
  });

  it('a layout’s onDisconnect alone gives the route on / off', () => {
    const code = routeChunk('const a = 1;', 'onDisconnect(() => {});')!;
    expect(code).toMatch(/\boff: \(\) => \$hk\.off\(/u);
  });

  it('a route without hooks has no $hk', () => {
    const code = routeChunk("import { signal } from '@fudic/core';\nconst n = signal(0);");
    expect(code ?? '').not.toContain('$hk');
  });
});

describe('a hook gives the route its chunk (criterion 30)', () => {
  it('a route whose @code is only afterHydrate(() => {}) has a chunk', () => {
    expect(routeChunk('afterHydrate(() => {});')).not.toBeNull();
  });

  it('so does one whose only hook is in its layout (decision 16)', () => {
    const layout = '<!DOCTYPE html><html><head>\n@code {\nafterHydrate(() => {});\n}\n@RenderHead()</head><body><main>@RenderBody()</main></body></html>';
    const g = resolveDocument('/r.fud', memoryIo({ '/r.fud': '<link rel="layout" href="./l.fud">\n<p>x</p>\n', '/l.fud': layout })).value;
    expect(isReactiveRoute(g)).toBe(true);
    expect(emitRouteClientModule(g)).toContain('$hk.add("afterHydrate"');
  });
});

describe('the server never sees a hook (task 14, criterion 16)', () => {
  it('the route module and the layout module carry no hook and no hook body', () => {
    for (const code of [emitRouteModule(graph), emitLayoutModule(graph, graph.layouts[0]!)]) {
      for (const hook of HOOKS) expect(code).not.toContain(hook);
      expect(code).not.toContain('localStorage');
      expect(code).not.toContain('sessionStorage');
      expect(code).not.toContain('$hooks');
    }
  });

  it('they are the modules of the same files without hooks', () => {
    expect(emitRouteModule(graph)).toBe(emitRouteModule(stripped));
    expect(emitLayoutModule(graph, graph.layouts[0]!)).toBe(emitLayoutModule(stripped, stripped.layouts[0]!));
  });
});
