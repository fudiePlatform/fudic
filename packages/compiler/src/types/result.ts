/**
 * `ParseResult<T>` — the uniform `{ value, diagnostics }` container every pipeline
 * phase returns, so a broken input never interrupts the flow (SDD-01 §3.3, §4.3).
 * The parser never throws; it degrades the value and accumulates diagnostics.
 */

import type { Diagnostic } from './diagnostic.js';

/**
 * Uniform result of every pipeline phase. It ALWAYS returns a value (possibly
 * partial/degraded) PLUS the list of diagnostics. It never throws. "partial value
 * + diagnostics" is what tells a language server apart from a batch compiler: the
 * editor needs an AST even when the code is broken.
 */
export interface ParseResult<T> {
  readonly value: T;
  readonly diagnostics: readonly Diagnostic[];
}

/** Shared immutable empty array for the no-diagnostics case (no allocations). */
const NO_DIAGNOSTICS: readonly Diagnostic[] = Object.freeze([]);

/** Result with no errors. */
export function ok<T>(value: T): ParseResult<T> {
  return { value, diagnostics: NO_DIAGNOSTICS };
}

/** Result with a value (partial allowed) and diagnostics. */
export function withDiagnostics<T>(
  value: T,
  diagnostics: readonly Diagnostic[],
): ParseResult<T> {
  return { value, diagnostics };
}

/**
 * Combines the diagnostics of several sub-results into one, keeping the node's
 * own value. Sugar for phases that aggregate children.
 */
export function collectDiagnostics(
  ...results: readonly ParseResult<unknown>[]
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const result of results) {
    out.push(...result.diagnostics);
  }
  return out;
}
