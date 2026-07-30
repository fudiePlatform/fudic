/**
 * BUG-03 §4.1: the Service Worker's own build. A realm with its own loader gets its own
 * bundle — the same reason the link pass runs a nested `build()`, and the same shape.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServiceWorker, swChunkOf, swPlugin } from '../src/swbuild.js';
import { SW_ID, BUILD_TOKEN } from '../src/constants.js';

const OPTIONS = {
  manifestUrlExpr: '"/fudic-routes.json"',
  shell: ['/style.css'],
  resources: [],
};

describe('swChunkOf', () => {
  it('returns the code of the pinned entry chunk', () => {
    expect(
      swChunkOf([
        { type: 'asset', fileName: 'x.css' },
        { type: 'chunk', fileName: 'fudic-sw.js', code: 'self.addEventListener()' },
      ]),
    ).toEqual({ code: 'self.addEventListener()' });
  });

  it('carries the chunk’s map when the build produced one (BUG-05 §3.3)', () => {
    expect(
      swChunkOf([
        { type: 'chunk', fileName: 'fudic-sw.js', code: 'boot()', map: { version: 3 } },
      ]),
    ).toEqual({ code: 'boot()', map: '{"version":3}' });
  });

  it('returns empty when the bundler produced no such chunk', () => {
    // Not reachable through `buildServiceWorker` — it pins `entryFileNames` — but the
    // shape is the bundler's, not ours, so the fallback is a decision and not an
    // accident: an empty worker is visible, a crash mid-build is not.
    expect(swChunkOf([{ type: 'asset', fileName: 'x.css' }])).toEqual({ code: '' });
    expect(swChunkOf([{ type: 'chunk', fileName: 'fudic-sw.js' }])).toEqual({ code: '' });
  });
});

describe('swPlugin', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const plugin = swPlugin(OPTIONS) as any;

  it('claims only the Service Worker id, and serves only its bootstrap', () => {
    // Everything else — `@fudic/transport`, `@fudic/ssr`, the app's own modules — belongs
    // to the ordinary resolution of the nested build. This plugin knows one module.
    expect(plugin.resolveId(SW_ID)).toBe(SW_ID);
    expect(plugin.resolveId('@fudic/transport')).toBeNull();
    expect(plugin.load(SW_ID)).toContain('createRouter');
    expect(plugin.load('@fudic/transport')).toBeNull();
  });
});

describe('buildServiceWorker', () => {
  // The package's own directory: it declares `@fudic/transport` and `@fudic/ssr` as
  // dependencies, so the nested build resolves them with NO alias — the path a real
  // project takes, and the branch a project built with aliases does not exercise.
  const root = fileURLToPath(new URL('..', import.meta.url));

  it('emits one self-contained file with the runtime bundled in', async () => {
    const result = await buildServiceWorker(root, '/', OPTIONS, undefined, { sourcemap: false });
    expect(result.fileName).toBe('fudic-sw.js');
    expect(result.code).toContain('createRouter');
    // The whole point: nothing left to fetch through a loader the fetch handler cannot see.
    expect(result.code).not.toMatch(/^\s*import\s/mu);
    expect(result.code).not.toMatch(/\bfrom\s*["']/u);
    // The token is still in place: the caller computes the id FROM this code (§4.3).
    expect(result.code).toContain(BUILD_TOKEN);
  }, 180000);

  it('forwards the host build’s alias, since the nested build reads no config file', async () => {
    const ssr = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
    const transport = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));
    const empty = mkdtempSync(join(tmpdir(), 'fudic-swbuild-'));
    // A root with no `node_modules` at all: only the alias can resolve `@fudic/*`.
    const result = await buildServiceWorker(
      empty,
      '/',
      OPTIONS,
      { '@fudic/ssr': ssr, '@fudic/transport': transport },
      { sourcemap: false },
    );
    expect(result.code).toContain('createRouter');
  }, 180000);
});
