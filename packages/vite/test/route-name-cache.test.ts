/**
 * BUG-34 §6 — the route→name table is built once per build, not once per module.
 *
 * `routeNameLookup` is a FACTORY: it resolves the document graph of every route to build
 * its map and hands back the reader. The link pass and the edge pass hoist that call out
 * of their loops; the host plugin used to invoke it inside the `transform` hook, so every
 * `.fud` the build touched re-parsed every route of the project.
 *
 * Nothing about the OUTPUT changes either way, which is why this file counts calls: the
 * defect is invisible to an assertion about emitted code and visible only as work.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * How many times the factory ran. Hoisted, because `vi.mock` is lifted above the imports
 * and the counter has to exist before the mocked module is evaluated.
 */
const factory = vi.hoisted(() => ({ calls: 0 }));

// Only `routeNameLookup` is wrapped; every other export of the module stays the real one,
// so the plugin's component discovery, its DI probe and its id helpers are untouched.
vi.mock('../src/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client.js')>();
  return {
    ...actual,
    routeNameLookup: (...args: Parameters<typeof actual.routeNameLookup>) => {
      factory.calls += 1;
      return actual.routeNameLookup(...args);
    },
  };
});

const { fudic } = await import('../src/index.js');

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyHook = any;

const fixtures = fileURLToPath(new URL('../../compiler/fixtures', import.meta.url));
const compilerRoot = fileURLToPath(new URL('../../compiler', import.meta.url));

function setup(projectRoot: string, routesDir: string): AnyHook {
  const plugin = fudic({ routesDir }) as AnyHook;
  plugin.config({});
  plugin.configResolved({
    root: projectRoot,
    base: '/',
    command: 'build',
    build: { outDir: 'dist' },
  });
  return plugin;
}

const ctx = (): Record<string, unknown> => ({
  emitFile: vi.fn((o: { id?: string }) => `ref:${o.id ?? 'x'}`),
  warn: vi.fn(),
  error: vi.fn(),
});

/** A route with a client half, so it is reactive and therefore has a name to publish. */
const reactiveRoute = (title: string): string => `<!DOCTYPE html>
<html>
<head>
@code {
  @client {
    import { signal } from '@fudic/core';

    const abierto = signal(false);
    const alterna = () => abierto.set(!abierto());
  }
}
<title>${title}</title>
</head>
<body>
  <button @click=@alterna()>@abierto()</button>
</body>
</html>
`;

describe('the route→name table is resolved once per build (criterion 1)', () => {
  it('four `.fud` modules share one lookup', async () => {
    const p = setup(compilerRoot, 'fixtures');
    p.buildStart.call(ctx());
    // `buildStart` discovers on its own account; what this test measures is the transforms.
    factory.calls = 0;

    for (const file of ['home.fud', 'app-card.fud', 'app-badge.fud', 'app-button.fud']) {
      await p.transform.call(ctx(), '', join(fixtures, file));
    }

    // Against the broken code this is 4: one full re-resolution of every route per module,
    // and it grows with the size of the project rather than staying flat.
    expect(factory.calls).toBe(1);
  });

  it('and a module transformed twice does not rebuild it either', async () => {
    const p = setup(compilerRoot, 'fixtures');
    p.buildStart.call(ctx());
    factory.calls = 0;

    await p.transform.call(ctx(), '', join(fixtures, 'home.fud'));
    await p.transform.call(ctx(), '', join(fixtures, 'home.fud'));

    expect(factory.calls).toBe(1);
  });
});

describe('a new set of routes rebuilds it (criterion 2)', () => {
  it('a route added between discoveries publishes its name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-namecache-'));
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    const routes = join(root, 'src', 'routes');
    writeFileSync(join(routes, 'uno.fud'), reactiveRoute('Uno'));

    const p = setup(root, 'src/routes');
    p.buildStart.call(ctx());
    factory.calls = 0;

    const uno = await p.transform.call(ctx(), '', join(routes, 'uno.fud'));
    expect(uno.code).toContain('"uno"');
    expect(factory.calls).toBe(1);

    // A second route appears and the plugin rediscovers — which is what the dev server does
    // on every request, and the only reason the cached reader may be thrown away.
    writeFileSync(join(routes, 'dos.fud'), reactiveRoute('Dos'));
    p.buildStart.call(ctx());

    const dos = await p.transform.call(ctx(), '', join(routes, 'dos.fud'));
    // Stale by identity would leave this route nameless: it was not in the table the first
    // discovery built, and a page with no name claims no chunk and never hydrates.
    expect(dos.code).toContain('"dos"');

    // And the new table is kept in its turn: the rediscovery cost ONE rebuild, not one per
    // module transformed after it.
    await p.transform.call(ctx(), '', join(routes, 'uno.fud'));
    expect(factory.calls).toBe(2);
  });

  it('a route with no client half still gets no name, cached or not', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-namecache-static-'));
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    const routes = join(root, 'src', 'routes');
    writeFileSync(
      join(routes, 'estatica.fud'),
      '<!DOCTYPE html><html><head><title>Estática</title></head><body><h1>sin js</h1></body></html>\n',
    );

    const p = setup(root, 'src/routes');
    p.buildStart.call(ctx());

    const out = await p.transform.call(ctx(), '', join(routes, 'estatica.fud'));
    expect(out.code).not.toContain('fud-route');
  });
});
