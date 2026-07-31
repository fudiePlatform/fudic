/**
 * BUG-09 §3.1: the edge pass. Same shape as the link pass, opposite `withLoad`, and one
 * difference that is the entire point — its output is never emitted into the bundle.
 *
 * What is worth pinning here is the pair: the edge wrapper CALLS `@server load`, and the
 * link pass's wrapper for the same route does not. Those two facts together are the
 * boundary; either one alone says nothing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEdgePass, type EdgeResult } from '../src/edge.js';
import { runLinkPass } from '../src/link.js';
import { type ModeDecision } from '../src/mode.js';
import { type RouteBuild } from '../src/discover.js';
import { NO_STRATEGY } from '../src/strategy.js';
import { nodeIo } from '../src/io.js';

const PAGE = `<!DOCTYPE html>
<html>
  <head>
    @code {
      type PageData = { title: string };

      @server {
        import { listSecrets } from '../data/secrets';

        export async function load(): Promise<PageData> {
          return { title: (await listSecrets())[0] };
        }
      }
    }

    <title>@data.title</title>
  </head>
  <body><h1>@data.title</h1></body>
</html>
`;

const SECRETS = `export async function listSecrets() {
  return ['sk-live-do-not-publish'];
}
`;

let root = '';

function routeBuild(pattern: string, file: string, decision: ModeDecision): RouteBuild {
  return {
    route: { file, pattern, params: [] },
    absPath: join(root, 'routes', file),
    analysis: { role: 'page' as const, isPage: true, hasLoad: true, hasPaths: false, strategy: NO_STRATEGY },
    decision,
  };
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
    mkdirSync(join(root, 'routes'), { recursive: true });
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'routes', 'about.fud'), PAGE);
    writeFileSync(join(root, 'data', 'secrets.ts'), SECRETS);
    result = await runEdgePass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('ssg'))],
      nodeIo(),
      undefined,
      { sourcemap: false, minify: false },
    );
  }, 300000);

  it('names the entry after the route, unhashed: it is read by name, never fetched', () => {
    expect(result.entries.get('/about')).toBe('about.js');
    expect(result.chunks.some((c) => c.fileName === 'about.js')).toBe(true);
  });

  it('resolves data in process — the `@server load` is bundled in', () => {
    const entry = result.chunks.find((c) => c.fileName === result.entries.get('/about'))!;
    expect(entry.code).toContain('sk-live-do-not-publish');
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

  it('carries a map when the host asked for one, and none when it did not', async () => {
    expect(result.chunks.every((c) => c.map === undefined)).toBe(true);
    const mapped = await runEdgePass(
      root,
      '/',
      [routeBuild('/about', 'about.fud', mode('ssg'))],
      nodeIo(),
      undefined,
      { sourcemap: true, minify: false },
    );
    expect(mapped.chunks.every((c) => c.map !== undefined)).toBe(true);
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
    const plugin = edgePlugin([routeBuild('/about', 'about.fud', mode('ssg'))], nodeIo()) as any;
    expect(plugin.resolveId('@fudic/ssr')).toBeNull();
    expect(plugin.load('@fudic/ssr')).toBeNull();
    expect(plugin.load('\0fudic-edge:/nope')).toBeNull();
  });
});
