/**
 * The route's `export function layout(ctx, data)`, located in its `@server` region so the
 * projection can give it a RETURN TYPE it never wrote (SDD-40 §4.7).
 *
 * The point is where the error lands. The fact — «this route does not resolve a prop its
 * layout requires» — is TypeScript's to report, and one fact has one voice (SDD-36 §3.1). But
 * a check written as a synthetic assignment reports on the synthetic assignment, which maps
 * to nothing the author can see; that is the exact failure `contract.ts` describes for props.
 * So the projection annotates the USER's own function:
 *
 *     export function layout(ctx, data): $LayoutProps | Promise<$LayoutProps> { return { … }; }
 *                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ scaffolding
 *
 * and TypeScript puts `TS2739` on the author's `{ … }`, naming the prop that is missing.
 *
 * A resolver that already carries a return type is left exactly as written: the annotation is
 * the author's statement about their own function, and a projection that overrode it would be
 * arguing with the file instead of checking it.
 */

import type { OxcNode, Span } from '@fudic/compiler';
import { child, nodeList } from './oxc-node.js';

/** The third reserved export of a route's `@server` (SDD-40 §3.2). */
const LAYOUT_EXPORT = 'layout';

/** Where the projection injects a return type, in original-source coordinates. */
export interface LayoutResolver {
  /** Just past the `)` of the parameter list — where `: T` goes. */
  readonly annotateAt: number;
}

/** Map a pair of Oxc buffer offsets back to original-source coordinates (SDD-11 §4.4). */
export type MapSpan = (bufferStart: number, bufferEnd: number) => Span;

/**
 * Locate the exported `layout` of a `@server` region's top-level statements.
 *
 * Top level and exported, because that is what the wrapper imports: a `layout` nested in a
 * function is somebody's helper, and annotating it would put an error on code that resolves
 * nothing. Both declaration shapes count — the function statement and the arrow — since both
 * are how people write it.
 */
export function findLayoutResolver(
  source: string,
  statements: readonly OxcNode[],
  mapSpan: MapSpan,
): LayoutResolver | undefined {
  for (const statement of statements) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = child(statement, 'declaration');
    if (declaration === undefined) continue;

    if (declaration.type === 'FunctionDeclaration') {
      if (child(declaration, 'id')?.['name'] !== LAYOUT_EXPORT) continue;
      return annotationPoint(source, declaration, mapSpan);
    }
    if (declaration.type !== 'VariableDeclaration') continue;
    for (const declarator of nodeList(declaration, 'declarations')) {
      if (child(declarator, 'id')?.['name'] !== LAYOUT_EXPORT) continue;
      const init = child(declarator, 'init');
      if (init === undefined) return undefined;
      if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') {
        return undefined;
      }
      return annotationPoint(source, init, mapSpan);
    }
  }
  return undefined;
}

/**
 * Where a function's return type goes: just past the `)` that closes its parameters.
 *
 * One rule for both shapes, and it has to be that one: a function declaration would take the
 * annotation anywhere before its `{`, but an arrow's `=>` sits in between, so «before the
 * body» would write `(ctx, data) => : T ({…})`. Past the `)` is also where a person writes it.
 *
 * The `)` is found by scanning FROM the last parameter's end, which is an AST offset — so the
 * window is the closing delimiter and the whitespace around it, and the first `)` in it is the
 * one. A resolver that already declares a return type is left exactly as written.
 */
function annotationPoint(
  source: string,
  fn: OxcNode,
  mapSpan: MapSpan,
): LayoutResolver | undefined {
  if (child(fn, 'returnType') !== undefined) return undefined;
  const params = nodeList(fn, 'params');
  const last = params[params.length - 1];
  // `layout()` with no parameters: a resolver that takes neither the context nor the data is
  // not one the author has finished writing, and there is nothing to check its return against
  // that they would recognise.
  if (last === undefined) return undefined;
  // The `)` is there: Oxc gave back a function, so its parameter list closed. Guarding for an
  // absence the input cannot produce would be a branch no test could ever reach.
  const from = mapSpan(last.end, last.end).start;
  return { annotateAt: source.indexOf(')', from) + 1 };
}
