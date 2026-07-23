/**
 * `code-region-nesting` (decision 33.a): `@server`/`@client` regions cannot be nested.
 * SDD-08 does not descend into a region's body — it hands it to Oxc as opaque JS — so the
 * nested marker is only visible by scanning the region's TEXT. This is a deliberate text
 * scan (SDD-12 §4): a marker inside a JS string/comment is a tolerated false positive, the
 * price of not re-lexing the region body here.
 */

import { errorDiag, span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
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
      const text = input.source.slice(part.js.start, part.js.end);
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
