/**
 * BUG-09 §3.1: the edge pass. Same shape as the link pass, opposite `withLoad`, and one
 * difference that is the entire point — its output is never emitted into the bundle.
 *
 * What is worth pinning here is the pair: the edge wrapper CALLS the route's `load`, and the
 * link pass's wrapper for the same route does not. Those two facts together are the
 * boundary; either one alone says nothing.
 *
 * The `load` is the `.fudapi`'s, implemented in `src/server` (SDD-60 §3.12): the pass is handed
 * the server variant of the generated modules and the server root, as the plugin hands them.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEdgePass, type EdgeExtras, type EdgeResult } from '../src/edge.js';
import { runLinkPass } from '../src/link.js';
import { type ModeDecision } from '../src/mode.js';
import { type RouteBuild } from '../src/discover.js';
import { NO_STRATEGY } from '../src/strategy.js';
import { nodeIo } from '../src/io.js';
import { EDGE_PREFIX } from '../src/constants.js';
import { API_SCHEME, ApiProject } from '../src/api-modules.js';
import { SERVER_ROOT_ID, emitRoot } from '../src/api-root.js';
import { httpAlias } from './helpers/http-project.js';

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    <link rel="server" href="./about.fudapi">
    <title>@data.title</title>
  </head>
  <body><h1>@data.title</h1></body>
</html>
`;

const PAGE_API = `load
  title  str
`;

const PAGE_SERVER = `import { load } from 'fudic:routes/about';
import { listSecrets } from '../data/secrets';

load.handle(async () => ({ title: (await listSecrets())[0]! }));
`;

const SECRETS = `export async function listSecrets() {
  return ['sk-live-do-not-publish'];
}
`;

let root = '';

function routeBuild(pattern: string, file: string, decision: ModeDecision): RouteBuild {
  return {
    route: { file, pattern, params: [] },
    absPath: join(root, 'src', 'routes', file),
    analysis: {
      role: 'page' as const,
      isPage: true,
      hasLoad: true,
      hasPaths: false,
      hasLayout: false,
      api: 'routes/about',
      strategy: NO_STRATEGY,
      diagnostics: [],
    },
    decision,
  };
}

/** The server side of the generated modules and the server root, as the plugin serves them. */
function serverApi(): EdgeExtras {
  const project = new ApiProject(root);
  const text = (id: string): string | undefined =>
    id === SERVER_ROOT_ID
      ? emitRoot({ side: 'server', folders: { server: 'src/server', browser: 'src/browser' }, libraries: [], ids: project.ids() })
      : id.startsWith(API_SCHEME)
        ? project.module(id.slice(API_SCHEME.length), 'server')
        : undefined;
  return { api: text, root: SERVER_ROOT_ID };
}

const mode = (m: ModeDecision['mode']): ModeDecision => ({
  mode: m,
  prerender: false,
  enumerate: false,
  prerenderedHtml: false,
});

