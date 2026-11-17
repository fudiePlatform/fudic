/**
 * Byte-for-byte golden test for the emit. The demo output under the repo `out/` is gitignored
 * (a build artifact), so the known-good `.mjs` are committed here as goldens. These lock the
 * EXACT generated source — indentation, ids, whitespace and all — so any refactor of the emit
 * that changes a single byte fails loudly instead of silently drifting the output.
 *
 * Regenerating them is a deliberate step, and one command: `pnpm --filter @fudic/compiler exec
 * vitest run test/emit/golden.test.ts -u`. Saying "this new output is the one I want" has to be
 * somebody's decision, and the diff a reviewer then reads is the whole change and nothing else.
 */
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
const golden = (file: string): string => join(goldenDir, file);

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

/** Every component of the fixture page: one list for both branches, so none goes unlocked. */
const TAGS = ['app-actions', 'app-badge', 'app-button', 'app-calendar', 'app-card', 'app-list'];

describe('SSR emit — golden output (byte-for-byte)', () => {
  for (const tag of TAGS) {
    it(`emits ${tag}.mjs exactly`, async () => {
      await expect(emitComponentModule(graph, graph.components.get(tag)!)).toMatchFileSnapshot(golden(`${tag}.mjs`));
    });
  }

  it('emits home.mjs exactly', async () => {
    await expect(emitPageModule(graph)).toMatchFileSnapshot(golden('home.mjs'));
  });
});

describe('client emit — golden output (byte-for-byte)', () => {
  // Every component gets a chunk, with no level filter: a component becomes N3 the moment
  // an ancestor hands it a reactive prop, and only the page knows that. `app-badge` has no
  // `@code { @client }` at all and still gets one.
  for (const tag of TAGS) {
    it(`emits ${tag}.client.mjs exactly`, async () => {
      await expect(emitComponentClientModule(graph, graph.components.get(tag)!)).toMatchFileSnapshot(
        golden(`${tag}.client.mjs`),
      );
    });
  }
});
