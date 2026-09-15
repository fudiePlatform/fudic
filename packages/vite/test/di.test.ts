/**
 * SDD-38 in the plugin: the IoC module of a component, the container the wrapper opens per
 * request, and the half of the bootstrap that rebuilds the tree.
 *
 * Every one of them is written twice over — with DI and without — because the invariant is
 * not that DI works but that a route WITHOUT it does not download a line of it.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { emitMainBootstrap } from '../src/bootstrap.js';
import { iocChunkName, iocId, routeUsesDi } from '../src/client.js';
import { nodeIo } from '../src/io.js';
import { transformFudIoc } from '../src/transform.js';
import { emitRenderChunk } from '../src/wrapper.js';
import { fudic } from '../src/index.js';

/** A project on disk: `resolveDocument` follows real `<link rel="component">` hrefs. */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-di-'));
  for (const [name, source] of Object.entries(files)) {
    const abs = join(root, name);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, source);
  }
  return root;
}

const OWNER = `@code {
  import { provide } from '@fudic/di';
  import { Cart } from './cart.js';

  provide(Cart, () => new Cart());
}
<x-owner>
  <template shadowrootmode="open"><p>owner</p></template>
</x-owner>
`;

const PLAIN = `<x-plain>
  <template shadowrootmode="open"><p>plain</p></template>
</x-plain>
`;

describe('the IoC module of a component', () => {
  it('registers into the container the map attributes to this tag', () => {
    const root = project({ 'x-owner.fud': OWNER });
    const out = transformFudIoc(join(root, 'x-owner.fud'), nodeIo());

    expect(out?.code).toContain(`import { provideIn } from '@fudic/di';`);
    expect(out?.code).toContain(`import { Cart } from './cart.js';`);
    expect(out?.code).toContain('export function register($own) {');
    expect(out?.code).toContain('provideIn($own, Cart, () => new Cart());');
  });

  it('is not emitted for a component that registers nothing, nor for a page', () => {
    const root = project({
      'x-plain.fud': PLAIN,
      'home.fud': '<!DOCTYPE html><html><head></head><body><p>hi</p></body></html>',
    });
    expect(transformFudIoc(join(root, 'x-plain.fud'), nodeIo())).toBeNull();
    expect(transformFudIoc(join(root, 'home.fud'), nodeIo())).toBeNull();
    expect(transformFudIoc(join(root, 'x-plain.ts'), nodeIo())).toBeNull();
  });

  it('is addressed by the tag plus one suffix, in the hydration chunks directory', () => {
    expect(iocId('/app/x-owner.fud')).toBe('/app/x-owner.fud?ioc');
    // The browser derives this URL with the very `resolveChunk` it already holds.
    expect(iocChunkName('x-owner')).toBe('h/x-owner.ioc');
  });
});

describe('routeUsesDi', () => {
  it('answers for the whole graph the route reaches, not for the route file', () => {
    const withDi = project({
      'r.fud': '<link rel="component" href="./x-owner.fud"><x-owner></x-owner>',
      'x-owner.fud': OWNER,
    });
    const without = project({
      'r.fud': '<link rel="component" href="./x-plain.fud"><x-plain></x-plain>',
      'x-plain.fud': PLAIN,
    });

    expect(routeUsesDi(join(withDi, 'r.fud'), nodeIo())).toBe(true);
    expect(routeUsesDi(join(without, 'r.fud'), nodeIo())).toBe(false);
  });
});

describe('the render wrapper', () => {
  const options = { pageModule: '/app/r.fud', hasLoad: true, withLoad: true };

  it('opens ONE container per request, before load, and hands it to the page', () => {
    const code = emitRenderChunk({ ...options, hasDi: true });

    expect(code).toContain('iocRoot, publishedSeed, withDi');
    expect(code).toContain('const $root = iocRoot();');
    // `load` and the components have to inject the same instances, or a root service would
    // be built twice for one response.
    expect(code).toContain('await load(withDi(ctx, $root))');
    expect(code).toContain('yield* page(data, io(ctx), $root, layout);');
  });

  it('names nothing of the injector on a route without a single DI call', () => {
    const code = emitRenderChunk(options);

    expect(code).not.toContain('iocRoot');
    expect(code).not.toContain('withDi');
    expect(code).not.toContain('publishedSeed');
    // The container's place is held by `undefined`, so the layout props keep theirs.
    expect(code).toContain('yield* page(data, io(ctx), undefined, layout);');
  });
});

