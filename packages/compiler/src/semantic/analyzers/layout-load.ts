/**
 * FUD0430 — a layout must not load data (SDD-21, decision 89).
 *
 * In v1 a layout receives the route's `data` read-only. Keeping `load` out of layouts is
 * what lets SDD-19's SSG mode inference stay untouched: a layout cannot turn a static
 * route dynamic, and the cache key never has to account for two loaders.
 *
 * The check is deliberately shallow — a textual scan of the `@server` region for an
 * exported `load` binding. Reading it off the Oxc AST would be exact, but the region's
 * fragment is only registered when the pipeline batched it, and this rule must hold even
 * when the JS did not parse.
 */

import type { Diagnostic } from '../../types/index.js';
import { errorDiag } from '../../types/index.js';
import type { Analyzer, SemanticInput } from '../model.js';

const FUD_LAYOUT_LOAD = 'FUD0430';

/** `export function load` / `export async function load` / `export const load` … */
const EXPORTED_LOAD =
  /\bexport\s+(?:async\s+)?function\s+load\b|\bexport\s+(?:const|let|var)\s+load\b/u;

export const layoutLoad: Analyzer = {
  name: 'layout-load',
  run(input: SemanticInput, report: (d: Diagnostic) => void): void {
    const document = input.document;
    if (document.type !== 'layout-document' || document.code === undefined) return;
    for (const part of document.code.parts) {
      if (part.type !== 'server-region') continue;
      const js = input.source.slice(part.js.start, part.js.end);
      if (EXPORTED_LOAD.test(js)) {
        report(
          errorDiag(
            FUD_LAYOUT_LOAD,
            'a layout cannot export load: it receives the route data (v1)',
            part.span,
          ),
        );
      }
    }
  },
};
