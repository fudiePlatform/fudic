/**
 * `require` (SDD-60 §3.6): a rule fudic writes in both sides from its expression. The generated
 * module turns the expression into a test over the value of the form or group that declares
 * it; these are the pieces that test is made of, so the two sides read it alike.
 */

import type { AnyForm, AnyValidator, Errors } from '../types.js';

/** The test of a `require`: the value of its form or group, and the root form. */
export type Test = (value: never, root: AnyForm) => boolean;

/** A `require` in a `summary`: fails with `code` when its test does not hold. */
export function requireRule(code: string, test: Test): AnyValidator<unknown> {
  const failed: Errors = { [code]: true };
  return (value, root) => ((test as (v: unknown, r: AnyForm) => boolean)(value, root) ? null : failed);
}

/**
 * A `require … on <field>`: the same test, run as a rule of that field, over the value of the
 * form or group at `path` (`[]` the root form).
 */
export function requireOn(code: string, path: readonly string[], test: Test): AnyValidator<unknown> {
  const inner = requireRule(code, test) as (v: unknown, r: AnyForm) => Errors | null;
  return (_value, root) => inner(valueAt((root as AnyForm).$value(), path), root as AnyForm);
}

/** The value at `path` of a form's value. */
export function valueAt(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((v, key) => (v as Readonly<Record<string, unknown>>)[key], value);
}

/** `empty c`: no value — `null`, `''` or an empty list. */
export const isEmpty = (v: unknown): boolean => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** `length c`: the length of a text or a list; `0` without a value. */
export const lengthOf = (v: unknown): number => (typeof v === 'string' || Array.isArray(v) ? v.length : 0);

/** `a contains b`: a text that contains another, or a list that holds a value. */
export const contains = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' ? a.includes(String(b)) : Array.isArray(a) && a.some((x) => same(x, b));

/** `==`: dates by their instant, the rest by identity. */
export const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : Object.is(a, b);

/** `< <= > >=` on numbers, texts and dates; `false` when either side has no value. */
export function compare(a: unknown, op: '<' | '<=' | '>' | '>=', b: unknown): boolean {
  if (a === null || b === null) return false;
  const x = a instanceof Date ? a.getTime() : (a as number);
  const y = b instanceof Date ? b.getTime() : (b as number);
  switch (op) {
    case '<':
      return x < y;
    case '<=':
      return x <= y;
    case '>':
      return x > y;
    case '>=':
      return x >= y;
  }
}

/** `valid c`: whether the control or group at `path` holds its rules now (silent). */
export function validAt(root: AnyForm, path: readonly string[]): boolean {
  const node = valueAt(root, path) as { readonly valid?: () => boolean; readonly $valid?: () => boolean };
  return node.valid !== undefined ? node.valid() : node.$valid!();
}
