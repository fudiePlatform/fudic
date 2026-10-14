/**
 * Taking out the imports that only erased code used (BUG-47 §4.1).
 *
 * Erasing the argument of a `.server(…)` or a `serverValidator(…)` leaves its imports behind,
 * and Rollup only drops an unused import when the imported module has no top-level effects. A
 * server module almost always has one — a `Service(Tokens)`, a client that connects on import,
 * a `dotenv.config()` — so it would ship whole. The erasers therefore remove those imports
 * themselves, and the module is never reached from the client graph through them.
 *
 * **Only what the erased code used.** A specifier goes when its local name is referenced inside
 * an erased span and nowhere else. One that was already unused before the erasure is the
 * author's, and stays. A declaration left without specifiers goes whole; `import './x'` never
 * had any and is an effect the author asked for.
 *
 * Over-counting a reference is the safe side: any identifier with the same name outside the
 * erased spans — a property key, a type — keeps the import.
 */

import { type OxcNode } from '@fudic/compiler';

/** A range of the module's source, `[start, end)`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A range of the module's source and what replaces it. */
export interface Replacement extends Span {
  readonly text: string;
}

/** From a buffer offset, as Oxc reports it, to a source offset. */
export type MapOffset = (offset: number) => number;

/** The local names an import declaration binds, with each specifier. */
function specifiersOf(declaration: OxcNode): readonly OxcNode[] {
  return declaration['specifiers'] as OxcNode[];
}

function localName(specifier: OxcNode): string {
  return String((specifier['local'] as { name?: unknown }).name);
}

/** Every identifier of the tree whose name is one of `names`, as its source span. */
function references(node: unknown, names: ReadonlySet<string>, map: MapOffset, out: Map<string, Span[]>): void {
  if (Array.isArray(node)) {
    for (const child of node) references(child, names, map, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const current = node as OxcNode;
  if (current.type === 'Identifier' && names.has(String(current['name']))) {
    const name = String(current['name']);
    out.set(name, [...(out.get(name) ?? []), { start: map(current.start), end: map(current.end) }]);
  }
  for (const value of Object.values(current)) references(value, names, map, out);
}

function inside(span: Span, erased: readonly Span[]): boolean {
  return erased.some((outer) => outer.start <= span.start && span.end <= outer.end);
}

/** The declaration rewritten with only `kept`, its source and attributes untouched. */
function rebuild(code: string, declaration: OxcNode, kept: readonly OxcNode[], map: MapOffset): string {
  const text = (s: OxcNode): string => code.slice(map(s.start), map(s.end));
  const named = kept.filter((s) => s.type === 'ImportSpecifier').map(text);
  const parts = [
    ...kept.filter((s) => s.type !== 'ImportSpecifier').map(text),
    ...(named.length > 0 ? [`{ ${named.join(', ')} }`] : []),
  ];
  const source = declaration['source'] as OxcNode;
  return `import ${parts.join(', ')} from ${code.slice(map(source.start), map(declaration.end))}`;
}

/**
 * The replacements that take out of `code` every import specifier the `erased` spans were the
 * only users of. `statements` is the module's AST as the eraser parsed it: no second parse.
 */
export function orphanImports(
  code: string,
  statements: readonly OxcNode[],
  erased: readonly Span[],
  map: MapOffset,
): Replacement[] {
  const declarations = statements.filter((s) => s.type === 'ImportDeclaration' && specifiersOf(s).length > 0);
  const names = new Set(declarations.flatMap((d) => specifiersOf(d).map(localName)));
  const found = new Map<string, Span[]>();
  references(
    statements.filter((s) => s.type !== 'ImportDeclaration'),
    names,
    map,
    found,
  );
  const orphan = (specifier: OxcNode): boolean => {
    const uses = found.get(localName(specifier)) ?? [];
    return uses.some((u) => inside(u, erased)) && uses.every((u) => inside(u, erased));
  };

  const out: Replacement[] = [];
  for (const declaration of declarations) {
    const specifiers = specifiersOf(declaration);
    const kept = specifiers.filter((s) => !orphan(s));
    if (kept.length === specifiers.length) continue;
    const span = { start: map(declaration.start), end: map(declaration.end) };
    out.push({ ...span, text: kept.length === 0 ? '' : rebuild(code, declaration, kept, map) });
  }
  return out;
}

/** `code` with every replacement applied. They must not overlap. */
export function applyReplacements(code: string, replacements: readonly Replacement[]): string {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce((out, r) => out.slice(0, r.start) + r.text + out.slice(r.end), code);
}
