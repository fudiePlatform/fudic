/**
 * Emit the SSR modules: `npx tsx scripts/build.ts [entry.fud] [outDir]`.
 *
 * Resolves the component graph from the AST links and emits ONE `.mjs` per component
 * plus `home.mjs` for the page. The compiler produces text and touches no runtime; this
 * script only injects filesystem I/O and writes the files.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { resolveComponents, emitComponentModule, emitPageModule, type ResolveIo } from '../src/emit/index.js';

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
  const file = `${comp.tag}.mjs`;
  writeFileSync(join(outDir, file), emitComponentModule(graph, comp), 'utf8');
  written.push(file);
}
writeFileSync(join(outDir, 'home.mjs'), emitPageModule(graph), 'utf8');
written.push('home.mjs');

console.log(`emitted to ${outDir}:`);
for (const f of written) console.log(`  ${f}`);
