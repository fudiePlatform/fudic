/**
 * Derivation of `data` in page and route files (SDD-23 §4.2).
 *
 * The template never declares the type of `data`; it reads it off the `load()` of the
 * server virtual:
 *
 *     type $Data = typeof import('./[slug].fud.server') extends { load: (...a: never[]) => infer R }
 *       ? Awaited<R> : unknown;
 *     declare const data: $Data;
 *
 * Changing the contract of `load()` then breaks the template without the template being
 * touched — which is the entire reason the projection exists.
 *
 * The conditional type, rather than the direct `ReturnType<typeof import(…)['load']>` of
 * the SDD, is what makes the promised degradation real: with no `load`, indexing the module
 * type is itself an error, reported inside scaffolding where no span can carry it. The
 * conditional yields `unknown` instead, so every use of `data` fails **in the template**,
 * where the user can see it.
 */

import type { StructuredDocument } from '@fudic/compiler';
import { serverModuleSpecifier } from './paths.js';
import type { VirtualWriter } from './writer.js';

/**
 * Emit the `data` declaration for a file that has one.
 *
 * Components never get one: a component receives props, not route data, and declaring
 * `data` for them would silently accept a template that reads something the runtime will
 * not pass.
 */
export function emitDataDeclaration(
  w: VirtualWriter,
  doc: StructuredDocument,
  fudPath: string,
): void {
  if (doc.type === 'component-document') return;

  const server = serverModuleSpecifier(fudPath);
  w.scaffold(
    `type $Data = typeof import('${server}') extends { load: (...a: never[]) => infer $R }\n` +
      `  ? Awaited<$R>\n` +
      `  : unknown;\n` +
      `declare const data: $Data;\n`,
  );
}
