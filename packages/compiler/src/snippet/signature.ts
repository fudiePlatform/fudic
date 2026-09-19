/**
 * What a `@snippet` signature declares (SDD-29 §4.1), read off the Oxc AST.
 *
 * The signature is a TypeScript PARAMETER LIST and nothing else — no `function`, no `return`,
 * no return type — so it is not scanned by hand: everything TypeScript allows in that
 * position is allowed here (annotations, unions, `?`, defaults, destructuring), and the only
 * reader that knows all of it is the parser that owns the language. A `function` written
 * inside the list therefore needs no rule of ours: Oxc reports it, at its own span, mapped
 * back to the `.fud` by the batch (criterion 8).
 *
 * The batch is INJECTED and never opened here: the golden rule is one Oxc invocation per
 * file, and a file's signatures share it with its bodies.
 */

import type { Span } from '../types/index.js';
import { type FragmentId, type JsBatch, type JsBatchResult, type OxcNode, patternNames } from '../oxc/index.js';
import type { SnippetDeclNode } from './nodes.js';

/** One parameter of a snippet, as a call has to satisfy it. */
export interface SnippetParam {
  /** The whole parameter, default and annotation included. */
  readonly span: Span;
  /** The parameter name, or `''` when the parameter is a destructuring pattern. */
  readonly name: string;
  readonly nameSpan: Span;
  /**
   * The binding, TYPE ANNOTATION EXCLUDED. For `title: string` it is `title`; for
   * `{ title }: Card` it is `{ title }`.
   *
   * The annotation is cut because what the expansion writes is JavaScript: a pattern copied
   * with its annotation into the emitted module would be a syntax error in the output of a
   * compiler whose input was valid.
   */
  readonly pattern: Span;
  /** Every name this parameter binds: one for an identifier, several for a pattern. */
  readonly declares: readonly string[];
  /** The type, `:` excluded. Absent when the author wrote none. */
  readonly typeAnnotation?: Span;
  /** The expression after `=`. Absent when there is none. */
  readonly defaultValue?: Span;
  /** Declared with `?`. */
  readonly optional: boolean;
  /** Neither optional nor defaulted: a call that does not cover it is `FUD0828`. */
  readonly required: boolean;
}

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

function field(node: OxcNode, key: string): unknown {
  return node[key];
}

/**
 * A field Oxc always fills with a node: the two halves of an `AssignmentPattern`, the type of
 * a `TSTypeAnnotation`. Unguarded on purpose, the way `field` is: a check here would be a
 * branch no input can take, and a branch no input can take is a lie about the code.
 */
const asNode = (value: unknown): OxcNode => value as OxcNode;

/**
 * Register a declaration's signature in the batch. The id comes back so the caller can read
 * the parameters after the single parse, which is the only order the golden rule allows.
 */
export function registerSignature(batch: JsBatch, decl: SnippetDeclNode): FragmentId {
  return batch.add('params', decl.signature);
}

/**
 * The parameters of a registered signature, in source coordinates.
 *
 * An empty list is the honest answer to an empty signature AND to one Oxc could not parse:
 * the diagnostic for the second case is already travelling from the batch, and inventing
 * parameters for a list nobody could read would turn one error into a cascade of arity ones.
 */
export function readParams(result: JsBatchResult, id: FragmentId): readonly SnippetParam[] {
  const root = result.ast(id);
  // Two ways of being handed something that is not a signature, and neither may throw: an id
  // the batch does not know answers a list, and an id registered under another KIND answers a
  // node with no parameters in it. Both are the empty signature.
  if (!isNode(root)) return [];
  const params = field(root, 'params');
  if (!Array.isArray(params)) return [];
  return params.map((raw) => readParam(result, asNode(raw)));
}

function readParam(result: JsBatchResult, param: OxcNode): SnippetParam {
  // `x = 1` is an AssignmentPattern wrapping the binding; everything else IS the binding.
  const assignment = param.type === 'AssignmentPattern';
  const bound = assignment ? asNode(field(param, 'left')) : param;
  const defaultNode = assignment ? asNode(field(param, 'right')) : undefined;

  const annotation = field(bound, 'typeAnnotation');
  const typed = isNode(annotation);
  // A `TSTypeAnnotation` covers the `:` too; what is useful is the type it holds.
  const type = typed ? asNode(field(annotation, 'typeAnnotation')) : undefined;
  // The binding, annotation cut: everything up to where the annotation begins.
  const patternEnd = typed ? annotation.start : bound.end;

  const named = bound.type === 'Identifier';
  const name = named ? String(field(bound, 'name')) : '';
  // An annotated `Identifier` ENDS past its annotation, so the name's own span is measured
  // from its length: `title : string` must not hand the editor `title ` to hover over.
  const nameSpan = named
    ? result.mapSpan(bound.start, bound.start + name.length)
    : result.mapSpan(bound.start, bound.end);
  const optional = field(bound, 'optional') === true;

  return {
    span: result.mapSpan(param.start, param.end),
    name,
    nameSpan,
    pattern: result.mapSpan(bound.start, patternEnd),
    declares: named ? [name] : patternNames(bound),
    ...(type !== undefined ? { typeAnnotation: result.mapSpan(type.start, type.end) } : {}),
    ...(defaultNode !== undefined
      ? { defaultValue: result.mapSpan(defaultNode.start, defaultNode.end) }
      : {}),
    optional,
    required: !optional && defaultNode === undefined,
  };
}
