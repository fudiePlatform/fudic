/**
 * Emit the modules: `npx tsx scripts/build.ts [entry.fud] [outDir]`.
 *
 * Resolves the component graph from the AST links and emits, per component, the server
 * `<tag>.mjs` AND the client `<tag>.client.mjs` — the latter for EVERY component, with no
 * level filter: a component becomes N3 the moment an ancestor hands it a reactive prop, and
 * the page is what knows that. Plus `home.mjs` for the page. The compiler produces text and
 * touches no runtime; this script only injects filesystem I/O and writes the files.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  type ResolveIo,
} from '../src/emit/index.js';

const io: ResolveIo = {
  read: (p) => readFileSync(p, 'utf8'),
  resolve: (from, href) => resolve(dirname(from), href),
};

const entry = resolve(process.cwd(), process.argv[2] ?? 'fixtures/home.fud');
const outDir = resolve(process.cwd(), process.argv[3] ?? 'out');
mkdirSync(outDir, { recursive: true });

const graph = resolveComponents(entry, io);
const written: string[] = [];
for (const comp of graph.components.values()) {
  const server = `${comp.tag}.mjs`;
  writeFileSync(join(outDir, server), emitComponentModule(graph, comp), 'utf8');
  written.push(server);
  const client = `${comp.tag}.client.mjs`;
  writeFileSync(join(outDir, client), emitComponentClientModule(graph, comp), 'utf8');
  written.push(client);
}
writeFileSync(join(outDir, 'home.mjs'), emitPageModule(graph), 'utf8');
written.push('home.mjs');

console.log(`emitted to ${outDir}:`);
for (const f of written) console.log(`  ${f}`);
