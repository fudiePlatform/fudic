/**
 * SDD-60 criterion 21 — the browser bundle never contains `src/server`.
 *
 * `forms.spec.ts` measures it on the closure of one route. This one measures the whole client
 * output: every file `vite build` wrote to `dist/` — chunks, the runtime, the Service Worker,
 * the prerendered HTML and every sourcemap. A browser can fetch any of them, so none of them
 * may carry a byte of the server folder.
 *
 * Two probes. `ALIAS_TABLE_MARKER` lives in `src/data/aliases.ts`, which only `src/server`
 * imports: if it is in `dist/`, server code travelled. And no sourcemap may name a file of
 * `src/server` among its sources: that is how a handler that was bundled but renamed by the
 * minifier would still show up.
 *
 * The edge bundle (`.fudic/edge/`) is the control: it must contain both, or the probes measure
 * nothing.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');
const EDGE = join(ROOT, '.fudic', 'edge');

const MARKER = 'alias-table-must-not-ship';
const SERVER_SOURCE = /(?:^|[\\/])src[\\/]server[\\/]/u;

/** Every file under `dir`, recursively. */
function filesOf(dir: string): readonly string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

/** The files of `dir` whose text contains the marker. */
function withMarker(dir: string): readonly string[] {
  return filesOf(dir).filter((f) => readFileSync(f, 'utf8').includes(MARKER));
}

/** Every `sources` entry of every sourcemap under `dir` that is a file of `src/server`. */
function serverSources(dir: string): readonly string[] {
  return filesOf(dir)
    .filter((f) => f.endsWith('.map'))
    .flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as { sources: readonly string[] }).sources)
    .filter((s) => SERVER_SOURCE.test(s));
}

test.describe('the browser bundle carries nothing of src/server (SDD-60 criterion 21)', () => {
  test('the edge bundle has the server code, so the probes can see it', () => {
    expect(withMarker(EDGE).length).toBeGreaterThan(0);
    expect(serverSources(EDGE).length).toBeGreaterThan(0);
  });

  test('no file of dist/ contains the marker of the server data layer', () => {
    expect(withMarker(DIST)).toEqual([]);
  });

  test('no sourcemap of dist/ names a file of src/server', () => {
    expect(serverSources(DIST)).toEqual([]);
  });
});
