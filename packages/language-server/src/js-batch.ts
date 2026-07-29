/**
 * The single Oxc invocation of a document (SDD-24 §4.5, and the golden rule of the repo).
 *
 * Every JS fragment of a `.fud` — the interpolations of the template and the three kinds of
 * `@code` region — is registered into ONE `JsBatch`, parsed once, and handed to everyone who
 * needs a JS AST: the semantic pass of SDD-12, the `$` rule of §4.4, and the virtual emitter
 * of SDD-23, which takes the batch instead of opening its own.
 *
 * Two batches per keystroke is not a slower version of the same thing: it is the rule the
 * whole Oxc bridge was designed around being broken by the one process that types the most.
 */

import {
  JsBatch,
  documentRoots,
  walk,
  type ClientRegion,
  type Diagnostic,
  type FragmentId,
  type JsBatchResult,
  type Node,
  type ServerRegion,
  type StructuredDocument,
} from '@fudic/compiler';

/** A `@server` or `@client` region with the fragment it was registered as. */
export interface CodeRegion {
  readonly part: ServerRegion | ClientRegion;
  readonly id: FragmentId;
}

/** The JS of one document, parsed exactly once. */
export interface DocumentJs {
  readonly result: JsBatchResult;
  /** Syntax errors (FUD0170), already mapped back onto the `.fud`. */
  readonly diagnostics: readonly Diagnostic[];
  /** The fragment a JS-bearing node was registered as, or `undefined` when it has none. */
  fragmentId(node: Node): FragmentId | undefined;
  /** The neutral chunks of `@code`, in source order — where `props<T>()` is looked for. */
  readonly neutral: readonly FragmentId[];
  /** The `@server` / `@client` regions — where the `$` namespace is enforced (§4.4). */
  readonly regions: readonly CodeRegion[];
}

/** Register every JS fragment of the document and run Oxc once over the lot. */
export function batchDocumentJs(source: string, document: StructuredDocument): DocumentJs {
  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  const neutral: FragmentId[] = [];
  const regions: CodeRegion[] = [];

  walk(documentRoots(document), {
    interpolation(expr) {
      ids.set(expr, batch.add('expression', expr.expr));
    },
  });

  for (const part of document.code?.parts ?? []) {
    const id = batch.add('module-statements', part.js);
    ids.set(part, id);
    if (part.type === 'neutral-js') {
      neutral.push(id);
    } else {
      regions.push({ part, id });
    }
  }

  const parsed = batch.parse();
  return {
    result: parsed.value,
    diagnostics: parsed.diagnostics,
    fragmentId: (node) => ids.get(node),
    neutral,
    regions,
  };
}
