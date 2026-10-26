/**
 * Derivation of `data` in page and route files (SDD-23 §4.2).
 *
 * The template never declares the type of `data`; it reads it off the `load` of the route's
 * `.fudapi` (SDD-60 §4.7):
 *
 *     declare const data: import('fudic:routes/blog/[slug]').LoadData;
 *
 * Changing the contract of `load` then breaks the template without the template being
 * touched — which is the entire reason the projection exists. Without a `load`, `data` is
 * `unknown`, so every use of it fails **in the template**, where the user can see it.
 */

import type { StructuredDocument } from '@fudic/compiler';
import { ERROR_FILE } from '@fudic/conventions';
import { isFile } from './paths.js';
import type { ServerImport } from './types.js';
import type { VirtualWriter } from './writer.js';

/**
 * The `data` of `_error.fud`, which has no `load`: the server paints it with the problem of
 * what failed (SDD-56 §3.6).
 */
const ERROR_DATA =
  'interface ErrorPage {\n' +
  '  /** The HTTP status: 404, 401, 500… */\n' +
  '  readonly status: number;\n' +
  '  /** The standard name of the status: `Not Found`. */\n' +
  '  readonly title: string;\n' +
  "  /** What the server said, when it said something: `notFound('no such user')`. */\n" +
  '  readonly detail?: string;\n' +
  '}\n' +
  '/**\n' +
  ' * The error this page paints. Nobody declares it: `_error.fud` has no `load`, the server\n' +
  ' * renders it with what failed — a `load` that threw, or the call `error-pages` brought the\n' +
  ' * browser here from. Its type is `ErrorPage` of `@fudic/http`.\n' +
  ' */\n';

/**
 * Emit the `data` declaration for a file that has one.
 *
 * Components never get one: a component receives props, not route data, and declaring
 * `data` for them would silently accept a template that reads something the runtime will
 * not pass. Nor does a layout: what it reads is its props, which the route resolves — the
 * route's `data` is the route's to paint (BUG-44).
 */
export function emitDataDeclaration(
  w: VirtualWriter,
  doc: StructuredDocument,
  fudPath: string,
  servers: readonly ServerImport[] = [],
): void {
  if (doc.type === 'component-document' || doc.type === 'layout-document') return;
  if (isFile(fudPath, ERROR_FILE)) {
    w.scaffold(`${ERROR_DATA}declare const data: ErrorPage;\n`);
    return;
  }
  // The `load` of the route's `.fudapi` (SDD-60 §4.7): `data` is what it declares.
  const own = servers.find((s) => s.load);
  if (own !== undefined) {
    w.scaffold(`declare const data: import('fudic:${own.id}').LoadData;\n`);
    return;
  }

  w.scaffold('declare const data: unknown;\n');
}
