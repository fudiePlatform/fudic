/**
 * A new term module (SDD-53 §4.2), written so that the validator reads it without a diagnostic:
 * `meta` matches its path, `run` and `selfTest` are exported. `run` fails until it is written,
 * so a term just created never passes by accident. `run` carries its type from `@fudic/terms`,
 * so the editor completes `ctx.` — with what the project's `fudic/bench.js` adds, too.
 */

import type { BlockKind } from '../ast.js';
import type { TermParam } from '../term-module.js';
import { quote } from './shape.js';

/** The project's extension, relative to its root: a term in `fudic/terms/<block>/` reaches it at `../../bench.js`. */
export const BENCH_FILE = 'fudic/bench.js';

/** The type of `run`: the stock ctx, or the one the project's `fudic/bench.js` leaves. */
function runType(bench: boolean): string {
  const ctx = bench ? ", import('@fudic/terms').ContextOf<typeof import('../../bench.js').default>" : '';
  return `/** @type {import('@fudic/terms').Term<string${ctx}>['run']} */\n`;
}

/**
 * A term module that satisfies SDD-52 §3.4: `meta`, an empty `run` and an empty `selfTest`.
 * `bench`: the project has a `fudic/bench.js`, whose ctx `run` is typed with.
 */
export function termModule(
  block: BlockKind,
  name: string,
  params: readonly TermParam[],
  options: { readonly bench?: boolean } = {},
): string {
  const list =
    params.length === 0
      ? '[]'
      : `[\n${params.map((p) => `    { name: ${quote(p.name)}, type: ${quote(p.type)} },\n`).join('')}  ]`;
  const args = params.length === 0 ? '' : `, { ${params.map((p) => p.name).join(', ')} }`;
  return (
    'export const meta = {\n' +
    `  name: ${quote(name)},\n` +
    `  block: ${quote(block)},\n` +
    `  params: ${list},\n` +
    '};\n' +
    '\n' +
    runType(options.bench === true) +
    `export async function run(ctx${args}) {\n` +
    "  return { pass: false, evidence: 'not implemented' };\n" +
    '}\n' +
    '\n' +
    'export const selfTest = [];\n'
  );
}
