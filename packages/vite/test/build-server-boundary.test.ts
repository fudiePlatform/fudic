/**
 * BUG-09: what `@server` publishes. The build has always had the rule written down —
 * `link.ts:90`, «server code never ships to the client» — and enforced it in one of the
 * two wrapper emitters. The edge wrapper was emitted as a chunk of the CLIENT build, so
 * `load` and every module `@server` imports landed under `/assets/`, announced by the
 * manifest and served by any static host.
 *
 * The identifier the tests hunt for, `SECRET_TOKEN`, only ever appears in what the page's
 * `load` handler imports (`src/server`, SDD-60). Anything in `outDir` that mentions it — code
 * or map — is something that crossed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';


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
    <link rel="server" href="./index.fudapi">

    <title>@data.title</title>
  </head>
  <body>
    <h1>@data.title</h1>
    <app-badge>ok</app-badge>
  </body>
</html>
`;

const PAGE_API = `load
  title  str
`;

/** The page's `load`, in `src/server` (SDD-60 §3.12): the only importer of the secrets. */
const PAGE_SERVER = `import { load } from 'fudic:routes/index';
import { listPosts } from '../data/secrets';

load.handle(async () => {
  const posts = await listPosts();
  return { title: posts[0]!.title };
});
`;

/** The project on disk, under a fresh temp `root`. */
function writeProject(root: string): void {
  writeHttpTypecheckConfig(root);
  for (const dir of ['routes', 'components', 'data', 'server']) mkdirSync(join(root, 'src', dir), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'src', 'routes', 'index.fudapi'), PAGE_API);
  writeFileSync(join(root, 'src', 'server', 'index.ts'), PAGE_SERVER);
  writeFileSync(join(root, 'src', 'components', 'app-badge.fud'), BADGE);
  writeFileSync(join(root, 'src', 'data', 'secrets.ts'), SECRETS);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
}

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

describe('vite build — nothing of the server reaches the published output', () => {
  let output: OutFile[];

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-boundary-'));
    writeProject(root);
    const result = (await build({
      root,
      logLevel: 'silent',
      resolve: { alias: httpAlias },
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

  it('§6.4 a linkable chunk’s map carries the markup but not the server code', () => {
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

describe('vite build — written to disk, the boundary is a directory', () => {
  let root = '';

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'fudic-boundary-disk-'));
    writeProject(root);
    await build({
      root,
      logLevel: 'silent',
      resolve: { alias: httpAlias },
      plugins: [fudic()],
      build: { minify: false, sourcemap: true },
    });
  }, 300000);

  /** Every file under a directory, recursively, as absolute paths. */
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  }

  it('§6.10 the published tree carries nothing of the server', () => {
    const leaking = walk(join(root, 'dist')).filter((f) =>
      readFileSync(f, 'utf8').includes('SECRET_TOKEN'),
    );
    expect(leaking).toEqual([]);
  });

  it('§4.1 and the server output that does carry it lives outside `outDir`', () => {
    // The boundary is not a flag or a naming convention: it is which directory the file
    // is written to. `dist/` is published; this one is not. The wrapper is there, and the
    // handler it reaches through the server root is a chunk beside it (SDD-60 §4.4).
    const edge = join(root, '.fudic', 'edge');
    expect(existsSync(join(edge, 'index.js'))).toBe(true);
    const carrying = walk(edge).filter((f) => f.endsWith('.js') && readFileSync(f, 'utf8').includes('SECRET_TOKEN'));
    expect(carrying.length).toBeGreaterThan(0);
  });
});
