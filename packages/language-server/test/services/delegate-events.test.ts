/**
 * SDD-72 criterion 46, the unit under the editor's answer: `delegateEvents` reads the events off
 * the compiler's pairing, over whatever batch the document holds. The round trip through the
 * server is `test/acceptance/delegate-events.test.ts`; this is the one case a real batch never
 * produces — a fragment registered as a statement list — which the reading has to treat as no
 * AST rather than trip over, as the compiler's own analyzer does.
 */

import { describe, expect, it } from 'vitest';
import { regionAt } from '@fudic/compiler';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { delegateEvents } from '../../src/services/delegate.js';
import { delegateValueContextAt } from '../../src/services/position.js';
import { memoryFs } from '../_support.js';

const PATH = '/p/src/components/app-table.fud';
const MARKED = `@code {
  const { ps = [] } = props<{ ps?: { id: number }[] }>();
  function borrar(p: unknown) { void p; }
}
<app-table>
  <template shadowrootmode="open">
    <ul @click=@borrar(p)>
      @foreach (const p of ps) key (p.id) { <li delegate:p="|"></li> }
    </ul>
  </template>
</app-table>
`;

function at() {
  const offset = MARKED.indexOf('|');
  const text = MARKED.replace('|', '');
  const index = new WorkspaceIndex(memoryFs({ [PATH]: text }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, text);
  const context = delegateValueContextAt(text, offset, regionAt(text, cached.html, offset))!;
  return { cached, context };
}

describe('delegateEvents', () => {
  it('reads the events of the handlers above that read the row', () => {
    const { cached, context } = at();
    expect(delegateEvents(cached, context)).toEqual(['click']);
  });

  it('a fragment that comes back as a statement list is no AST: nothing is read, nothing thrown', () => {
    const { cached, context } = at();
    const asStatements = { ...cached, js: { ...cached.js, result: { ...cached.js.result, ast: () => [] } } };
    expect(delegateEvents(asStatements as typeof cached, context)).toEqual([]);
  });
});
