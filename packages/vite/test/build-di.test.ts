/**
 * SDD-38 §6.20, in a real `vite build`: the IoC module of a component reaches the output as
 * its own file, and a component that registers nothing gets none.
 *
 * It is the criterion that cannot be checked on the emitted text. A provider whose owner is
 * N1 has no chunk to travel in, so the ONLY way its factory reaches the browser is this
 * artifact — and a file the bundler never emitted is one nothing can fetch at run time.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));
const coreDist = fileURLToPath(new URL('../../core/dist/index.js', import.meta.url));
const domDist = fileURLToPath(new URL('../../dom/dist/index.js', import.meta.url));
const diDist = fileURLToPath(new URL('../../di/dist/index.js', import.meta.url));
const diPageDist = fileURLToPath(new URL('../../di/dist/page.js', import.meta.url));

const SERVICES = `import { Service } from '@fudic/di';

export class Cart {
  lines: string[] = [];
}

export class Logger {}
Service(Logger);
`;

/** Declares a provider and injects nothing: level 1, and still the owner of `Cart`. */
const OWNER = `<link rel="component" href="./x-panel.fud">

@code {
  import { provide } from '@fudic/di';
  import { Cart } from '../services.js';

  provide(Cart, () => new Cart());
}

<x-owner>
  <template shadowrootmode="open"><section><x-panel></x-panel></section></template>
</x-owner>
`;

const PANEL = `@code {
  import { inject } from '@fudic/di';
  import { Cart } from '../services.js';

  const cart = inject(Cart);
}

<x-panel>
  <template shadowrootmode="open"><p>@(cart.lines.length)</p></template>
</x-panel>
`;

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/x-owner.fud">
    <title>DI</title>
  </head>
  <body><x-owner></x-owner></body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
}

/** One real `vite build` of a three-file app, in a throwaway root. */
async function buildApp(files: Readonly<Record<string, string>>): Promise<OutFile[]> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-di-build-'));
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);

  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@fudic/ssr': ssrDist,
        '@fudic/transport': transportDist,
        '@fudic/core': coreDist,
        '@fudic/dom': domDist,
        '@fudic/di/page': diPageDist,
        '@fudic/di': diDist,
      },
    },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

const WITH_DI: Readonly<Record<string, string>> = {
  'src/services.ts': SERVICES,
  'src/components/x-owner.fud': OWNER,
  'src/components/x-panel.fud': PANEL,
  'src/routes/index.fud': PAGE,
};

let output: OutFile[];

beforeAll(async () => {
  output = await buildApp(WITH_DI);
}, 120000);

/** Every emitted file, with the content hash taken off so two builds can be compared. */
const unhashed = (files: readonly OutFile[]): string[] =>
  files.map((o) => o.fileName.replace(/-[A-Za-z0-9_-]{8}(\.\w+)$/u, '$1')).sort();

const named = (): string[] =>
  output
    .filter((o) => o.fileName.startsWith('assets/h/'))
    .map((o) => o.fileName.replace(/-[A-Za-z0-9_-]{8}\.js$/u, ''));

describe('the IoC modules in the build output', () => {
  it('emits one for the owner and none for the component that only injects', () => {
    expect(named().sort()).toEqual([
      'assets/h/x-owner',
      'assets/h/x-owner.ioc',
      'assets/h/x-panel',
    ]);
  });

  it('carries the registration, and the owner chunk does not', () => {
    const ioc = output.find((o) => o.fileName.includes('x-owner.ioc'))!;
    expect(ioc.code).toContain('register');
    expect(ioc.code).toContain('Cart');

    // The provider does NOT travel in its owner's chunk: that chunk is never fetched for a
    // component that hydrates never.
    const owner = output.find(
      (o) => o.fileName.includes('assets/h/x-owner-') && !o.fileName.includes('.ioc'),
    )!;
    expect(owner.code).not.toContain('provideIn');
  });

  it('leaves the tree builder in the bootstrap, reachable and not pruned', () => {
    const main = output.find((o) => o.fileName === 'fudic-main.js')!;
    expect(main.code).toContain('fud-ioc');
    // Whatever chunk it ended up in, the bootstrap's import has to resolve to a file that
    // is still in the output — the prune runs after, and a 404 here is a dead page.
    for (const spec of main.code!.matchAll(/from\s*"(\.\/[^"]+\.js)"/gu)) {
      const file = spec[1]!.slice('./'.length);
      expect(output.some((o) => o.fileName === file)).toBe(true);
    }
  });
});

/**
 * SDD-38 §6.28 — the same app with the DI taken out.
 *
 * The claim this closes is the one made in §1: a page without a single injection does not
 * download a byte of this SDD. It is checked against the build above and not against a
 * remembered number, so it stays true as the framework grows: same two components, same
 * hydration shape, and the only difference in the output is the IoC module that has nothing
 * left to register.
 */
const PLAIN_OWNER = `<link rel="component" href="./x-panel.fud">

<x-owner>
  <template shadowrootmode="open"><section><x-panel></x-panel></section></template>
</x-owner>
`;

/** The same panel with the injection taken out, and nothing put in its place. */
const PLAIN_PANEL = `<x-panel>
  <template shadowrootmode="open"><p>0</p></template>
</x-panel>
`;

/**
 * What the injector leaves behind in a bundle, by NAME and not by specifier.
 *
 * `'@fudic/di'` is the wrong thing to search for: the bundler rewrites every specifier into
 * a relative path, so the string is gone from the output whether the code came along or not.
 * These four survive it — the build runs unminified — and each of them is the injector.
 */
const TRACES = ['buildTree', 'injectFrom', 'provideIn', 'createRoot', 'fud-ioc', 'fud-di'];

describe('the same app with no DI at all', () => {
  let plain: OutFile[];

  beforeAll(async () => {
    plain = await buildApp({
      'src/components/x-owner.fud': PLAIN_OWNER,
      'src/components/x-panel.fud': PLAIN_PANEL,
      'src/routes/index.fud': PAGE,
    });
  }, 120000);

  it('carries no line of the injector and neither of its two published blocks', () => {
    const bundled = plain.map((file) => file.code ?? '').join('\n');
    for (const trace of TRACES) expect(bundled).not.toContain(trace);
  });

  it('pays for no file of it either: DI only ever ADDS to an output', () => {
    // Every file this build emits, the DI build emits too — so the difference between the
    // two is entirely what the injector brought, and a page that injects nothing is left
    // with exactly the output it had before this SDD existed.
    const withDi = new Set(unhashed(output));
    for (const file of unhashed(plain)) expect(withDi.has(file)).toBe(true);
    expect(unhashed(plain).some((name) => name.includes('.ioc'))).toBe(false);
    expect(plain.length).toBeLessThan(output.length);
  });
});
