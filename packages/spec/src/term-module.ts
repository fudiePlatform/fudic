/**
 * A term module read, never run. `<root>/<block>/<term>.js` is the code that executes a line
 * of a `.fudspec`; the validator only needs its `meta`, and takes it off the syntax tree. That
 * fixes the contract: `meta` is an object literal whose `name`, `block` and `params` are
 * literals, and `run` (plus `selfTest` in the workspace) are exported by declaration.
 */

import {
  emptySpan,
  span,
  FUD0941,
  FUD0942,
  FUD0943,
  FUD0944,
  FUD0945,
  FUD0946,
  FUD0954,
  type SourceDiagnostic,
  type Span,
} from '@fudic/diagnostics';
import type { ArrayExpressionElement, ObjectExpression } from 'oxc-parser';
import type { BlockKind } from './ast.js';
import { exportedBindings, field, objectLiteral, parseModule, stringField } from './static.js';

/** Where a term comes from: the workspace's own `fudic/terms/`, or the framework's. */
export type Layer = 'workspace' | 'framework';

/** The closed list of parameter types. The type decides which argument forms a line accepts. */
export type ParamType = 'element' | 'number' | 'string' | 'token';

const PARAM_TYPES: ReadonlySet<string> = new Set<ParamType>(['element', 'number', 'string', 'token']);

function isParamType(type: string): type is ParamType {
  return PARAM_TYPES.has(type);
}

export interface TermParam {
  readonly name: string;
  readonly type: ParamType;
}

export interface TermModule {
  readonly layer: Layer;
  /** Absolute. */
  readonly path: string;
  /** The folder it is in. */
  readonly block: BlockKind;
  /** The file name without `.js`: the term. */
  readonly name: string;
  /** The parameters that could be read; empty when `meta` is broken. */
  readonly params: readonly TermParam[];
  /** The source text of `meta.describe`, never run. */
  readonly describe?: string;
  /** Problems of the module itself, located in the module. */
  readonly diagnostics: readonly SourceDiagnostic[];
}

/** The term a path names: its file name without `.js`. */
function termName(path: string): string {
  return path.slice(path.search(/[^\\/]*$/u)).replace(/\.js$/u, '');
}

/** A module the file system lists but cannot read. */
export function unreadableTermModule(path: string, layer: Layer, block: BlockKind): TermModule {
  const unreadable = FUD0941({ span: emptySpan(0), file: path, detail: 'the file cannot be read' });
  return { layer, path, block, name: termName(path), params: [], diagnostics: [unreadable] };
}

/** Reads a term module's `meta` and exports. Never throws and never runs the module. */
export function readTermModule(source: string, path: string, layer: Layer, block: BlockKind): TermModule {
  const name = termName(path);
  const base = { layer, path, block, name };
  const at = (where: Span) => ({ span: where, file: path });

  const parsed = parseModule(path, source, 'js');
  const syntax = parsed.errors[0];
  if (syntax !== undefined) {
    return { ...base, params: [], diagnostics: [FUD0941({ ...at(emptySpan(0)), detail: syntax.message })] };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const exports = exportedBindings(parsed.program);
  const metaBinding = exports.get('meta');
  const meta = metaBinding?.init === undefined ? undefined : objectLiteral(metaBinding.init);

  let params: readonly TermParam[] = [];
  let describe: string | undefined;
  if (meta === undefined) {
    const where = metaBinding === undefined ? emptySpan(0) : span(metaBinding.start, metaBinding.end);
    diagnostics.push(FUD0941({ ...at(where), detail: 'there is no `export const meta = { … }`' }));
  } else {
    const metaSpan = span(meta.start, meta.end);
    checkIdentity(meta, metaSpan, name, block, at, diagnostics);
    params = readParams(meta, metaSpan, at, diagnostics);
    const describeNode = field(meta, 'describe');
    if (describeNode !== undefined) describe = source.slice(describeNode.start, describeNode.end);
  }

  if (!exports.has('run')) diagnostics.push(FUD0945(at(emptySpan(0))));
  if (layer === 'workspace' && !exports.has('selfTest')) diagnostics.push(FUD0946(at(emptySpan(0))));

  return { ...base, params, ...(describe !== undefined ? { describe } : {}), diagnostics };
}

type At = (where: Span) => { readonly span: Span; readonly file: string };

/** `meta.name` and `meta.block` against the file name and the folder. */
function checkIdentity(
  meta: ObjectExpression,
  metaSpan: Span,
  term: string,
  folder: BlockKind,
  at: At,
  out: SourceDiagnostic[],
): void {
  const name = stringField(meta, 'name');
  if (name === undefined) {
    out.push(FUD0941({ ...at(metaSpan), detail: '`meta.name` is not a string literal' }));
  } else if (name.value !== term) {
    out.push(FUD0942({ ...at(span(name.start, name.end)), name: name.value, term }));
  }

  const block = stringField(meta, 'block');
  if (block === undefined) {
    out.push(FUD0941({ ...at(metaSpan), detail: '`meta.block` is not a string literal' }));
  } else if (block.value !== folder) {
    out.push(FUD0943({ ...at(span(block.start, block.end)), block: block.value, folder }));
  }
}

/** `meta.params`: an array literal of `{ name, type }` literals, with unique names. */
function readParams(meta: ObjectExpression, metaSpan: Span, at: At, out: SourceDiagnostic[]): readonly TermParam[] {
  const list = field(meta, 'params');
  if (list === undefined || list.type !== 'ArrayExpression') {
    out.push(FUD0941({ ...at(metaSpan), detail: '`meta.params` is not an array literal' }));
    return [];
  }
  const listSpan = span(list.start, list.end);
  const params: TermParam[] = [];
  for (const element of list.elements) {
    const param = readParam(element, listSpan, at, out);
    if (param === undefined) continue;
    if (params.some((p) => p.name === param.name.value)) {
      out.push(FUD0954({ ...at(span(param.name.start, param.name.end)), name: param.name.value }));
      continue;
    }
    params.push({ name: param.name.value, type: param.type });
  }
  return params;
}

/** One `{ name, type }`; undefined (with its diagnostic) when it cannot be used. */
function readParam(
  element: ArrayExpressionElement,
  listSpan: Span,
  at: At,
  out: SourceDiagnostic[],
): { readonly name: { readonly value: string; readonly start: number; readonly end: number }; readonly type: ParamType } | undefined {
  // A hole (`[a, , b]`) and a spread have no object to read.
  const object = element === null || element.type === 'SpreadElement' ? undefined : objectLiteral(element);
  if (object === undefined) {
    const where = element === null ? listSpan : span(element.start, element.end);
    out.push(FUD0941({ ...at(where), detail: 'a parameter is not an object literal' }));
    return undefined;
  }
  const name = stringField(object, 'name');
  const type = stringField(object, 'type');
  if (name === undefined || type === undefined) {
    const detail = "a parameter's `name` and `type` are not both string literals";
    out.push(FUD0941({ ...at(span(object.start, object.end)), detail }));
    return undefined;
  }
  if (!isParamType(type.value)) {
    out.push(FUD0944({ ...at(span(type.start, type.end)), type: type.value }));
    return undefined;
  }
  return { name, type: type.value };
}
