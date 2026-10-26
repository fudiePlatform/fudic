/**
 * The entry point: every virtual file of one `.fud` (SDD-23 §3.1, §4.1).
 *
 * It owns the single Oxc invocation the golden rule allows per file — the chunks of `@code`
 * go into one batch, and the result is handed down to the client emitter. Nobody below this
 * function parses JS again.
 *
 * Never throws. A `.fud` with parse diagnostics still yields the best virtual files its
 * partial AST allows (§4.6): a half-written file is the normal state of an editor, and
 * refusing to emit turns off completion exactly when it is needed.
 */

import {
  JsBatch,
  collectTemplateJs,
  documentRoots,
  reactiveNames,
  walk,
  type FragmentId,
  type JsBatchResult,
  type OxcNode,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
import { codeChunks } from './code.js';
import { emitCssVirtuals } from './css.js';
import { emitClientVirtual, type TemplateJs } from './emit-client.js';
import type { FragmentAst } from './template/context.js';
import { pipesOf } from './template/pipes.js';
import { findPropsCall, type PropsCall } from './props.js';
import type { FileRegistry, VirtualFile } from './types.js';

/**
 * A JS batch someone else already ran, offered to the emitter instead of a second one.
 *
 * The language server parses every fragment of the document once — the semantic pass and the
 * `$` rule need the same AST this emitter needs — so handing the result over is what keeps
 * "Oxc is invoked exactly once per file" true in the process that types the most. Absent, the
 * emitter opens its own batch for the chunks of `@code`, which is what the CLI and the tests do.
 */
export interface EmitJs {
  readonly result: JsBatchResult;
  /**
   * Fragment ids of the chunks of `@code`, in source order: where `props<T>()` is looked for
   * and the reactive names are read from (decision 151). The `@code` is browser code, all of
   * it (SDD-60 §4.8).
   */
  readonly code: readonly FragmentId[];
  /**
   * The AST registered at a source span, the ATTRIBUTE VALUES included.
   *
   * It is what lets the projection ask whether the root of a handler is a call, which no
   * amount of text inspection answers. Absent means the caller registered only content, and
   * then a handler is copied as written.
   */
  ast?(at: Span): FragmentAst | undefined;
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
 * Emit the client virtual and one CSS virtual per `<style>`. What the server runs is declared
 * in a `.fudapi` and typed by its own module (SDD-60 §4.7): a `.fud` has no server virtual.
 *
 * Deterministic: the same input yields the same bytes and the same mappings, which is what
 * lets the server cache virtuals by document version.
 */
export function emitVirtualFiles(input: EmitInput): readonly VirtualFile[] {
  const { source, fileName, document, registry } = input;
  const js = input.js ?? ownBatch(source, document);

  return [
    emitClientVirtual(source, fileName, document, registry, findProps(js), templateJs(js, source)),
    ...emitCssVirtuals(source, fileName, document),
  ];
}

/**
 * Locate `props<T>()` in the `@code`, with one Oxc batch for the whole file.
 *
 * A fragment that fails to parse yields no props rather than no virtual file: the syntax
 * error already has its own diagnostic (FUD0170), and the template around it must keep
 * working.
 */
function findProps(js: EmitJs): PropsCall | undefined {
  const { result } = js;
  for (const id of js.code) {
    const found = findPropsCall(statementsOf(result, id), (s, e) => result.mapSpan(s, e));
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * `module-statements` always yields a statement list (SDD-11 §3.2); the single-node half of
 * the union belongs to the fragment kinds this emitter never registers, so branching on it
 * would be dead code, not defensiveness.
 */
function statementsOf(result: JsBatchResult, id: FragmentId): readonly OxcNode[] {
  return result.ast(id) as readonly OxcNode[];
}

/** What the template projection needs out of the batch: the reactives, the ASTs and the pipes. */
function templateJs(js: EmitJs, source: string): TemplateJs {
  const reactives = new Set<string>();
  // The `@code` is browser code, all of it (SDD-60 §4.8): its `signal(...)` are reactive
  // wherever they sit, exactly as the compiler reads them.
  for (const id of js.code) {
    for (const name of reactiveNames(statementsOf(js.result, id))) reactives.add(name);
  }
  if (js.ast === undefined) return { reactives };
  const ast = (at: Span): FragmentAst | undefined => js.ast?.(at);
  return { reactives, ast, pipes: (at) => pipesOf(ast(at), (a, b) => js.result.mapSpan(a, b), source) };
}

/**
 * The batch the emitter runs when nobody handed it one.
 *
 * Two kinds of fragment, and each answers a question the projection cannot answer without it:
 * the chunks of `@code` hold `props<T>()` and the reactive declarations (decision 151), and
 * every Razor expression in an ATTRIBUTE holds the shape of a handler (decisions 96–98). One
 * batch for the lot, which is the golden rule.
 */
function ownBatch(source: string, doc: StructuredDocument): EmitJs {
  const batch = new JsBatch(source);
  const codeIds = codeChunks(doc.code).map((chunk) => batch.add('module-statements', chunk));

  const fragments = new Map<string, FragmentId>();
  walk(documentRoots(doc), {
    // A content `@(…)`: where a pipe is written most (SDD-58 §4.11).
    interpolation(expr) {
      if (expr.expr.end > expr.expr.start) {
        fragments.set(spanKey(expr.expr), batch.add('expression', expr.expr));
      }
    },
    binding(expr) {
      // An empty value (`@click="@()"`) registers nothing: there is no expression to parse,
      // and the wrapper alone would be a syntax error of the projection's own making.
      if (expr.expr.end > expr.expr.start) {
        fragments.set(spanKey(expr.expr), batch.add('expression', expr.expr));
      }
    },
    // The header of a `@foreach`/`@for` — the fourth question the projection cannot answer
    // without an AST: what a loop DECLARES, which is what a `delegate:` may name (SDD-37).
    // A degraded header (`FUD0070`) has an empty span and would make the batch unparseable.
    control(node) {
      if (node.type !== 'foreach' && node.type !== 'for') return;
      const header = node.header.inner;
      if (header.end <= header.start) return;
      fragments.set(
        spanKey(header),
        batch.add(node.type === 'foreach' ? 'for-of-header' : 'for-header', header),
      );
    },
  });

  // Every fragment a `@snippet` body holds (SDD-29 §4.11). A file of snippets declares the
  // names its bodies read as `any` — they belong to whoever expands them — and knowing which
  // names those are needs an AST for each fragment, headers and conditions included. Only the
  // bodies, so a file with no declaration registers exactly what it registered before.
  for (const snippet of doc.snippets) {
    collectTemplateJs(snippet.children, (kind, at) => {
      const key = spanKey(at);
      if (at.end > at.start && !fragments.has(key)) fragments.set(key, batch.add(kind, at));
    });
  }

  const result = batch.parse().value;
  return {
    result,
    code: codeIds,
    ast: (at) => {
      const id = fragments.get(spanKey(at));
      return id === undefined ? undefined : result.ast(id);
    },
  };
}

const spanKey = (at: Span): string => `${at.start},${at.end}`;
