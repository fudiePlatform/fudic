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
  type OxcNode,
  type ServerRegion,
  type Span,
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
  /** The `@client` regions, in source order — where the reactive names are read from. */
  readonly client: readonly FragmentId[];
  /** The `@server` / `@client` regions — where the `$` namespace is enforced (§4.4). */
  readonly regions: readonly CodeRegion[];
  /**
   * The AST registered at a source SPAN, rather than at a node.
   *
   * Keyed by span because the projection is the one asking, and what it holds is a value's
   * `expr` and not the node the walk handed over. It is what lets it tell a handler that is a
   * call from one that is a reference — a question no regular expression answers (BUG-23 §2.4).
   */
  ast(at: Span): OxcNode | readonly OxcNode[] | undefined;
}

/** Register every JS fragment of the document and run Oxc once over the lot. */
export function batchDocumentJs(source: string, document: StructuredDocument): DocumentJs {
  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  const bySpan = new Map<string, FragmentId>();
  const neutral: FragmentId[] = [];
  const client: FragmentId[] = [];
  const regions: CodeRegion[] = [];

  const register = (node: Node, at: Span): void => {
    const id = batch.add('expression', at);
    ids.set(node, id);
    bySpan.set(spanKey(at), id);
  };

  walk(documentRoots(document), {
    interpolation(expr) {
      register(expr, expr.expr);
    },
    // The values of attributes, which nobody registered before BUG-23 §2.4 — so the
    // projection could not ask about them, and opened a second batch or gave up. An empty
    // one (`@click="@()"`) registers nothing: the wrapper alone is a syntax error of the
    // server's own making, on a value the author has not finished typing.
    binding(expr) {
      if (expr.expr.end > expr.expr.start) register(expr, expr.expr);
    },
  });

  for (const part of document.code?.parts ?? []) {
    const id = batch.add('module-statements', part.js);
    ids.set(part, id);
    if (part.type === 'neutral-js') {
      neutral.push(id);
      continue;
    }
    if (part.type === 'client-region') client.push(id);
    regions.push({ part, id });
  }

  const parsed = batch.parse();
  return {
    result: parsed.value,
    diagnostics: parsed.diagnostics,
    fragmentId: (node) => ids.get(node),
    neutral,
    client,
    regions,
    ast: (at) => {
      const id = bySpan.get(spanKey(at));
      return id === undefined ? undefined : parsed.value.ast(id);
    },
  };
}

const spanKey = (at: Span): string => `${at.start},${at.end}`;
