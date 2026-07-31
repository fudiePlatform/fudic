/**
 * The CLI's own error catalogue (SDD-22 §3.3): FUD0440–FUD0459. SDD-21 reaches FUD0436,
 * so the range is free. These are `CliError`s, not `Diagnostic`s: none of them has a
 * source span — a collision or a bad `argv` is not a place in a file.
 */

import type { CliError } from './types.js';

export const FUD_TAG_INVALID = 'FUD0440';
export const FUD_TAG_EXISTS = 'FUD0441';
export const FUD_TAG_RESERVED = 'FUD0442';
export const FUD_TARGET_EXISTS = 'FUD0443';
export const FUD_WIRE_TARGET_MISSING = 'FUD0444';
export const FUD_WIRE_TARGET_BROKEN = 'FUD0445';
export const FUD_SECTION_UNKNOWN = 'FUD0446';
export const FUD_ADAPTER_UNAVAILABLE = 'FUD0447';
export const FUD_USAGE = 'FUD0448';
export const FUD_LAYOUT_INVALID = 'FUD0449';

/** `fudic fmt`: a file that does not parse. Reported, and left exactly as it was (SDD-26 §4.6). */
export const FUD_FORMAT_UNPARSEABLE = 'FUD0450';

/** Build a `CliError`, omitting `file` when absent (exactOptionalPropertyTypes). */
export function cliError(code: string, message: string, file?: string): CliError {
  return file === undefined ? { code, message } : { code, message, file };
}
