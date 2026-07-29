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

import {
  JsBatch,
  type FragmentId,
  type JsBatchResult,
  type OxcNode,
  type StructuredDocument,
} from '@fudic/compiler';
import { partitionCode } from './code.js';
import { emitCssVirtuals } from './css.js';
import { emitClientVirtual } from './emit-client.js';
import { emitServerVirtual } from './emit-server.js';
import { findPropsCall, type PropsCall } from './props.js';
import type { FileRegistry, VirtualFile } from './types.js';

/**
 * A JS batch someone else already ran, offered to the emitter instead of a second one.
 *
 * The language server parses every fragment of the document once — the semantic pass and the
 * `$` rule need the same AST this emitter needs — so handing the result over is what keeps
 * "Oxc is invoked exactly once per file" true in the process that types the most. Absent, the
 * emitter opens its own batch for the neutral chunks, which is what the CLI and the tests do.
 */
export interface EmitJs {
  readonly result: JsBatchResult;
  /** Fragment ids of the neutral chunks of `@code`, in source order. */
  readonly neutral: readonly FragmentId[];
}

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
  /** A batch already parsed by the caller. Absent ⇒ the emitter runs its own. */
  readonly js?: EmitJs;
}

/**
 * Emit the client virtual, the server virtual and one CSS virtual per `<style>`.
 *
 * Deterministic: the same input yields the same bytes and the same mappings, which is what
 * lets the server cache virtuals by document version.
 */
export function emitVirtualFiles(input: EmitInput): readonly VirtualFile[] {
  const { source, fileName, document, registry } = input;
  const props = findProps(source, document, input.js);

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
function findProps(
  source: string,
  doc: StructuredDocument,
  provided: EmitJs | undefined,
): PropsCall | undefined {
  const js = provided ?? ownBatch(source, doc);
  if (js === undefined) return undefined;
  const { result, neutral: ids } = js;

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

/** The batch the emitter runs when nobody handed it one: the neutral chunks, nothing else. */
function ownBatch(source: string, doc: StructuredDocument): EmitJs | undefined {
  const { neutral } = partitionCode(doc.code);
  if (neutral.length === 0) return undefined;

  const batch = new JsBatch(source);
  const ids = neutral.map((chunk) => batch.add('module-statements', chunk));
  return { result: batch.parse().value, neutral: ids };
}
