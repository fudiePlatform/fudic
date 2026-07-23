/**
 * `duplicate-attributes` (decision 45): two attributes with the same name on one element.
 * The second occurrence is the error, so the editor points at the redundant one.
 *
 * Names are compared case-sensitively on the verbatim string: the framework's own bindings
 * are case-sensitive (`.prop`, `@evt`), so folding case would risk collapsing distinct names.
 * Expression names (`bus:(expr)`) are not statically comparable and are skipped.
 */

import { errorDiag } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_DUPLICATE_ATTRIBUTE = 'FUD0190';

export const duplicateAttributes: Analyzer = {
  name: 'duplicate-attributes',
  run(input, report) {
    walk(documentRoots(input.document), {
      element(el) {
        const seen = new Set<string>();
        for (const attr of el.attributes) {
          if (typeof attr.name !== 'string') continue;
          if (seen.has(attr.name)) {
            report(errorDiag(FUD_DUPLICATE_ATTRIBUTE, `duplicate attribute \`${attr.name}\``, attr.span));
          } else {
            seen.add(attr.name);
          }
        }
      },
    });
  },
};
