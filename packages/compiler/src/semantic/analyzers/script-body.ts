/**
 * `script-body` — **`FUD0161`**: a `<script>` of CODE may not carry a body (decision 129).
 *
 * fudic does not support inline script, and until now it said so by doing nothing: the body
 * of a `<script>` is a `RawTextNode`, `raw-text` sits in the emit's `SERVER_ROLE` table as
 * `'none'`, and the walk fabricated no node for it. The tag came out of the serializer and
 * its contents did not — `<script>alert(1)</script>` in the source became `<script></script>`
 * in the HTML, with no diagnostic anywhere. That is the failure mode a table is meant to
 * prevent: the node was NAMED and still went nowhere, the same shape as BUG-19 and BUG-28.
 *
 * **The line is code versus data, not body versus no body.** A `<script>` the browser RUNS
 * has a supported form that survives — a file, brought in with `src` — so the inline one is
 * rejected. A `<script>` the browser READS has no such form: JSON-LD is how a page explains
 * itself to a search engine and to a conversational AI, and an import map must by
 * specification be inline. Those two are emitted verbatim (`DATA_SCRIPT_TYPES`, and the emit
 * writes the body in `markup.ts`), so there is nothing to diagnose about them.
 *
 * What is left is the code case, and there the rule is about the BODY and not the tag:
 * `<script src="/probe.js"></script>` is emitted whole, an empty one loses nothing, and only
 * contents that would be silently dropped are reported. Whitespace-only counts as empty —
 * indentation is formatting, not author code, and such a tag behaves exactly like the empty
 * one it is written as.
 *
 * The span is the body, not the element: the diagnostic points at the text that would have
 * been dropped, which is the only part the author has to move.
 *
 * Reported through BOTH doors — the semantic pass for the editor and `registry.ts` for the
 * build — because a rule served by one of them is a rule half the users never see. That is
 * the crack BUG-23 took a month to close for `FUD0291` and SDD-37 closed again for
 * `FUD0667`, and it is cheaper to not open it than to find it later.
 */

import { errorDiag } from '../../types/index.js';
import { dataScriptType } from '../../html/index.js';
import type { Analyzer, MarkupInput, Report } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_SCRIPT_BODY = 'FUD0161';

/** The rule itself, over markup alone: the semantic pass and the build both call this. */
export function checkScriptBody(input: MarkupInput, report: Report): void {
  walk(documentRoots(input.document), {
    element(el) {
      if (el.name.toLowerCase() !== 'script') return;
      // Data, not code: emitted verbatim, and so nothing this rule owns.
      if (dataScriptType(el) !== undefined) return;
      for (const child of el.children) {
        if (child.type !== 'raw-text' || child.value.trim() === '') continue;
        report(
          errorDiag(
            FUD_SCRIPT_BODY,
            'a `<script>` of code cannot carry a body: fudic does not support inline script, and the body is not emitted. Move the code to a file and reference it with `src`. Data blocks are supported inline: `application/ld+json` and `importmap`',
            child.span,
          ),
        );
      }
    },
  });
}

export const scriptBody: Analyzer = {
  name: 'script-body',
  run: checkScriptBody,
};
