/**
 * `baseline-css` (SDD-83 §3.6, §4.4): the `<style>` of a `.fud` against the project's Baseline,
 * read by the same detector the plugin runs over the guide and the sheets of `styles`.
 *
 * A `<style>` body is plain CSS (decision 136), so the detector reads it as it is, with the spans
 * moved to where the body starts in the file. Silent with no `baseline` in the input.
 */

import { cssBaselineUses } from '../../css/baseline.js';
import type { HtmlContent } from '../../html/index.js';
import type { Analyzer } from '../model.js';
import { judgeUses, type BaselineUse } from '../baseline.js';
import { documentRoots, walk } from '../walk.js';

export const baselineCss: Analyzer = {
  name: 'baseline-css',
  run(input, report) {
    const context = input.baseline;
    if (context === undefined) return;
    for (const found of judgeUses(styleBaselineUses(documentRoots(input.document), input.source), context)) report(found);
  },
};

/** Every use of the browser in the `<style>` bodies under `roots`, with spans on `source`. */
export function styleBaselineUses(roots: readonly HtmlContent[], source: string): BaselineUse[] {
  const uses: BaselineUse[] = [];
  walk(roots, {
    element(el) {
      for (const child of el.children) {
        if (child.type !== 'style-content') continue;
        uses.push(...cssBaselineUses(source.slice(child.span.start, child.span.end), child.span.start));
      }
    },
  });
  return uses;
}
