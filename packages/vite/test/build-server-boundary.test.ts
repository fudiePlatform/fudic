/**
 * BUG-09: what `@server` publishes. The build has always had the rule written down —
 * `link.ts:90`, «server code never ships to the client» — and enforced it in one of the
 * two wrapper emitters. The edge wrapper was emitted as a chunk of the CLIENT build, so
 * `load` and every module `@server` imports landed under `/assets/`, announced by the
 * manifest and served by any static host.
 *
 * The identifier the tests hunt for, `SECRET_TOKEN`, only ever appears inside `@server`.
 * Anything in `outDir` that mentions it — code or map — is something that crossed.
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

/** The server-only module. Its name and its contents must not reach `outDir`. */
const SECRETS = `export const SECRET_TOKEN = 'sk-live-do-not-publish';
export async function listPosts() {
  return [{ slug: 'a', title: 'A', token: SECRET_TOKEN }];
}
`;

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="../components/app-badge.fud">

    @code {
      type PageData = { title: string };

      @server {
        import { listPosts } from '../data/secrets';

        export async function load(): Promise<PageData> {
          const posts = await listPosts();
          return { title: posts[0].title };
        }
      }
    }

    <title>@data.title</title>
  </head>
  <body>
    <h1>@data.title</h1>
    <app-badge>ok</app-badge>
  </body>
</html>
`;

const BADGE = `<head>
  <style>.badge { border: 1px solid #ccc; }</style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class="badge"><slot></slot></span>
  </template>
</app-badge>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

const textOf = (file: OutFile): string =>
  file.code ?? (typeof file.source === 'string' ? file.source : '');

describe('vite build — nothing of `@server` reaches the published output', () => {
  let output: OutFile[];

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-boundary-'));
    mkdirSync(join(root, 'routes'), { recursive: true });
    mkdirSync(join(root, 'components'), { recursive: true });
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
    writeFileSync(join(root, 'components', 'app-badge.fud'), BADGE);
    writeFileSync(join(root, 'data', 'secrets.ts'), SECRETS);
    writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
    const result = (await build({
      root,
      logLevel: 'silent',
      resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
      plugins: [fudic()],
      // Source maps ON: it is the configuration the example ships, and half of this BUG
      // only exists under it.
      build: { write: false, minify: false, sourcemap: true },
    })) as unknown as { output: OutFile[] };
    output = result.output;
  }, 300000);

  it('§6.1 no emitted file mentions the server-only identifier — code or map', () => {
    const leaking = output.filter((o) => textOf(o).includes('SECRET_TOKEN')).map((o) => o.fileName);
    expect(leaking).toEqual([]);
  });

  it('§6.1 nor the value it guards', () => {
    const leaking = output
      .filter((o) => textOf(o).includes('sk-live-do-not-publish'))
      .map((o) => o.fileName);
    expect(leaking).toEqual([]);
  });

  it('§6.2 the server-only module is not a chunk of the client build', () => {
    // It reached `/assets/` because the edge wrapper imported it and the edge wrapper was
    // a chunk of this build. No importer in the client graph, no chunk.
    expect(output.map((o) => o.fileName).filter((n) => /secrets/u.test(n))).toEqual([]);
  });

  it('§6.3 the manifest does not publish `esm`', () => {
    const manifest = JSON.parse(
      textOf(output.find((o) => o.fileName === 'fudic-routes.json')!),
    ) as { routes: Array<Record<string, unknown>> };
    expect(manifest.routes.length).toBeGreaterThan(0);
    for (const record of manifest.routes) {
      expect(record['esm']).toBeUndefined();
    }
  });

  it('§6.4 a linkable chunk’s map carries the markup but not the `@server` body', () => {
    const chunk = output.find((o) => o.fileName.startsWith('sw/c/') && o.fileName.endsWith('.js.map'));
    expect(chunk).toBeDefined();
    const map = JSON.parse(textOf(chunk!)) as { sourcesContent?: string[] };
    const fud = (map.sourcesContent ?? []).find((s) => s.includes('<h1>'));
    expect(fud).toBeDefined();
    // What is debugged stays; what never runs in the browser goes.
    expect(fud).toContain('<h1>');
    expect(fud).not.toContain('listPosts');
    expect(fud).not.toContain('../data/secrets');
  });
});
