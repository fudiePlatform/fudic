/**
 * SSR emit demonstration: `npx tsx scripts/ssr.ts [file.fud]` (default: app-badge).
 *
 * Runs the real pipeline and the SSR emit, then PRINTS the emitted artifacts:
 * one render function per component and its page-head style module. It imports no
 * runtime package — the compiler only produces text. A consumer (@fudic/ssr) injects
 * `SsrDom` into `render` and serializes the tree with `renderToString`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileComponentSsr } from '../src/emit/index.js';

const arg = process.argv[2] ?? 'fixtures/app-badge.fud';
const source = readFileSync(resolve(process.cwd(), arg), 'utf8');
const emit = compileComponentSsr(source);

const BAR = '─'.repeat(72);
console.log(`\n${BAR}\nEMITTED SSR FUNCTION  —  <${emit.specifier}>  (one per component)\n${BAR}`);
console.log(emit.render);

console.log(`\n${BAR}\nEMITTED STYLE MODULE  (page <head>, SDD-18)\n${BAR}`);
console.log(emit.styleModule);

if (emit.diagnostics.length > 0) {
  console.log(`\n${BAR}\nNOT COVERED BY THIS SSR SLICE\n${BAR}`);
  for (const d of emit.diagnostics) console.log(`- ${d}`);
}
console.log();