describe('runEdgePass', () => {
  let result: EdgeResult;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'fudic-edge-'));
    for (const dir of ['routes', 'server', 'data']) mkdirSync(join(root, 'src', dir), { recursive: true });
    writeFileSync(join(root, 'src', 'routes', 'about.fud'), PAGE);
    writeFileSync(join(root, 'src', 'routes', 'about.fudapi'), PAGE_API);
    writeFileSync(join(root, 'src', 'server', 'about.ts'), PAGE_SERVER);
    writeFileSync(join(root, 'src', 'data', 'secrets.ts'), SECRETS);
    result = await runEdgePass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('ssg'))],
      nodeIo(),
      // Its `load` runs through `@fudic/http/contract`, which this package does not depend on.
      httpAlias,
      { sourcemap: false, minify: false },
      undefined,
      undefined,
      undefined,
      undefined,
      serverApi(),
    );
  }, 300000);

  it('names the entry after the route, unhashed: it is read by name, never fetched', () => {
    expect(result.entries.get('/about')).toBe('about.js');
    expect(result.chunks.some((c) => c.fileName === 'about.js')).toBe(true);
  });

  it('resolves data in process — the `load` handler is bundled in', () => {
    const entry = result.chunks.find((c) => c.fileName === result.entries.get('/about'))!;
    // The handler is a file of `src/server` the server root loads: a chunk of this pass, not
    // necessarily the route's entry.
    expect(result.chunks.some((c) => c.code.includes('sk-live-do-not-publish'))).toBe(true);
    expect(entry.code).toMatch(/export\s*\{[^}]*\bdata\b/u);
  });

  it('and the link pass, over the SAME route, bundles none of it', async () => {
    // The boundary, stated as the difference between the two passes.
    const linked = await runLinkPass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('sw'))],
      nodeIo(),
      { sourcemap: false, minify: false },
    );
    for (const chunk of linked.chunks) {
      expect(chunk.code).not.toContain('sk-live-do-not-publish');
      expect(chunk.code).not.toContain('listSecrets');
    }
  }, 300000);

  it('carries a map whatever the host asked for its client (SDD-60 §4.6)', async () => {
    // Every chunk with code of its own. The server root's entry is a facade — its module is
    // hoisted into a shared chunk, leaving only `import`/`export` lines — and the bundler maps
    // nothing for it: there is no line of it a stack trace could name.
    const ownCode = (c: { code: string }): boolean =>
      c.code.split('\n').some((line) => line.trim() !== '' && !/^(?:import|export)\s/u.test(line));
    expect(result.chunks.filter(ownCode).length).toBeGreaterThan(1);
    expect(result.chunks.filter(ownCode).every((c) => c.map !== undefined)).toBe(true);
    const mapped = await runEdgePass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('ssg'))],
      nodeIo(),
      httpAlias,
      { sourcemap: true, minify: false },
      undefined,
      undefined,
      undefined,
      undefined,
      serverApi(),
    );
    expect(mapped.chunks.filter(ownCode).every((c) => c.map !== undefined)).toBe(true);
  }, 300000);

  it('produces nothing when every route is excluded', async () => {
    const empty = await runEdgePass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('excluded'))],
      nodeIo(),
      undefined,
      { sourcemap: false, minify: false },
    );
    expect(empty.chunks).toEqual([]);
    expect(empty.entries.size).toBe(0);
  });

  it('serves nothing for an id it does not own, and no wrapper for an unknown route', async () => {
    // The plugin of the nested build knows exactly one kind of module. Both guards are
    // reachable only from here: the pass itself never asks for a route it did not list.
    const { edgePlugin } = await import('../src/edge.js');
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const plugin = edgePlugin([routeBuild('/about', 'about.fud', mode('ssg'))], nodeIo(), '/') as any;
    expect(plugin.resolveId('@fudic/ssr')).toBeNull();
    expect(plugin.load('@fudic/ssr')).toBeNull();
    // The wrapper prefix carries no NUL. Written with one, this asked the OTHER guard — the
    // id-this-plugin-does-not-own one — and the unknown-route branch was never reached.
    expect(plugin.resolveId(`${EDGE_PREFIX}/nope`)).toBe(`${EDGE_PREFIX}/nope`);
    expect(plugin.load(`${EDGE_PREFIX}/nope`)).toBeNull();
  });

  it('wraps a route it DOES know, with the runtime URLs of this base', async () => {
    const { edgePlugin } = await import('../src/edge.js');
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const plugin = edgePlugin([routeBuild('/about', 'about.fud', mode('ssg'))], nodeIo(), '/') as any;

    // `runtimeFor` defaults to this base's own URLs (SDD-45 §4.4): the edge pass renders the
    // pages of ONE application, so a caller that does not name a route's pieces still gets a
    // wrapper — with the shared answer rather than with none.
    expect(plugin.load(`${EDGE_PREFIX}/about`)).toContain('export');
  });
});
