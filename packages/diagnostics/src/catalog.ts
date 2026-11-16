/**
 * The catalogue as data: what each code is, without calling it. The policy needs it to know a
 * code's severity before any diagnostic of that code exists — to refuse `"FUD0051": "off"` in
 * `fudic.json` or `fud-disable FUD0051` in a comment — and the editor to complete and explain
 * codes. The table is generated from the `.md` files, which already say all of it.
 */

import { LIVE, RETIRED } from './catalog.generated.js';
import type { FudCode, Severity } from './types.js';

/** A code fudic emits. */
export interface LiveCode {
  readonly code: FudCode;
  readonly title: string;
  readonly severity: Severity;
}

/** A code fudic no longer emits, and what replaced it (empty when nothing did). */
export interface RetiredCode {
  readonly code: FudCode;
  readonly title: string;
  readonly retired: true;
  readonly replacedBy: readonly FudCode[];
}

/** What `code` is, or `undefined` when fudic never had it. */
export function codeInfo(code: string): LiveCode | RetiredCode | undefined {
  if (Object.hasOwn(LIVE, code)) {
    const [severity, title] = LIVE[code]!;
    return { code: code as FudCode, title, severity };
  }
  if (Object.hasOwn(RETIRED, code)) {
    const [title, replacedBy] = RETIRED[code]!;
    return { code: code as FudCode, title, retired: true, replacedBy };
  }
  return undefined;
}

/** Every live code, in numeric order. */
export function liveCodes(): readonly LiveCode[] {
  return Object.keys(LIVE).map((code) => codeInfo(code) as LiveCode);
}
