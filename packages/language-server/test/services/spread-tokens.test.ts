/**
 * Semantic tokens for `...item` (props-spec §5): the DOTS are the binding, and only them. The
 * object after them is a name the view reads, coloured by TypeScript through the projection
 * like any other — a `fudBinding` over it would paint a variable as if it were syntax.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { semanticTokens } from '../../src/services/semantic-tokens.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

const SOURCE = `<link rel="component" href="./app-badge.fud">
@code {
  const item = { tone: 'info' };
  const row = { data: { tone: 'info' } };
}

<app-x>
  <template shadowrootmode="open">
    <app-badge ...item .tone="@item.tone"></app-badge>
    <app-badge ...row.data></app-badge>
  </template>
</app-x>
`;

function bindingsOf(source: string): readonly string[] {
  const files = {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/layouts/_layout.fud': LAYOUT,
    '/p/components/app-x.fud': source,
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const document = new DocumentCache(index).get('/p/components/app-x.fud', 1, source);
  return semanticTokens(document)
    .filter((t) => t.type === 'fudBinding')
    .map((t) => source.slice(t.span.start, t.span.end));
}

describe('semantic tokens of a spread', () => {
  it('mark the three dots, never the object', () => {
    const bindings = bindingsOf(SOURCE);
    expect(bindings.filter((b) => b === '...')).toHaveLength(2);
    expect(bindings.some((b) => b.includes('item') || b.includes('row'))).toBe(false);
    // The `.prop` beside it keeps its own colour.
    expect(bindings).toContain('.tone');
  });

  it('mark the dots of a bare or malformed spread too: it is still a spread', () => {
    const bindings = bindingsOf(SOURCE.replace('...row.data', '...a-b').replace('...item', '...'));
    expect(bindings.filter((b) => b === '...')).toHaveLength(2);
  });
});
