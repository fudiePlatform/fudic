/**
 * What the validator knows about types: the primitives, whether a literal is a value of a type,
 * and the walk that checks every name a type uses exists (SDD §3.2).
 */

import { FUD1080, FUD1089, type SourceDiagnostic } from '@fudic/diagnostics';
import type { Literal, TypeExpr } from './ast.js';
import { typeText, type ApiIndex } from './index-api.js';

export const INTEGERS: Readonly<Record<string, readonly [number, number]>> = {
  u8: [0, 255],
  i8: [-128, 127],
  u16: [0, 65_535],
  i16: [-32_768, 32_767],
  u32: [0, 4_294_967_295],
  i32: [-2_147_483_648, 2_147_483_647],
};
export const FLOATS: ReadonlySet<string> = new Set(['f32', 'f64']);
export const WIDTHS: readonly string[] = [...Object.keys(INTEGERS), ...FLOATS];
export const PRIMITIVES: ReadonlySet<string> = new Set(['str', 'bool', 'date', 'uuid', ...WIDTHS]);
const MAP_KEYS: ReadonlySet<string> = new Set(['str', 'uuid', ...Object.keys(INTEGERS)]);

/** Whether `name` is a number type. */
export const isNumeric = (name: string): boolean => name in INTEGERS || FLOATS.has(name);

/** The names a type may use besides the primitives and the project's types, by where it is. */
export interface TypeScope {
  /** `*`: only in the `on field` of a rule. */
  readonly any?: boolean;
  /** `pattern`: only as the type of a rule parameter. */
  readonly pattern?: boolean;
}

/** Reports every name `type` uses that is not a type here (`FUD1080`) and every bad map key (`FUD1089`). */
export function checkType(type: TypeExpr, index: ApiIndex, scope: TypeScope, out: SourceDiagnostic[]): void {
  switch (type.kind) {
    case 'list':
      return checkType(type.element, index, scope, out);
    case 'optional':
      return checkType(type.inner, index, scope, out);
    case 'map': {
      const key = type.key;
      const known = key.kind !== 'named' || PRIMITIVES.has(key.name.text) || index.lookup('type', key.name.text) !== undefined;
      if (!known) checkType(key, index, scope, out);
      else if (!(key.kind === 'named' && MAP_KEYS.has(key.name.text))) out.push(FUD1089({ span: key.span, key: typeText(key) }));
      return checkType(type.value, index, scope, out);
    }
    case 'named': {
      const name = type.name.text;
      if (PRIMITIVES.has(name) || index.lookup('type', name) !== undefined) return;
      if ((name === '*' && scope.any === true) || (name === 'pattern' && scope.pattern === true)) return;
      const candidates = name === 'number' ? WIDTHS : index.candidates('type', name);
      out.push(FUD1080({ span: type.name.span, name, what: 'type', candidates }));
    }
  }
}

/** Whether a number fits a width: an integer in its range, or any number for a float. */
export function fitsWidth(value: number, width: string): boolean {
  const range = INTEGERS[width];
  return range === undefined ? Number.isFinite(value) : Number.isInteger(value) && value >= range[0] && value <= range[1];
}

/**
 * Whether a literal is a value of `type`. Text takes a string or a bare word (`/entrar`); a
 * number its width; an `enum` one of its members; a list `[]` or a single value of its element;
 * `pattern` the name of a project pattern.
 */
export function literalFits(lit: Literal, type: TypeExpr, index: ApiIndex): boolean {
  if (type.kind === 'optional') return literalFits(lit, type.inner, index);
  if (type.kind === 'list') return lit.kind === 'empty-list' || literalFits(lit, type.element, index);
  if (type.kind === 'map') return false;
  const name = type.name.text;
  if (name === 'str' || name === 'date' || name === 'uuid') return lit.kind === 'string' || lit.kind === 'word';
  if (name === 'bool') return lit.kind === 'bool';
  if (isNumeric(name)) return lit.kind === 'number' && fitsWidth(lit.value, name);
  if (name === 'pattern') return lit.kind === 'word' && index.lookup('pattern', lit.text) !== undefined;
  const declared = index.lookup('type', name)?.decl;
  return declared?.kind === 'enum' && lit.kind === 'word' && declared.members.some((m) => m.text === lit.text);
}
