/**
 * The server functions of a file, as the browser side sees them (SDD-56 §3.5, §4.16).
 *
 * In the `@server` region `save` is a descriptor nobody can call; in the `@client` and in the
 * template's event expressions the same name is a function, because the build gives it a stub
 * there. The projection says the same thing:
 *
 *     declare const save: $Callable<$ServerModule['save']>;
 *
 * with `A` and `R` read off the builder by TypeScript itself — the editor never re-derives a
 * type the author already wrote. The names come from the compiler's own reader, so the editor
 * declares exactly the functions the build writes stubs for (BUG-23 §2.8: one reading, not two).
 *
 * The name is copied from the author's `export const save` with the echo profile: navigation
 * only, so going to the definition of a call lands on the export, and nothing else about that
 * offset is said twice — the server virtual already answers for it.
 */

import { readServerFns, type JsBatchResult, type OxcNode, type Span } from '@fudic/compiler';
import { USER_ECHO_CAPS } from './caps.js';
import { serverModuleSpecifier } from './paths.js';
import type { VirtualWriter } from './writer.js';

/** One server function: its exported name and where the author wrote it. */
export interface ClientFn {
  readonly name: string;
  readonly span: Span;
}

/** What the reader needs out of the file's single batch. */
export interface FnStatements {
  readonly result: JsBatchResult;
  /** Top-level statements of the `@server` regions. */
  readonly server: readonly OxcNode[];
  /** Every other top-level statement of `@code`, for the imports the chain refers to. */
  readonly rest: readonly OxcNode[];
  readonly component: boolean;
}

/**
 * The functions the client side can call. `load` is not one of them: the browser asks for it
 * by navigating, never by name (§3.2).
 */
export function clientFns(input: FnStatements): readonly ClientFn[] {
  const { fns } = readServerFns({
    server: input.server,
    all: [...input.rest, ...input.server],
    map: (offset) => input.result.mapOffset(offset),
    // Collisions with the browser's names are the build's `FUD1009` to report, not this.
    browserNames: new Set(),
    component: input.component,
    errorPage: false,
  });
  return fns.fns.filter((fn) => fn.name !== 'load').map(({ name, span }) => ({ name, span }));
}

/** Declare every function as the `ServerFunction<A, R>` its stub is. Nothing without any. */
export function emitClientFns(w: VirtualWriter, fudPath: string, fns: readonly ClientFn[]): void {
  if (fns.length === 0) return;
  // From `@fudic/http`, which the `@server` already imports to write a single verb.
  w.scaffold(
    `import type { ServerFn as $ServerFn, ServerFunction as $ServerFunction } from '@fudic/http';\n` +
      `type $Callable<T> = T extends $ServerFn<infer $A, infer $R> ? $ServerFunction<$A, $R> : never;\n` +
      `type $ServerModule = typeof import('${serverModuleSpecifier(fudPath)}');\n`,
  );
  for (const fn of fns) {
    w.scaffold('declare const ');
    w.copy(fn.span, USER_ECHO_CAPS);
    w.scaffold(`: $Callable<$ServerModule['${fn.name}']>;\n`);
  }
}
