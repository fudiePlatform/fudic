/**
 * A new term module (SDD-53 §4.2), written so that the validator reads it without a diagnostic:
 * `meta` matches its path, `run` and `selfTest` are exported. `run` fails until it is written,
 * so a term just created never passes by accident.
 */

import type { BlockKind } from '../ast.js';
import type { TermParam } from '../term-module.js';
import { quote } from './shape.js';

/** A term module that satisfies SDD-52 §3.4: `meta`, an empty `run` and an empty `selfTest`. */
export function termModule(block: BlockKind, name: string, params: readonly TermParam[]): string {
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
    `export async function run(ctx${args}) {\n` +
    "  return { pass: false, evidence: 'not implemented' };\n" +
    '}\n' +
    '\n' +
    'export const selfTest = [];\n'
  );
}
