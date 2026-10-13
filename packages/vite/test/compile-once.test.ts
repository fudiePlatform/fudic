/**
 * A `.fud` is compiled once per build, however many passes ask for it.
 *
 * The host bundle, the link pass (there is a `sw.json`) and the edge pass each transform the
 * same `.fud` with the same route name. A real `vite build` runs the three, and this file
 * counts the compiles: one per (file, route name), and every file the passes needed was
 * compiled at all — so the count is not one because nobody asked.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { runtimeAlias, writeTypecheckConfig } from './helpers/alias.js';

/** Every `transformFud`, keyed by the file and the route name it was asked for. */
const compiles = vi.hoisted(() => ({ keys: [] as string[], asked: [] as string[] }));

/** Every `compileFud` a pass asked for, same key: the memory answers the repeats. */
vi.mock('../src/compile.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/compile.js')>();
  return {
    ...actual,
    compileFud: (...args: Parameters<typeof actual.compileFud>) => {
      compiles.asked.push(`${args[0].replace(/\\/gu, '/')}#${args[2] ?? ''}`);
      return actual.compileFud(...args);
    },
  };
});

vi.mock('../src/transform.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/transform.js')>();
  return {
    ...actual,
    transformFud: (...args: Parameters<typeof actual.transformFud>) => {
      if (args[0].endsWith('.fud')) compiles.keys.push(`${args[0].replace(/\\/gu, '/')}#${args[2] ?? ''}`);
      return actual.transformFud(...args);
    },
  };
});

const { fudic } = await import('../src/index.js');

const BADGE = `<x-badge><template shadowrootmode="open"><span><slot></slot></span></template></x-badge>
`;

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <link rel="component" href="../components/x-badge.fud">
  <title>uno</title>
</head>
<body><x-badge>hola</x-badge></body>
</html>
`;

describe('three passes, one compile per .fud', () => {
  let counts: Map<string, number>;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-compile-once-'));
    writeTypecheckConfig(root);
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    mkdirSync(join(root, 'src', 'components'), { recursive: true });
    writeFileSync(join(root, 'src', 'components', 'x-badge.fud'), BADGE);
    writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
    // A Service Worker, so the link pass runs too.
    writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
    writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
    compiles.keys = [];
    compiles.asked = [];
    await build({
      root,
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { write: false, minify: false, sourcemap: true },
    });
    counts = new Map();
    for (const key of compiles.keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }, 300000);

  it('the route and the component it links were compiled', () => {
    const files = [...counts.keys()].map((k) => k.slice(0, k.indexOf('#')));
    expect(files.some((f) => f.endsWith('/src/routes/index.fud'))).toBe(true);
    expect(files.some((f) => f.endsWith('/src/components/x-badge.fud'))).toBe(true);
  });

  it('each (file, route name) exactly once', () => {
    expect([...counts.entries()].filter(([, n]) => n !== 1)).toEqual([]);
  });

  it('while the passes asked for them more than once — the one is the memory, not silence', () => {
    for (const key of counts.keys()) {
      expect(compiles.asked.filter((k) => k === key).length, key).toBeGreaterThan(1);
    }
  });
});
