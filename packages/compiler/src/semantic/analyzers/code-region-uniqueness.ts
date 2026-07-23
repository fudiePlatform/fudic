/**
 * `code-region-uniqueness` (decision 33.b): at most one `@server` and one `@client` per
 * `@code`. Zero of either is fine; a repeat is the error, blamed on the repeated region.
 */

import { errorDiag, type Span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { documentCode } from '../walk.js';

const FUD_DUPLICATE_REGION = 'FUD0194';

export const codeRegionUniqueness: Analyzer = {
  name: 'code-region-uniqueness',
  run(input, report) {
    const code = documentCode(input.document);
    if (code === undefined) return;

    let servers = 0;
    let clients = 0;
    for (const part of code.parts) {
      if (part.type === 'server-region') {
        servers += 1;
        if (servers > 1) report(duplicate(part.span, '@server'));
      } else if (part.type === 'client-region') {
        clients += 1;
        if (clients > 1) report(duplicate(part.span, '@client'));
      }
    }
  },
};

function duplicate(span: Span, region: string) {
  return errorDiag(
    FUD_DUPLICATE_REGION,
    `at most one \`${region}\` region is allowed per \`@code\``,
    span,
  );
}