describe('the main bootstrap', () => {
  const chunks = { mode: 'build', base: '/' } as const;

  it('rebuilds the container tree from the published map, before hydration installs', () => {
    const code = emitMainBootstrap({ chunks, swUrlExpr: null, hasDi: true });

    expect(code).toContain(`import { buildTree } from '@fudic/di/page';`);
    expect(code).toContain(`document.getElementById('fud-ioc')`);
    expect(code).toContain(`document.getElementById('fud-di')`);
    // One module per OWNING tag, by URL: the same arithmetic a hydration chunk uses.
    expect(code).toContain(`resolveChunk(tag + '.ioc')`);
    // STARTED before the runtime installs and handed to it as `ready`, not awaited in front
    // of it. The capturer has to be listening from the first millisecond — a click before it
    // is installed is lost, not deferred — and path 2 is where the tree is waited for, which
    // is the last moment at which a chunk could resolve against one that is not built.
    expect(code.indexOf('const $ioc = (async () => {')).toBeLessThan(
      code.indexOf('installHydration({'),
    );
    expect(code).toContain('ready: $ioc');
    expect(code).not.toMatch(/^await /mu);
  });

  it('does not so much as name the injector when the app has no DI', () => {
    const code = emitMainBootstrap({ chunks, swUrlExpr: null });

    expect(code).not.toContain('@fudic/di');
    expect(code).not.toContain('fud-ioc');
    expect(code).not.toContain('buildTree');
  });
});

/**
 * The dev server publishes an IoC module at the same per-tag URL shape as a hydration chunk,
 * because that is where `resolveChunk(tag + '.ioc')` will look for it. Driven through the
 * middleware with a fake server, so the dev branch is exercised without a running one.
 */
describe('the dev server', () => {
  interface Res {
    headers: Record<string, string>;
    body: string;
    setHeader(k: string, v: string): void;
    end(b?: string): void;
  }
  const res = (): Res => ({
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(b = '') {
      this.body = b;
    },
  });

  function serve(): {
    handler: (req: { url: string }, r: Res, next: () => void) => void;
    asked: string[];
  } {
    const root = project({
      'components/x-owner.fud': OWNER,
      'components/x-plain.fud': PLAIN,
      'routes/index.fud':
        '<!DOCTYPE html><html><head><link rel="component" href="../components/x-owner.fud"><link rel="component" href="../components/x-plain.fud"></head><body><x-owner></x-owner><x-plain></x-plain></body></html>',
    });
    const asked: string[] = [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const plugin = fudic({ routesDir: 'routes' }) as any;
    plugin.config({});
    plugin.configResolved({ root, base: '/', command: 'serve', build: { outDir: 'dist' } });
    let handler!: (req: { url: string }, r: Res, next: () => void) => void;
    plugin.configureServer({
      middlewares: { use: (fn: typeof handler) => (handler = fn) },
      transformRequest: async (id: string) => {
        asked.push(id);
        return { code: '' };
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { handler, asked };
  }

  it('resolves `<tag>.ioc` to the IoC module and a bare tag to the chunk', async () => {
    const { handler, asked } = serve();
    handler({ url: '/@fudic/h/x-owner.ioc.js' }, res(), () => undefined);
    handler({ url: '/@fudic/h/x-owner.js' }, res(), () => undefined);
    await new Promise((r) => setImmediate(r));

    expect(asked.some((id) => id.endsWith('x-owner.fud?ioc'))).toBe(true);
    expect(asked.some((id) => id.endsWith('x-owner.fud?client'))).toBe(true);
  });

  it('transforms a ?ioc id to the module, and to nothing when there is none', async () => {
    const root = project({ 'x-owner.fud': OWNER, 'x-plain.fud': PLAIN });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const plugin = fudic({ routesDir: '.' }) as any;
    plugin.config({});
    plugin.configResolved({ root, base: '/', command: 'serve', build: { outDir: 'dist' } });

    const owner = await plugin.transform('', `${join(root, 'x-owner.fud')}?ioc`);
    expect(String(owner)).toContain('register');
    // A component that registers nothing has no IoC module, and the hook says so rather
    // than emitting an empty one nobody would ever fetch.
    expect(await plugin.transform('', `${join(root, 'x-plain.fud')}?ioc`)).toBeNull();
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  it('leaves a tag nobody rendered to the rest of the middlewares', () => {
    const { handler } = serve();
    let nexted = false;
    handler({ url: '/@fudic/h/x-nobody.ioc.js' }, res(), () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
  });
});
