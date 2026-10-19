/**
 * The Oxc AST as the extractor reads it: plain ESTree / TS-ESTree objects, read through a few
 * accessors instead of the full generated types, so a node shape nobody expected is a `null`
 * the caller reports, never a crash.
 */

export interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

export function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** A child node, or `null`. */
export function child(node: Node, key: string): Node | null {
  const value = node[key];
  return isNode(value) ? value : null;
}

/** A list of child nodes; anything that is not a node is dropped. */
export function children(node: Node, key: string): Node[] {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

export function str(node: Node, key: string): string | null {
  const value = node[key];
  return typeof value === 'string' ? value : null;
}

/** The name of an `Identifier`, or the value of a string `Literal` (`import { "a" as b }`). */
export function nameOf(node: Node | null): string | null {
  if (node === null) return null;
  if (node.type === 'Identifier') return str(node, 'name');
  if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value'];
  return null;
}

/** Type arguments under either spelling Oxc has used. */
export function typeArgs(node: Node): Node[] {
  const args = child(node, 'typeArguments') ?? child(node, 'typeParameters');
  return args === null ? [] : children(args, 'params');
}

/** The type inside a `TSTypeAnnotation`, or `null`. */
export function annotated(node: Node | null): Node | null {
  if (node === null) return null;
  const ann = child(node, 'typeAnnotation');
  if (ann === null) return null;
  return ann.type === 'TSTypeAnnotation' ? child(ann, 'typeAnnotation') : ann;
}
