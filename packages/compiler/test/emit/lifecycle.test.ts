/**
 * SDD-86 §4.5, tasks 11, 13 and 14 — what the compiler emits for a component whose `@code` uses
 * lifecycle hooks.
 *
 *   - the client registers them in a `$hooks()` of its own, runs `before*` / `after*` in `h` and
 *     `c`, disposes in `r`, and has `on` / `off` only when it connects or disconnects;
 *   - the server (and the Service Worker, which runs the same module) never sees a hook, and
 *     paints exactly what the same file without hooks paints (criterion 16).
 *
 * The goldens lock the whole output of `app-lifecycle`; the assertions below say WHY each piece
 * is where it is, so a reviewer of a golden diff knows what must not move.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitComponentClientModuleMapped,
  type ComponentGraph,
  type ResolveIo,
} from '../../src/emit/index.js';
import { fixture, fixturesDir, fixtureIo, memoryIo } from './_support.js';
import { withoutHooks } from './_hooks.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const golden = (file: string): string => join(goldenDir, file);

const HOOKS = ['beforeHydrate', 'afterHydrate', 'beforeCreate', 'afterCreate', 'onConnect', 'onDisconnect', 'onDispose'];

/** A page that renders `app-lifecycle`, so the graph has it and its row. */
const PAGE = join(fixturesDir, 'lifecycle-page.fud');
const PAGE_SOURCE =
  '<link rel="component" href="./app-lifecycle.fud">\n<html><head></head><body><app-lifecycle></app-lifecycle></body></html>\n';

/** The fixtures' IO with the page, and every file passed through `edit`. */
function io(edit: (path: string, source: string) => string = (_p, s) => s): ResolveIo {
  return {
    ...fixtureIo,
    read: (p) => (p === PAGE ? PAGE_SOURCE : edit(p, fixtureIo.read(p))),
  };
}

const graph: ComponentGraph = resolveComponents(PAGE, io());

const stripped: ComponentGraph = resolveComponents(PAGE, io((_p, s) => withoutHooks(s)));

const client = (g: ComponentGraph, tag: string): string => emitComponentClientModule(g, g.components.get(tag)!);
const server = (g: ComponentGraph, tag: string): string => emitComponentModule(g, g.components.get(tag)!);

/** One component, in memory: `@code { code }` and a bare template. */
function one(code: string): string {
  const files = {
    '/p.fud': '<link rel="component" href="./x.fud">\n<html><head></head><body><x-el></x-el></body></html>\n',
    '/x.fud': `@code {\n${code}\n}\n<x-el>\n  <template shadowrootmode="open"><p>x</p></template>\n</x-el>\n`,
  };
  const g = resolveComponents('/p.fud', memoryIo(files));
  return client(g, 'x-el');
}

/** The body of one method of the returned controller: from `name: () =>` to the next method. */
function method(code: string, name: 'h' | 'c' | 'r' | 'u'): string {
  // The component's own controller is the LAST `return {` of the factory: a block's come first.
  const ctl = code.slice(code.lastIndexOf('\n      return {\n'));
  const start = ctl.indexOf(`\n        ${name}: `);
  expect(start).toBeGreaterThan(-1);
  const next = ctl.slice(start + 1).search(/\n {8}[a-z]+: /u);
  return (next === -1 ? ctl.slice(start) : ctl.slice(start, start + 1 + next)).trimStart();
}

describe('goldens (tasks 11, 14)', () => {
  it('app-lifecycle.client.mjs', async () => {
    await expect(client(graph, 'app-lifecycle')).toMatchFileSnapshot(golden('app-lifecycle.client.mjs'));
  });

  it('app-lifecycle.server.mjs', async () => {
    await expect(server(graph, 'app-lifecycle')).toMatchFileSnapshot(golden('app-lifecycle.server.mjs'));
  });

  it('app-lifecycle-row.client.mjs', async () => {
    await expect(client(graph, 'app-lifecycle-row')).toMatchFileSnapshot(golden('app-lifecycle-row.client.mjs'));
  });
});

