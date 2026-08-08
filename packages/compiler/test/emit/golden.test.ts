/**
 * Byte-for-byte golden test for the SSR emit. The demo output under the repo `out/` is
 * gitignored (a build artifact), so the known-good `.mjs` are committed here as goldens.
 * These lock the EXACT generated source — indentation, ids, whitespace and all — so any
 * refactor of the emit that changes a single byte fails loudly instead of silently
 * drifting the output. Update the goldens deliberately (copy the reviewed emit) when the
 * codegen is meant to change.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { fixturesDir, fixtureIo } from './_support.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const golden = (file: string): string => readFileSync(join(goldenDir, file), 'utf8');

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

describe('SSR emit — golden output (byte-for-byte)', () => {
  for (const tag of ['app-badge', 'app-button', 'app-card', 'app-list']) {
    it(`emits ${tag}.mjs exactly`, () => {
      const src = emitComponentModule(graph, graph.components.get(tag)!);
      expect(src).toBe(golden(`${tag}.mjs`));
    });
  }

  it('emits home.mjs exactly', () => {
    expect(emitPageModule(graph)).toBe(golden('home.mjs'));
  });
});

describe('client emit — golden output (byte-for-byte)', () => {
  // Every component gets a chunk, with no level filter: a component becomes N3 the moment
  // an ancestor hands it a reactive prop, and only the page knows that. `app-badge` has no
  // `@code { @client }` at all and still gets one.
  for (const tag of ['app-badge', 'app-button', 'app-card', 'app-list']) {
    it(`emits ${tag}.client.mjs exactly`, () => {
      const src = emitComponentClientModule(graph, graph.components.get(tag)!);
      expect(src).toBe(golden(`${tag}.client.mjs`));
    });
  }
});
