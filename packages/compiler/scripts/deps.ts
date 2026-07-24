/**
 * Dependency graph demo: `npx tsx scripts/deps.ts [entry.fud]` (default home.fud).
 *
 * Resolves the `<link rel="component">` graph from the AST — the thing that must exist
 * before the emit knows what to render. The compiler is filesystem-free; this script
 * injects `read`/`resolve` from node.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { resolveComponents, type ResolveIo } from '../src/emit/index.js';

const io: ResolveIo = {
  read: (p) => readFileSync(p, 'utf8'),
  resolve: (from, href) => resolve(dirname(from), href),
};

const entry = resolve(process.cwd(), process.argv[2] ?? 'fixtures/home.fud');
const graph = resolveComponents(entry, io);

console.log(`entry: ${entry.split(/[\\/]/u).pop()} (${graph.entry.type})`);
console.log(`entry links → ${graph.entryDeps.join(', ')}`);
console.log(`\nresolved components (transitive): ${graph.components.size}`);
for (const c of graph.components.values()) {
  const deps = c.deps.length ? c.deps.join(', ') : '(none)';
  console.log(`  <${c.tag}>  from ${c.path.split(/[\\/]/u).pop()}  → links: ${deps}`);
}
