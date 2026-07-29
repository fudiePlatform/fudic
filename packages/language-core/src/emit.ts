/**
 * The entry point: every virtual file of one `.fud` (SDD-23 §3.1, §4.1).
 *
 * It owns the single Oxc invocation the golden rule allows per file — the neutral chunks of
 * `@code` go into one batch, and the result is handed down to the client emitter. Nobody
 * below this function parses JS again.
 *
 * Never throws. A `.fud` with parse diagnostics still yields the best virtual files its
 * partial AST allows (§4.6): a half-written file is the normal state of an editor, and
 * refusing to emit turns off completion exactly when it is needed.
 */

import { JsBatch, type OxcNode, type StructuredDocument } from '@fudic/compiler';
import { partitionCode } from './code.js';
import { emitCssVirtuals } from './css.js';
import { emitClientVirtual } from './emit-client.js';
import { emitServerVirtual } from './emit-server.js';
import { findPropsCall, type PropsCall } from './props.js';
import type { FileRegistry, VirtualFile } from './types.js';

/** Everything the emitter needs about one file. */
export interface EmitInput {
  /** The `.fud` source text. Every verbatim copy is a slice of it. */
  readonly source: string;
  /** Path of the `.fud`, which the virtual names derive from. */
  readonly fileName: string;
  /** The parsed document (SDD-10). Partial ASTs are welcome. */
  readonly document: StructuredDocument;
  /** Resolves this file's `<link>`s. Injected; no I/O happens here (§2). */
  readonly registry: FileRegistry;
}

/**
 * Emit the client virtual, the server virtual and one CSS virtual per `<style>`.
 *
 * Deterministic: the same input yields the same bytes and the same mappings, which is what
 * lets the server cache virtuals by document version.
 */
export function emitVirtualFiles(input: EmitInput): readonly VirtualFile[] {
  const { source, fileName, document, registry } = input;
  const props = findProps(source, document);

  return [
    emitClientVirtual(source, fileName, document, registry, props),
    emitServerVirtual(source, fileName, document.code),
    ...emitCssVirtuals(source, fileName, document),
  ];
}

/**
 * Locate `props<T>()` in the neutral zone, with one Oxc batch for the whole file.
 *
 * A fragment that fails to parse yields no props rather than no virtual file: the syntax
 * error already has its own diagnostic (FUD0170), and the template around it must keep
 * working.
 */
function findProps(source: string, doc: StructuredDocument): PropsCall | undefined {
  const { neutral } = partitionCode(doc.code);
  if (neutral.length === 0) return undefined;

  const batch = new JsBatch(source);
  const ids = neutral.map((chunk) => batch.add('module-statements', chunk));
  const result = batch.parse().value;

  for (const id of ids) {
    // `module-statements` always yields a statement list (SDD-11 §3.2); the single-node
    // half of the union belongs to the fragment kinds this emitter never registers, so
    // branching on it would be dead code, not defensiveness.
    const statements = result.ast(id) as readonly OxcNode[];
    const found = findPropsCall(statements, (s, e) => result.mapSpan(s, e));
    if (found !== undefined) return found;
  }
  return undefined;
}
