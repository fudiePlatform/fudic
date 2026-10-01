/**
 * `code-region-uniqueness` (decision 33.b): at most one `@server` and one `@client` per
 * `@code`. Zero of either is fine; a repeat is the error, blamed on the repeated region.
 */

import { FUD0194 } from '@fudic/diagnostics';
import type { Analyzer } from '../model.js';
import { documentCode } from '../walk.js';

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
        if (servers > 1) report(FUD0194({ span: part.span, region: '@server' }));
      } else if (part.type === 'client-region') {
        clients += 1;
        if (clients > 1) report(FUD0194({ span: part.span, region: '@client' }));
      }
    }
  },
};
