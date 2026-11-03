/**
 * SDD-63 §3.5 — the two answers the fudic service gained, at the edges a real server does not
 * reach: references over a document that is not a `.fud`, and an event detail whose component
 * has no parsed document to map its offsets through.
 */

import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { clientFileName } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { RequestStats } from '../../src/stats.js';
import { createFudicService } from '../../src/services/plugin.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { LAYOUT, memoryFs, projectionService } from '../_support.js';

const COMPONENT = '/p/components/app-press.fud';
const PAGE = '/p/pages/press.fud';

const PRESS = `@code {
  import { emit } from "@fudic/dom";
  const count: number = 1;
  function go() {
    /** Fired on click. */
    emit('press', count);
  }
}

<app-press>
  <template shadowrootmode="open"><button onclick="@go">x</button></template>
</app-press>
`;

const PAGE_SOURCE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-press.fud">

<app-press></app-press>
`;

/**
 * The service with TypeScript mounted over the COMPONENT's projection, but with only the page
 * parsed: the program knows the component, the language does not.
 */
function setup() {
  const files = { [COMPONENT]: PRESS, [PAGE]: PAGE_SOURCE, '/p/layouts/_layout.fud': LAYOUT };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const cache = new DocumentCache(index);
  const component = cache.get(COMPONENT, 1, PRESS);
  const page = cache.get(PAGE, 1, PAGE_SOURCE);
  const client = component.virtuals.find((virtual) => virtual.fileName === clientFileName(COMPONENT))!;
  const context = fakeServiceContext({ [URI.file(PAGE).toString()]: page }, () => undefined, {
    'typescript/languageService': projectionService(COMPONENT, client.text),
  });
  const service = createFudicService({ index, stats: new RequestStats(), typescript: true }).create(context);
  const document = TextDocument.create(URI.file(PAGE).toString(), 'fud', 1, PAGE_SOURCE);
  return { service, document };
}

describe('the detail of an event, without a document to map through', () => {
  it('leaves the detail out and keeps the rest of the event', async () => {
    const { service, document } = setup();
    const hover = await service.provideHover?.(
      document,
      document.positionAt(PAGE_SOURCE.indexOf('<app-press') + 2),
      TOKEN,
    );
    const card = String((hover?.contents as { value: string }).value);

    expect(card).toContain('**Events**\n- `@press`\n  Fired on click.');
    expect(card).not.toContain('detail:');
  });
});

describe('references', () => {
  it('lists the uses of a tag from the page', async () => {
    const { service, document } = setup();
    const refs = await service.provideReferences?.(
      document,
      document.positionAt(PAGE_SOURCE.indexOf('<app-press') + 2),
      { includeDeclaration: true },
      TOKEN,
    );

    expect(refs?.map((ref) => ref.uri)).toEqual([URI.file(PAGE).toString()]);
  });

  it('answers nothing over a document that is not a `.fud`', async () => {
    const { service } = setup();
    const other = TextDocument.create('file:///p/data/posts.ts', 'typescript', 1, 'export {};');

    expect(
      await service.provideReferences?.(other, { line: 0, character: 0 }, { includeDeclaration: true }, TOKEN),
    ).toBeUndefined();
  });
});
