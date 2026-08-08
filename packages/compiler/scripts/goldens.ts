/**
 * Regenerate the emit goldens: `npx tsx scripts/goldens.ts`.
 *
 * `golden.test.ts` locks the emitted modules byte for byte, which is exactly what makes a
 * change to the codegen visible — and exactly what makes updating them by hand a chore
 * nobody does carefully. This writes them from the current emit, in ONE run, so the diff
 * a reviewer reads is the whole change and nothing else.
 *
 * It is a deliberate step, never part of the build: regenerating a golden is saying "this
 * new output is the one I want", and that sentence has to be somebody's.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  type ResolveIo,
} from '../src/emit/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../fixtures');
const goldens = resolve(here, '../test/emit/__golden__');

const io: ResolveIo = {
  read: (path) => readFileSync(path, 'utf8'),
  resolve: (from, href) => resolve(dirname(from), href),
};

const graph = resolveComponents(join(fixtures, 'home.fud'), io);

function write(name: string, source: string): void {
  writeFileSync(join(goldens, name), source, 'utf8');
  process.stdout.write(`${name}\n`);
}

for (const tag of ['app-badge', 'app-button', 'app-card']) {
  const component = graph.components.get(tag)!;
  write(`${tag}.mjs`, emitComponentModule(graph, component));
  write(`${tag}.client.mjs`, emitComponentClientModule(graph, component));
}
write('home.mjs', emitPageModule(graph));
