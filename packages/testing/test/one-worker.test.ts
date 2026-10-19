/**
 * BUG-51 — files that share a worker share nothing else. A worker runs many files and keeps one
 * environment for all of them; a tag one file defined stayed defined in the window, bound to a
 * class the next file's modules no longer had, and its hydration failed with
 * `host.h is not a function`. Which files share a worker depends on the machine, so the case is
 * forced: two files that hydrate the same component, in a run of one worker.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const VITEST = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
const CONFIG = fileURLToPath(new URL('./app/one-worker/vitest.config.ts', import.meta.url));

test('two files that hydrate the same component pass in one worker', () => {
  const run = spawnSync(process.execPath, [VITEST, 'run', '--config', CONFIG], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 120_000,
  });
  expect(run.status, run.stdout + run.stderr).toBe(0);
  expect(run.stdout).toMatch(/Test Files\s+2 passed \(2\)/u);
}, 120_000);
