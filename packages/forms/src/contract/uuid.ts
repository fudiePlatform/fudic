/**
 * `uuid` (SDD-60 §3.6): text whose format is checked like a number's width — the textual form
 * of RFC 9562, `8-4-4-4-12` hex, any case. Its code is `uuid` and the empty value passes, which
 * `required` rejects. On the wire it is text: a `str` control with that check first.
 */

import { str } from '../typed/str.js';
import type { AnyValidator, ControlOptions, Errors, TypedControl } from '../types.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const BAD: Errors = { uuid: true };

const format = (v: string | null): Errors | null => (v === null || v === '' || UUID.test(v) ? null : BAD);

export const uuid = (
  initial?: string,
  validators: readonly AnyValidator<string>[] = [],
  options?: ControlOptions,
): TypedControl<string> => str(initial, [format as AnyValidator<string>, ...validators], options);
