/**
 * BUG-23 — the decorator that keeps the root quiet where the projection answers.
 *
 * Saying nothing is not the same as being silent, and that difference is the whole module:
 * Volar drops a plugin whose list comes back EMPTY and walks on, and the root is walked LAST,
 * so a component whose contract had no member to offer handed the turn to the HTML service,
 * which filled the silence with `class`, `id` and `role`.
 */

import { describe, expect, it } from 'vitest';
import type {
  CompletionList,
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { silenceOwnedPositions } from '../../src/services/owned.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

const PATH = '/p/pages/index.fud';
const FUD_URI = URI.file(PATH);

const HTML_LIST: CompletionList = {
  isIncomplete: false,
  items: [{ label: 'class' }, { label: 'id' }, { label: 'role' }],
};

/** A page whose `<article>` holds `markup`, with a component to put a `.` on. */
const page = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">

<article>
  ${markup}
</article>
`;

/** The wrapped service, and the position of the `|` in the source. */
function setup(markup: string, inner: LanguageServicePluginInstance['provideCompletionItems']) {
  const marked = page(markup);
  const offset = marked.indexOf('|');
  const source = marked.replace('|', '');
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/layouts/_layout.fud': LAYOUT,
      '/p/components/app-badge.fud': component('app-badge'),
      [PATH]: source,
    }),
  );
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, source);
  const plugin: LanguageServicePlugin = {
    name: 'html-double',
    capabilities: { completionProvider: {} },
    create: () => (inner === undefined ? {} : { provideCompletionItems: inner }),
  };
  const document = TextDocument.create(FUD_URI.toString(), 'fud', 1, source);
  const service = silenceOwnedPositions(plugin).create(
    fakeServiceContext({ [FUD_URI.toString()]: cached }),
  );

  return { service, document, position: document.positionAt(offset) };
}

/** What the wrapped service answers at the `|`, with the HTML vocabulary underneath. */
async function completeAt(markup: string): Promise<CompletionList | undefined> {
  const { service, document, position } = setup(markup, () => HTML_LIST);
  return (await service.provideCompletionItems?.(
    document,
    position,
    { triggerKind: 1 },
    TOKEN,
  )) as CompletionList | undefined;
}

describe('silenceOwnedPositions', () => {
  it.each([
    ['<app-badge .|></app-badge>'],
    ['<app-badge @|></app-badge>'],
    ['<app-badge @click=@|></app-badge>'],
    ['<app-badge .name=@|></app-badge>'],
    ['<app-badge .name=r|></app-badge>'],
    ['<p>@data.|</p>'],
    // A gap of a component tag: `$gap` answers it with HTML's whole vocabulary AND the props,
    // so the HTML service repeating half of it is the same answer twice.
    ['<app-badge cla|></app-badge>'],
  ])('declines %s, whatever the service underneath had to say', async (markup) => {
    expect(await completeAt(markup)).toBeUndefined();
  });

  it.each([
    ['<p>hola|</p>'],
    // The same gap in a NATIVE tag has no `$gap` behind it: HTML's list is the right one, and
    // the `class:` bindings are added beside it rather than in place of it.
    ['<div cla|></div>'],
    ['<div class="b|"></div>'],
  ])('lets the service answer at %s, which is HTML’s own ground', async (markup) => {
    expect((await completeAt(markup))?.items.map((i) => i.label)).toEqual(['class', 'id', 'role']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('gives a declining service its %s back, rather than a list of nothing', async (_how, reply) => {
    // The two ways a plugin declines, and both have to travel through untouched: a `null` that
    // became an empty `CompletionList` would claim the position for a list with nothing in it.
    const { service, document, position } = setup('<p>hola|</p>', () => reply);

    expect(
      await service.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN),
    ).toBe(reply);
  });

  it('reopens `slot` too, which is the other value this server can name', async () => {
    const { service, document, position } = setup('<p>hola|</p>', () => ({
      isIncomplete: false,
      items: [{ label: 'slot' }],
    }));

    const answer = (await service.provideCompletionItems?.(
      document,
      position,
      { triggerKind: 1 },
      TOKEN,
    )) as CompletionList;

    expect(answer.items[0]?.command?.command).toBe('editor.action.triggerSuggest');
  });

  it('and never overwrites a command the service put there itself', async () => {
    const own = { title: 'Theirs', command: 'editor.action.somethingElse' };
    const { service, document, position } = setup('<p>hola|</p>', () => ({
      isIncomplete: false,
      items: [{ label: 'class', command: own }],
    }));

    const answer = (await service.provideCompletionItems?.(
      document,
      position,
      { triggerKind: 1 },
      TOKEN,
    )) as CompletionList;

    expect(answer.items[0]?.command).toBe(own);
  });

  it('makes `class` reopen the list once it is accepted, and leaves the rest alone', async () => {
    // The HTML service writes `class="…"` and stops, because in a `.html` there is nothing
    // behind those quotes it could offer. Here there is — the names of this file's `<style>` —
    // and a list nobody opens is a list nobody has.
    const items = (await completeAt('<p>hola|</p>'))?.items ?? [];

    expect(items.find((item) => item.label === 'class')?.command).toEqual({
      title: 'Suggest',
      command: 'editor.action.triggerSuggest',
    });
    expect(items.filter((item) => item.command !== undefined)).toHaveLength(1);
  });

  it('lets a document that is not a `.fud` through untouched', async () => {
    const { service, position } = setup('<p>|</p>', () => HTML_LIST);
    const other = TextDocument.create('file:///p/index.html', 'html', 1, '<p></p>');

    const answer = (await service.provideCompletionItems?.(
      other,
      position,
      { triggerKind: 1 },
      TOKEN,
    )) as CompletionList | undefined;

    expect(answer).toBe(HTML_LIST);
  });

  it('travels through a plugin that offers no completions at all', () => {
    // The decorator is over completion alone: a plugin that does not provide it comes back as
    // itself, rather than as an instance with a method that was never there.
    const { service } = setup('<p>|</p>', undefined);

    expect(service.provideCompletionItems).toBeUndefined();
  });
});
