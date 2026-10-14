/**
 * `liveCheck: false` keeps the dev server from checking the project's types (SDD-57): a vitest
 * run has no overlay to push to, and `@fudic/testing` asks for it off.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin, ViteDevServer } from 'vite';
import { fakeDevServerParts } from './helpers/dev-server.js';

const started = vi.hoisted(() => ({ count: 0 }));

vi.mock('../src/dev-typecheck.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/dev-typecheck.js')>();
  return {
    ...actual,
    startLiveCheck: () => {
      started.count += 1;
      return { dispose: () => undefined };
    },
  };
});

const { fudic } = await import('../src/index.js');

/** Run the plugin's `configureServer` against a fake server rooted at an empty project. */
async function configure(plugin: Plugin): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-live-check-'));
  (plugin.configResolved as (c: unknown) => void)({
    root,
    base: '/',
    command: 'serve',
    publicDir: join(root, 'public'),
    build: { outDir: join(root, 'dist'), sourcemap: false, minify: false },
    logger: fakeDevServerParts().config.logger,
    resolve: { alias: [] },
  });
  const server = { ...fakeDevServerParts(), middlewares: { use: () => undefined } } as unknown as ViteDevServer;
  await (plugin.configureServer as (s: ViteDevServer) => Promise<unknown>)(server);
}

describe('liveCheck', () => {
  it('starts the live check by default', async () => {
    started.count = 0;
    await configure(fudic());
    expect(started.count).toBe(1);
  });

  it('starts none with liveCheck: false', async () => {
    started.count = 0;
    await configure(fudic({ liveCheck: false }));
    expect(started.count).toBe(0);
  });
});

describe('NO_LIVE_CHECK', () => {
  it('reports nothing and blocks no page', async () => {
    const { NO_LIVE_CHECK } = await import('../src/dev-typecheck.js');
    await expect(NO_LIVE_CHECK.current()).resolves.toEqual({ problems: [], project: [], inputs: [] });
    await expect(NO_LIVE_CHECK.blocking(['/p/x.fud'])).resolves.toBeUndefined();
    expect(NO_LIVE_CHECK.dispose()).toBeUndefined();
  });
});
