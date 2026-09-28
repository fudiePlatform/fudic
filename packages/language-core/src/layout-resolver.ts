/**
 * The route's `export function layout(ctx, data)`, located in its `@server` region so the
 * projection can give it the types its author never wrote (SDD-40 §4.7, BUG-44).
 *
 * The RETURN type is about where the error lands. The fact — «this route does not resolve a
 * prop its layout requires» — is TypeScript's to report, and one fact has one voice (SDD-36
 * §3.1). But a check written as a synthetic assignment reports on the synthetic assignment,
 * which maps to nothing the author can see; that is the exact failure `contract.ts` describes
 * for props. So the projection annotates the USER's own function:
 *
 *     export function layout(ctx: $LayoutContext<'slug'>, data: $LayoutData): $LayoutProps | … {
 *                               ^^^^^^^^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^
 *                                                         scaffolding
 *
 * and TypeScript puts `TS2739` on the author's `{ … }`, naming the prop that is missing. The
 * PARAMETER types are about what the author can write at all: a `ctx` left untyped is `any`,
 * and `any` autocompletes nothing — which is how a route ended up writing `ctx: unknown`.
 *
 * Whatever the author typed is left exactly as written: an annotation is the author's
 * statement about their own function, and a projection that overrode it would be arguing with
 * the file instead of checking it.
 */

import type { OxcNode, Span } from '@fudic/compiler';
import { child, nodeList } from './oxc-node.js';

/** The third reserved export of a route's `@server` (SDD-40 §3.2). */
const LAYOUT_EXPORT = 'layout';

/** The export whose result `layout` receives as `data` (SDD-40 §4.2). */
const LOAD_EXPORT = 'load';

/** Where the projection injects a type, in original-source coordinates. */
export interface LayoutResolver {
  /** Just past the `)` of the parameter list — where `: T` goes. Absent when already typed. */
  readonly annotateAt?: number;
  /**
   * Whether the resolver is `async`, which decides the return type it is given.
   *
   * Not `P | Promise<P>` for both: that union is the contextual type of the author's
   * `return { … }`, and completion lists the members of every object in it — `then`, `catch`
   * and `finally` beside the layout's props. An `async` function's `return` is checked
   * against the awaited type, so it gets `Promise<P>`; any other gets `P`, and one that wants
   * to hand back a promise says so the way TypeScript expects, with `async`.
   */
  readonly async: boolean;
  /** Just past the first parameter — where its type goes. Absent when already typed. */
  readonly ctxAt?: number;
  /** Just past the second parameter — where its type goes. Absent when already typed. */
  readonly dataAt?: number;
}

/** Map a pair of Oxc buffer offsets back to original-source coordinates (SDD-11 §4.4). */
export type MapSpan = (bufferStart: number, bufferEnd: number) => Span;

/**
 * Locate the exported `layout` of a `@server` region's top-level statements.
 *
 * Top level and exported, because that is what the wrapper imports: a `layout` nested in a
 * function is somebody's helper, and annotating it would put an error on code that resolves
 * nothing.
 */
export function findLayoutResolver(
  source: string,
  statements: readonly OxcNode[],
  mapSpan: MapSpan,
): LayoutResolver | undefined {
  const fn = findExportedFunction(statements, LAYOUT_EXPORT);
  return fn === undefined ? undefined : annotationPoints(source, fn, mapSpan);
}

/** Whether a `@server` region exports `load` — what decides the type `data` can be given. */
export function exportsLoad(statements: readonly OxcNode[]): boolean {
  return findExportedFunction(statements, LOAD_EXPORT) !== undefined;
}

/**
 * The function exported under `name`. Both declaration shapes count — the function statement
 * and the arrow — since both are how people write it.
 */
function findExportedFunction(statements: readonly OxcNode[], name: string): OxcNode | undefined {
  for (const statement of statements) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = child(statement, 'declaration');
    if (declaration === undefined) continue;

    if (declaration.type === 'FunctionDeclaration') {
      if (child(declaration, 'id')?.['name'] === name) return declaration;
      continue;
    }
    if (declaration.type !== 'VariableDeclaration') continue;
    for (const declarator of nodeList(declaration, 'declarations')) {
      if (child(declarator, 'id')?.['name'] !== name) continue;
      const init = child(declarator, 'init');
      return init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression'
        ? init
        : undefined;
    }
  }
  return undefined;
}

/**
 * Where each missing annotation goes.
 *
 * The return type goes just past the `)` that closes the parameters. One rule for both
 * shapes, and it has to be that one: a function declaration would take the annotation
 * anywhere before its `{`, but an arrow's `=>` sits in between, so «before the body» would
 * write `(ctx, data) => : T ({…})`. Past the `)` is also where a person writes it. The `)` is
 * found by scanning FROM the last parameter's end, which is an AST offset — so the window is
 * the closing delimiter and the whitespace around it, and the first `)` in it is the one.
 */
function annotationPoints(
  source: string,
  fn: OxcNode,
  mapSpan: MapSpan,
): LayoutResolver | undefined {
  const params = nodeList(fn, 'params');
  const last = params[params.length - 1];
  // `layout()` with no parameters: a resolver that takes neither the context nor the data is
  // not one the author has finished writing, and there is nothing to check its return against
  // that they would recognise.
  if (last === undefined) return undefined;

  const end = (node: OxcNode): number => mapSpan(node.end, node.end).start;
  // The `)` is there: Oxc gave back a function, so its parameter list closed. Guarding for an
  // absence the input cannot produce would be a branch no test could ever reach.
  const returnAt =
    child(fn, 'returnType') === undefined ? source.indexOf(')', end(last)) + 1 : undefined;
  const ctxAt = untypedEnd(params[0], end);
  const dataAt = untypedEnd(params[1], end);

  return {
    async: fn['async'] === true,
    ...(returnAt === undefined ? {} : { annotateAt: returnAt }),
    ...(ctxAt === undefined ? {} : { ctxAt }),
    ...(dataAt === undefined ? {} : { dataAt }),
  };
}

/** The shapes a type can simply be appended to: `ctx`, `{ params }`, `[a, b]`. */
const TYPEABLE = new Set(['Identifier', 'ObjectPattern', 'ArrayPattern']);

/**
 * The end of a parameter the author left untyped, where `: T` can be appended.
 *
 * A default (`ctx = x`) or a rest (`...args`) is left alone: the type goes somewhere else in
 * each, and a parameter written that way is not the context the runtime hands over anyway.
 */
function untypedEnd(
  param: OxcNode | undefined,
  end: (node: OxcNode) => number,
): number | undefined {
  if (param === undefined || !TYPEABLE.has(param.type)) return undefined;
  if (child(param, 'typeAnnotation') !== undefined || param['optional'] === true) return undefined;
  return end(param);
}
