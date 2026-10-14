/**
 * BUG-47 criterion 14 — in `vite dev`, a built `dist/*.js` with its own map does not hand the
 * browser its server half through the map.
 *
 * The transform already erased the code; the map is what `load` hands over from disk, with the
 * `.ts` text put in, and the dev server serves it as it is. A package named `@fudic/http`
 * (whose own middlewares carry no `@fudic/http` import) with `dist/csrf.js` + its map back to
 * `src/csrf.ts`: the client gets both erased, SSR gets both halves.
 *
 * In two places, because Vite does not ask for them the same way: installed under
 * `node_modules`, as from npm, its client id carries a `?v=<hash>`; linked from outside, as in
 * the workspace, it does not.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

const SOURCE = `import { middleware } from './middleware.js';

export const csrf = middleware()
  .client((ctx, next) => next(ctx))
  .server((ctx, next) => {
    const site = ctx.headers.get('sec-fetch-site');
    if (site === 'cross-site') throw new Error('cross-site request');
    return next(ctx);
  });
`;

/** What `tsc` would emit for it: the same text, and a map with no `sourcesContent`. */
const BUILT = `${SOURCE}//# sourceMappingURL=csrf.js.map\n`;
const MAP = JSON.stringify({
  version: 3,
  file: 'csrf.js',
  sources: ['../src/csrf.ts'],
  names: [],
  mappings: SOURCE.split('\n').map((_, i) => (i === 0 ? 'AAAA' : 'AACA')).join(';'),
});

const SERVER_HALF = ['sec-fetch-site', 'cross-site request'];

interface Map3 {
  readonly sources: readonly string[];
  readonly sourcesContent?: readonly (string | null)[];
}

/** The text the map carries for `src/csrf.ts`. */
function csrfText(map: unknown): string | null | undefined {
  const { sources, sourcesContent } = map as Map3;
  const i = sources.findIndex((s) => s.endsWith('src/csrf.ts'));
  expect(i, 'src/csrf.ts in sources').toBeGreaterThanOrEqual(0);
  return sourcesContent?.[i];
}

describe.each([
  ['installed under node_modules', 'node_modules/@fudic/http'],
  ['linked from outside node_modules', 'packages/http'],
])('criterion 14: a dist module with its own map, in dev — %s', (_, dir) => {
  let server: ViteDevServer;
  let csrf: string;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-dev-erased-'));
    const files: Record<string, string> = {
      'src/routes/index.fud': '<head><title>Inicio</title></head>\n<h1>Inicio</h1>\n',
      'fudic.json': JSON.stringify({ id: 'test' }),
      [`${dir}/package.json`]: JSON.stringify({ name: '@fudic/http', version: '0.0.1' }),
      [`${dir}/src/csrf.ts`]: SOURCE,
      [`${dir}/dist/csrf.js`]: BUILT,
      [`${dir}/dist/csrf.js.map`]: MAP,
      [`${dir}/dist/middleware.js`]: 'export const middleware = () => ({});\n',
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    csrf = `/@fs/${join(root, dir, 'dist', 'csrf.js').replace(/\\/gu, '/').replace(/^\//u, '')}`;
    server = await createServer({
      root,
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      server: { port: 0, fs: { strict: false } },
    });
  }, 120000);

  afterAll(async () => {
    await server.close();
  });

  it('on its way to the browser, neither the code nor the map carries the server half', async () => {
    const result = await server.transformRequest(csrf);
    expect(result).not.toBeNull();
    expect(result!.code).toContain('.server(undefined');
    for (const mark of SERVER_HALF) expect(result!.code, mark).not.toContain(mark);

    const text = csrfText(result!.map);
    expect(text).toBeTypeOf('string');
    expect(text).toContain('.server(undefined');
    for (const mark of SERVER_HALF) expect(text, mark).not.toContain(mark);
    // Blanked, not cut: every line of the source is still there.
    expect(text!.split('\n')).toHaveLength(SOURCE.split('\n').length);
    // The first request of a dev server compiles its plugin pipeline: seconds under coverage.
  }, 60000);

  it('for SSR, both halves are kept, in the code and in the map', async () => {
    const result = await server.transformRequest(csrf, { ssr: true });
    expect(result).not.toBeNull();
    for (const mark of SERVER_HALF) expect(result!.code, mark).toContain(mark);
    for (const mark of SERVER_HALF) expect(csrfText(result!.map), mark).toContain(mark);
  }, 60000);
});
