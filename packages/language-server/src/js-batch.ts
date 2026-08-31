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

/**
 * A loop and the JS of its header, parsed.
 *
 * `@foreach (const x of xs)` and `@for (let i = 0; …)` DECLARE names, and those names are in
 * scope for the whole body — the `key (…)` included (decision 91). Nobody was reading them:
 * the header went to Oxc for its syntax and its AST was thrown away, so the only list the
 * editor could build was the file's top-level one, and everything a block introduces was
 * invisible however deeply or shallowly it was nested (BUG-23 §2.9).
 *
 * They ride in the SAME batch as everything else — the kinds `for-of-header` and `for-header`
 * exist for exactly this — so the golden rule holds: Oxc is invoked once per file.
 */
export interface LoopHeader {
  /** The whole construct, from its `@` to its closing `}`. */
  readonly span: Span;
  /** Where the header's JS ends: past it, the names it declares are in scope. */
  readonly headerEnd: number;
  /**
   * Where the whole `( … )` ends, closing delimiter included.
   *
   * It is where a `key (…)` goes (decision 91), and it comes from the balancer rather than from
   * searching the source for a `)`: a search has a «not found» case that no input can reach and
   * that no test can therefore cover.
   */
  readonly headerClose: number;
  /** The `ForOfStatement` / `ForStatement` Oxc built. Absent when it could not build one. */
  readonly statement?: OxcNode;
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
  /** Every `@foreach` / `@for` of the template, with the header Oxc parsed for it. */
  readonly loops: readonly LoopHeader[];
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
  const loops: { span: Span; headerEnd: number; headerClose: number; id: FragmentId }[] = [];

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
    // The two constructs that DECLARE a name. `@while` and `@if` hold a condition, which binds
    // nothing, and `@switch` a discriminant — none of them opens a scope the template can read
    // a new name from, so registering them would buy an AST nobody asks a question of.
    control(node) {
      if (node.type !== 'foreach' && node.type !== 'for') return;
      const header = node.header.inner;
      // An unclosed or missing `( … )` is FUD0070 and has an empty span: `for () {}` would make
      // the whole batch unparseable, and the file being edited is the one that must keep
      // answering. It declares nothing, so there is nothing to lose by leaving it out.
      if (header.end <= header.start) return;

      loops.push({
        span: node.span,
        headerEnd: header.end,
        headerClose: node.header.span.end,
        id: batch.add(node.type === 'foreach' ? 'for-of-header' : 'for-header', header),
      });
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
    loops: loops.map((loop) => {
      // A header the parser read but Oxc could not — `@foreach (const of) {`, mid-keystroke —
      // comes back as the empty list rather than a statement. It declares nothing.
      const root = parsed.value.ast(loop.id);
      return {
        span: loop.span,
        headerEnd: loop.headerEnd,
        headerClose: loop.headerClose,
        ...(Array.isArray(root) ? {} : { statement: root as OxcNode }),
      };
    }),
    ast: (at) => {
      const id = bySpan.get(spanKey(at));
      return id === undefined ? undefined : parsed.value.ast(id);
    },
  };
}

const spanKey = (at: Span): string => `${at.start},${at.end}`;