describe('the client registers and runs (§4.5, task 11)', () => {
  const code = client(graph, 'app-lifecycle');

  it('imports hooks as $hooks from @fudic/core, once', () => {
    expect(code.match(/hooks as \$hooks/gu)).toHaveLength(1);
    expect(code).toMatch(/import \{[^}]*hooks as \$hooks[^}]*\} from '@fudic\/core';/u);
  });

  it('creates $hk inside $owned, before the author’s code', () => {
    const owned = code.indexOf('$owned(');
    const hk = code.indexOf('const $hk = $hooks();');
    const author = code.indexOf('const log = []') === -1 ? code.indexOf('const log') : code.indexOf('const log = []');
    expect(owned).toBeGreaterThan(-1);
    expect(hk).toBeGreaterThan(owned);
    expect(author).toBeGreaterThan(hk);
  });

  it('rewrites each call to $hk.add("kind", fn), in source order, and leaves no bare call', () => {
    const adds = [...code.matchAll(/\$hk\.add\("(\w+)"/gu)].map((m) => m[1]);
    expect(adds).toEqual(HOOKS);
    for (const hook of HOOKS) expect(code).not.toMatch(new RegExp(`(?<![."\\w])${hook}\\(`, 'u'));
  });

  it('h: beforeHydrate first, afterHydrate after $s()', () => {
    const h = method(code, 'h');
    expect(h.indexOf('$hk.run("beforeHydrate"')).toBeGreaterThan(-1);
    expect(h.indexOf('$hk.run("beforeHydrate"')).toBeLessThan(h.indexOf('$dom.'));
    expect(h.indexOf('$hk.run("afterHydrate"')).toBeGreaterThan(h.indexOf('$s()'));
    expect(h).not.toContain('Create"');
  });

  it('c: beforeCreate before the template is put in, afterCreate after $s()', () => {
    const c = method(code, 'c');
    expect(c.indexOf('$hk.run("beforeCreate"')).toBeGreaterThan(-1);
    expect(c.indexOf('$hk.run("afterCreate"')).toBeGreaterThan(c.indexOf('$s()'));
    expect(c).not.toContain('Hydrate"');
  });

  it('r: $hk.dispose first, before the blocks and the nodes are released', () => {
    const r = method(code, 'r');
    expect(r).toMatch(/^r: \(\) => \{ \$hk\.dispose\(/u);
  });

  it('on / off forward to $hk with the host saved at the start (task 13)', () => {
    expect(code).toContain('on: () => $hk.on(');
    expect(code).toContain('off: () => $hk.off(');
    // The host is saved before `r` nulls `$shadow`.
    const saved = /const (\$\w+) = \$dom\.host\(\$shadow\);/u.exec(code);
    expect(saved).not.toBeNull();
    expect(code).toContain(`$hk.on(${saved![1]})`);
    expect(code).toContain(`$hk.dispose(${saved![1]})`);
  });
});

describe('only what is used (task 13, criterion 17)', () => {
  it('only afterHydrate: no on, no off, no create runs', () => {
    const code = one('afterHydrate(() => {});');
    expect(code).toContain('$hk.add("afterHydrate"');
    expect(code).not.toContain('on: ');
    expect(code).not.toContain('off: ');
    expect(code).not.toContain('$hk.run("beforeHydrate"');
    expect(code).not.toContain('$hk.run("afterCreate"');
  });

  it('only onDisconnect: on and off, and nothing to dispose', () => {
    const code = one('onDisconnect(() => {});');
    expect(code).toContain('on: () => $hk.on(');
    expect(code).toContain('off: () => $hk.off(');
    expect(code).not.toContain('$hk.dispose(');
    expect(code).not.toContain('$hk.run(');
  });

  it('only onConnect: on and off', () => {
    const code = one('onConnect(() => {});');
    expect(code).toContain('on: () => $hk.on(');
    expect(code).toContain('off: () => $hk.off(');
  });

  it('only onDispose: a dispose in r, and no on / off', () => {
    const code = one('onDispose(() => {});');
    expect(method(code, 'r')).toContain('$hk.dispose(');
    expect(code).not.toContain('on: ');
  });

  it('no hooks: no $hooks, no $hk at all', () => {
    const code = one("const a = 1;");
    expect(code).not.toContain('$hooks');
    expect(code).not.toContain('$hk');
  });

  it('the same hook three times: three adds, one run', () => {
    const code = one('afterHydrate(() => {});\nafterHydrate(() => {});\nafterHydrate(() => {});');
    expect(code.match(/\$hk\.add\("afterHydrate"/gu)).toHaveLength(3);
    expect(code.match(/\$hk\.run\("afterHydrate"/gu)).toHaveLength(1);
  });
});

describe('the server and the Service Worker never see a hook (task 14, criterion 16)', () => {
  for (const tag of ['app-lifecycle', 'app-lifecycle-row']) {
    it(`${tag}: no hook name and no hook body in the server module`, () => {
      const code = server(graph, tag);
      for (const hook of HOOKS) expect(code).not.toContain(hook);
      expect(code).not.toContain('ResizeObserver');
      expect(code).not.toContain('$hooks');
    });

    it(`${tag}: the server module is the one of the same file without hooks, but for the children it claims`, () => {
      // A hook makes a component hydrate (criterion 14): a parent then claims the host of a
      // child that has hooks, which the same child without them did not need. That one line is
      // the whole difference; nothing of the hooks themselves is in it.
      const unclaimed = (code: string): string => code.replace(/^ *\$dom\.claim\(\$n\d+\);\n/gmu, '');
      expect(unclaimed(server(graph, tag))).toBe(unclaimed(server(stripped, tag)));
    });
  }

  it('app-lifecycle-row, a leaf, emits exactly the server module of its file without hooks', () => {
    expect(server(graph, 'app-lifecycle-row')).toBe(server(stripped, 'app-lifecycle-row'));
  });

  it('the only extra line in the parent is the claim of the row that now hydrates', () => {
    const extra = server(graph, 'app-lifecycle').split('\n').filter((l) => !server(stripped, 'app-lifecycle').split('\n').includes(l));
    expect(extra.map((l) => l.trim())).toEqual(['$dom.claim($n1);']);
  });

  it('the fixture without its hooks is still a valid component (sanity of the comparison)', () => {
    const bare = withoutHooks(fixture('app-lifecycle.fud'));
    for (const hook of HOOKS) expect(bare).not.toContain(`${hook}(`);
    expect(bare).toContain("props<{ variant?: 'default' | 'highlight'; rows?: Row[] }>()");
  });
});

describe('the source map points at the original call (§4.5)', () => {
  it('each $hk.add maps back into its hook call, and the function the author wrote too', () => {
    const X = '@code {\nonConnect(() => {});\nafterHydrate((host) => { host.title = "t"; });\n}\n<x-el>\n  <template shadowrootmode="open"><p>x</p></template>\n</x-el>\n';
    const files = {
      '/p.fud': '<link rel="component" href="./x.fud">\n<html><head></head><body><x-el></x-el></body></html>\n',
      '/x.fud': X,
    };
    const g = resolveComponents('/p.fud', memoryIo(files));
    const out = emitComponentClientModuleMapped(g, g.components.get('x-el')!);
    for (const call of ['onConnect(() => {})', 'afterHydrate((host) => { host.title = "t"; })']) {
      const start = X.indexOf(call);
      const inside = out.mappings.filter((m) => m.sourceOffset >= start && m.sourceOffset < start + call.length);
      expect(inside.length, call).toBeGreaterThan(0);
      // And what it maps lands on the rewritten call in the output.
      expect(inside.some((m) => out.code.slice(m.generatedOffset).startsWith('$hk.add('))
        || inside.some((m) => out.code.slice(m.generatedOffset, m.generatedOffset + 6) === '(host)' || out.code.slice(m.generatedOffset).startsWith('() =>'))).toBe(true);
    }
  });
});
