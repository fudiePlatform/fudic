/**
 * FUD0430 — a layout must not load data (SDD-21, decision 89).
 *
 * In v1 a layout receives the route's `data` read-only. Keeping `load` out of layouts is
 * what lets SDD-19's SSG mode inference stay untouched: a layout cannot turn a static
 * route dynamic, and the cache key never has to account for two loaders.
 *
 * The check is deliberately shallow — a textual scan of the `@code` for an exported `load`
 * binding, the way a `@server` region wrote it before SDD-60. Reading it off the Oxc AST
 * would be exact, but this rule must hold even when the JS did not parse. It is the one
 * statement of a layout's `@code` that `FUD0700` leaves to it.
 *
 * Shallow is not blind, though. The comment that documents this very rule names `load`, and so
 * does `const doc = "export function load"` (BUG-30 §4.2). Comments and strings are blanked
 * before the match, with the regions the SDD-02 balancer already walked and SDD-08 published:
 * the scan stays textual and independent of Oxc, and stops reading prose as an export.
 */

import { FUD0430 } from '@fudic/diagnostics';
import { span } from '../../types/index.js';
import type { Diagnostic } from '../../types/index.js';
import type { Analyzer, SemanticInput } from '../model.js';
import { maskOpaque } from '../opaque.js';

/** `export function load` / `export async function load` / `export const load` … */
export const EXPORTED_LOAD =
  /\bexport\s+(?:async\s+)?function\s+load\b|\bexport\s+(?:const|let|var)\s+load\b/u;

export const layoutLoad: Analyzer = {
  name: 'layout-load',
  run(input: SemanticInput, report: (d: Diagnostic) => void): void {
    const document = input.document;
    if (document.type !== 'layout-document' || document.code === undefined) return;
    const code = document.code;
    for (const part of code.parts) {
      const js = maskOpaque(input.source, code.regions, part.js.start, part.js.end);
      const found = EXPORTED_LOAD.exec(js);
      if (found !== null) {
        const at = part.js.start + found.index;
        report(FUD0430({ span: span(at, at + found[0].length) }));
      }
    }
  },
};
