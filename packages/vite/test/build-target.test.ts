/**
 * SDD-83 §3.9, criterion 31: with no `build.target` of the user's, the build goes out with the one
 * `browsersFor` gives for the project's Baseline, and so do its nested builds (the Service Worker);
 * with the user's own, theirs.
 *
 * The proof on the bytes is optional chaining: Chrome 80 brought it (2020), so a Baseline of 2018
 * lowers every `?.` of the worker, and `widely` keeps them.
 */

import { describe, it, expect } from 'vitest';
import { build, type Plugin } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTargetOf, CONFIG_FILE, type ConfigIo } from '@fudic/config';
import { fudic } from '../src/index.js';
import { baselineTarget } from '../src/config.js';
import { nestedTarget } from '../src/nested.js';
import { runtimeAlias } from './helpers/alias.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>Home</h1></body>
</html>
`;

interface OutFile {
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

function projectRoot(config: object): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-target-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test', ...config }));
  return root;
}

/** The worker the build emits, and the `build.target` Vite resolved. */
async function buildRoot(config: object, target?: string): Promise<{ readonly sw: string; readonly target: unknown }> {
  let resolved: unknown;
  const spy: Plugin = {
    name: 'spy',
    configResolved(c) {
      resolved = c.build.target;
    },
  };
  const result = (await build({
    root: projectRoot(config),
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic(), spy],
    build: { write: false, minify: false, ...(target === undefined ? {} : { target }) },
  })) as unknown as { output: OutFile[] };
  const sw = result.output.find((file) => file.fileName === 'fudic-sw.js')!;
  return { sw: sw.code ?? String(sw.source), target: resolved };
}

describe('build.target from the Baseline (criterion 31)', () => {
  it('a Baseline of 2018 is the build target, and the Service Worker is lowered to it', async () => {
    const { sw, target } = await buildRoot({ baseline: 2018 });
    expect(target).toEqual([...buildTargetOf({ baseline: { target: 2018, allow: [] } })]);
    expect(sw).toContain('createRouter');
    expect(sw).not.toContain('?.');
  }, 180_000);

  it('widely, when fudic.json says nothing, keeps what those browsers have', async () => {
    const { sw, target } = await buildRoot({});
    expect(target).toEqual([...buildTargetOf(null)]);
    expect(sw).toContain('?.');
  }, 180_000);

  it("the user's own target wins, for the host and its nested builds", async () => {
    const { sw, target } = await buildRoot({ baseline: 2018 }, 'esnext');
    expect(target).toBe('esnext');
    expect(sw).toContain('?.');
  }, 180_000);
});

describe('baselineTarget and nestedTarget on their own', () => {
  const io = (text: string): ConfigIo => ({ exists: (path) => path.endsWith(CONFIG_FILE), read: () => text });

  it('reads the fudic.json of the root the user names, or of the cwd', () => {
    expect(baselineTarget({ root: '/p' }, io('{"baseline":2024}'))).toEqual({
      target: [...buildTargetOf({ baseline: { target: 2024, allow: [] } })],
    });
    expect(baselineTarget(undefined, io('{}'))).toEqual({ target: [...buildTargetOf(null)] });
    expect(baselineTarget({ build: { target: 'es2020' } }, io('{"baseline":2024}'))).toEqual({});
  });

  it('passes on what the host resolved, and nothing when it has none', () => {
    expect(nestedTarget({ sourcemap: false, minify: false })).toEqual({});
    expect(nestedTarget({ sourcemap: false, minify: false, target: false })).toEqual({ target: false });
    expect(nestedTarget({ sourcemap: false, minify: false, target: ['chrome80'] })).toEqual({ target: ['chrome80'] });
  });
});
