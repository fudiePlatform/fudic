/**
 * Erasing the server half of every middleware from the CLIENT bundle (SDD-56 §4.5).
 *
 * A middleware module is imported by both ends: its `.client(…)` half runs in the browser, its
 * `.server(…)` half on the server, and that half may read a token secret, a database, a
 * `node:crypto`. That the half does not RUN in the browser is not enough — it must not be THERE.
 * This is a security rule before it is a size rule, so it errs on the side of erasing.
 *
 * **Every `.server(x)` of a module that imports from `@fudic/http`, whatever its receiver.**
 * Recognising only `middleware()…server(…)` would let through a base kept in a `const` and
 * continued later, or a builder reached through a namespace import. Any module that builds a
 * middleware imports `middleware` from `@fudic/http`, so that import is the mark; a `.server`
 * method of something else in the same module is the price, and it is a module about
 * middlewares.
 *
 * **The ARGUMENT is replaced, never the call**, exactly as `serverValidator`'s: `.server(fn)`
 * becomes `.server(undefined)`, the builder keeps its client half and has no server half, and
 * the imports that only `fn` used go with it (BUG-47 §4.1).
 */

import { JsBatch, type OxcNode } from '@fudic/compiler';
import { applyReplacements, orphanImports, type Span } from './orphan-imports.js';

const HTTP = '@fudic/http';
const NOTHING = 'undefined';

type Edit = Span;

/** A module after an erasure: its new code and the source spans that were erased. */
export interface ErasedModule {
  readonly code: string;
  readonly erased: readonly Span[];
}

/** Whether the module imports anything from `@fudic/http`, in any form. */
function importsHttp(statements: readonly OxcNode[]): boolean {
  return statements.some(
    (s) =>
      s.type === 'ImportDeclaration' && (s['source'] as { value?: unknown } | undefined)?.value === HTTP,
  );
}

/** Every `<anything>.server(arg)` in the tree, as the span of its single argument. */
function collect(node: unknown, out: Edit[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const current = node as OxcNode;
  if (current.type === 'CallExpression') {
    const callee = current['callee'] as OxcNode | undefined;
    const property = callee?.type === 'MemberExpression' ? (callee['property'] as OxcNode) : undefined;
    const args = current['arguments'] as OxcNode[];
    if (property?.type === 'Identifier' && property['name'] === 'server' && args.length === 1) {
      out.push({ start: args[0]!.start, end: args[0]!.end });
    }
  }
  for (const value of Object.values(current)) collect(value, out);
}

/**
 * The module with the argument of every `.server(…)` replaced, or `null` when there is nothing
 * to do. The text check first, so a project without middlewares pays no parse.
 *
 * `insideHttp` is for a module OF `@fudic/http`: its own middlewares (`csrf`) import
 * `middleware` by a relative path, so the import mark is not there, and their server halves
 * would ship with every app that puts them in a chain (BUG-47 §4.6).
 */
export function eraseServerHalves(code: string, insideHttp = false): ErasedModule | null {
  if (!code.includes('.server') || (!insideHttp && !code.includes(HTTP))) return null;

  const batch = new JsBatch(code);
  const id = batch.add('module-statements', { start: 0, end: code.length });
  const parsed = batch.parse();
  const statements = parsed.value.ast(id) as OxcNode[];
  if (!Array.isArray(statements) || (!insideHttp && !importsHttp(statements))) return null;

  const edits: Edit[] = [];
  collect(statements, edits);
  if (edits.length === 0) return null;
  const map = parsed.value.mapOffset;
  // Outermost first, and an edit nested inside an erased argument is dropped: it goes with it.
  const spans = edits
    .map((e) => ({ start: map(e.start), end: map(e.end) }))
    .sort((a, b) => a.start - b.start)
    .filter((span, i, all) => !all.slice(0, i).some((outer) => outer.end >= span.end));
  const replacements = [
    ...spans.map((span) => ({ ...span, text: NOTHING })),
    ...orphanImports(code, statements, spans, map),
  ];
  return { code: applyReplacements(code, replacements), erased: spans };
}
