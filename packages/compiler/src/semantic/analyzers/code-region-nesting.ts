/**
 * `code-region-nesting` (decision 33.a): `@server`/`@client` regions cannot be nested.
 *
 * SDD-08 does not descend into a region's body — it hands it to Oxc as opaque JS — so a nested
 * marker is only visible by scanning the part's TEXT, and that stays the right source of truth:
 * the rule must hold whether or not the fragment parsed.
 *
 * What the text scan may not do is read prose as code. A `// move this to @client` names a
 * region without opening one, and so does `const s = "@server"` (BUG-30 §4.1). The comments and
 * the strings are blanked first, with the regions the balancer already walked, so the regular
 * expression only ever sees code — and, since the mask is character for character, the span it
 * reports is the offset the author wrote the marker at.
 */

import { errorDiag, span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { maskOpaque } from '../opaque.js';
import { documentCode } from '../walk.js';

const FUD_NESTED_REGION = 'FUD0193';

/** A `@server` / `@client` marker: the `@`, the keyword, and a word boundary after it. */
const REGION_MARKER = /@(?:server|client)\b/g;

export const codeRegionNesting: Analyzer = {
  name: 'code-region-nesting',
  run(input, report) {
    const code = documentCode(input.document);
    if (code === undefined) return;

    for (const part of code.parts) {
      const text = maskOpaque(input.source, code.regions, part.js.start, part.js.end);
      for (const match of text.matchAll(REGION_MARKER)) {
        const marker = match[0]!;
        const at = part.js.start + match.index!;
        report(
          errorDiag(
            FUD_NESTED_REGION,
            '`@server`/`@client` regions cannot be nested',
            span(at, at + marker.length),
          ),
        );
      }
    }
  },
};
