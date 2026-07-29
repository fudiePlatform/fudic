/**
 * Acceptance criterion §6.1 — a new project BUILDS. `fudic new demo` is applied to a real
 * temporary directory and the tree it produced goes through a real `vite build` with the
 * workspace plugin, which prerenders `/` from the generated layout + route.
 *
 * The criterion's `pnpm install` is replaced by workspace aliases, exactly as the plugin's
 * own build tests do: installing for real would need the `@fudic/*` packages published to
 * npm, which they are not. What the criterion is about — that the generated tree compiles
 * and renders — is verified whole.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '@fudic/vite';
import { planNew } from '../src/plans/new.js';
import { apply } from '../src/apply.js';
import { nodeReadIo, nodeWriteIo } from '../src/io.js';
import { RecordingRunner } from './helpers.js';
import type { NewOptions } from '../src/types.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

describe('fudic new → vite build (§6.1)', () => {
  let output: { fileName: string; code?: string; source?: string }[];
  let root: string;

  beforeAll(async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'fudic-new-'));
    const opts: NewOptions = {
      cwd,
      force: false,
      pm: 'pnpm',
      install: false,
      git: false,
      sw: true,
      layout: '_layout',
      target: 'static',
    };

    const runner = new RecordingRunner();
    const plan = await planNew('demo', opts, nodeReadIo());
    expect(plan.errors).toEqual([]);
    await apply(plan, opts, nodeWriteIo(), runner);
    expect(runner.commands).toEqual([]); // --no-install --no-git: nothing spawned

    root = join(cwd, 'demo');
    const result = (await build({
      root,
      logLevel: 'silent',
      // The generated `vite.config.ts` is not loaded: resolving its own `vite` and
      // `@fudic/vite` imports would need the install this test deliberately replaces with
      // workspace aliases. Its content is asserted separately in new.test.ts.
      configFile: false,
      resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
      plugins: [fudic()],
      build: { write: false, minify: false },
    })) as unknown as { output: { fileName: string; code?: string; source?: string }[] };
    output = result.output;
  }, 120_000);

  it('prerenders / from the generated layout and route', () => {
    const html = output.find((file) => file.fileName === 'index.html');
    expect(html, output.map((file) => file.fileName).join(', ')).toBeDefined();

    const text = String(html!.source);
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('<title>Home</title>');
    expect(text).toContain('<h1>Home</h1>');
    expect(text).toContain('/fudic-main.js');
  });

  it('publishes the route in the manifest', () => {
    const manifest = output.find((file) => file.fileName === 'fudic-routes.json');
    expect(manifest).toBeDefined();
    const parsed = JSON.parse(String(manifest!.source)) as { routes: { pattern: string }[] };
    expect(parsed.routes.map((route) => route.pattern)).toEqual(['/']);
  });

  it('emits the Service Worker, because the tree declares sw.json', () => {
    expect(output.some((file) => file.fileName === 'fudic-sw.js')).toBe(true);
  });
});
