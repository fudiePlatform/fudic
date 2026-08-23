/**
 * BUG-23 — what TypeScript is allowed to say inside a `.fud`.
 *
 * The decorator is measured over a FAKE TypeScript plugin, and that is the point: what is
 * being tested is the narrowing, not tsserver. The acceptance suite drives the real one over
 * a real project; here the reply is written by hand so that the two silences this decorator
 * has to survive — a plugin that answers `undefined` and one that answers `null` — can be
 * produced at all.
 */

import { describe, expect, it } from 'vitest';
import type {
  CompletionItem,
  CompletionList,
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from '@volar/language-service';
import { CompletionItemKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { clientFileName, mapToGenerated } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { filterTypeScriptCompletions } from '../../src/services/ts-completion.js';
import { CLIENT_CODE_ID, SERVER_CODE_ID } from '../../src/virtual-code.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import type { CachedDocument } from '../../src/document-cache.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

const PATH = '/p/pages/index.fud';
const FUD_URI = URI.file(PATH);

/** A page with two names in scope and a `<p>` to put the cursor in. */
const page = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
@code {
  @client {
    const counter = 1;
    function onClick() {}
  }
}

<article>
  <p>${markup}</p>
</article>
`;

/** The cached `.fud`, its client projection, and a document over the projection's text. */
function project(markup: string) {
  const source = page(markup);
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/layouts/_layout.fud': LAYOUT,
      '/p/components/app-badge.fud': component('app-badge'),
      [PATH]: source,
    }),
  );
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, source);
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path))!;

  return {
    source,
    cached,
    client,
    document: TextDocument.create(`file://${client.fileName}`, 'typescript', 1, client.text),
  };
}

/** A TypeScript plugin whose reply is `answer`, wrapped by the decorator under test. */
function wrap(
  answer: CompletionList | undefined | null,
  documents: Readonly<Record<string, CachedDocument>>,
  decode: (uri: URI) => [URI, string] | undefined,
): LanguageServicePluginInstance {
  const plugin: LanguageServicePlugin = {
    name: 'typescript-double',
    capabilities: { completionProvider: {} },
    create: () => ({
      provideCompletionItems: () => answer as CompletionList | undefined,
    }),
  };
  const [wrapped] = filterTypeScriptCompletions([plugin]);
  return wrapped!.create(fakeServiceContext(documents, decode));
}

const item = (label: string, extra: Partial<CompletionItem> = {}): CompletionItem => ({
  label,
  kind: CompletionItemKind.Variable,
  ...extra,
});

const list = (...items: CompletionItem[]): CompletionList => ({ isIncomplete: false, items });

/** The reply of the wrapped plugin at the `|` of `markup`, over `answer`. */
async function completeAt(
  markup: string,
  answer: CompletionList | undefined | null,
  options: { codeId?: string; virtuals?: readonly never[] } = {},
): Promise<CompletionList | undefined | null> {
  const { source, cached, client, document } = project(markup.replace('|', ''));
  const at = source.indexOf('<p>') + '<p>'.length + markup.indexOf('|');
  const generated = mapToGenerated(client, at, 'completion');
  const entry = options.virtuals === undefined ? cached : { ...cached, virtuals: options.virtuals };
  const service = wrap(answer, { [FUD_URI.toString()]: entry }, () => [
    FUD_URI,
    options.codeId ?? CLIENT_CODE_ID,
  ]);

  return (await service.provideCompletionItems?.(
    document,
    document.positionAt(generated ?? 0),
    { triggerKind: 1 },
    TOKEN,
  )) as CompletionList | undefined | null;
}

describe('the positions this package does not own', () => {
  it('leaves a document that is not an embedded projection exactly as it was', async () => {
    // A real `.ts` of the workspace is none of this package's business — the `$` rule
    // included, since nothing there is scaffolding of ours.
    const document = TextDocument.create('file:///p/src/main.ts', 'typescript', 1, 'const a = 1;');
    const service = wrap(list(item('$tpl'), item('atob')), {}, () => undefined);

    const answer = await service.provideCompletionItems?.(
      document,
      { line: 0, character: 0 },
      { triggerKind: 1 },
      TOKEN,
    );

    expect(answer?.items.map((i) => i.label)).toEqual(['$tpl', 'atob']);
  });

  it('leaves an embedded document whose source is not a `.fud`', async () => {
    const document = TextDocument.create('file:///p/x.vue.ts', 'typescript', 1, '');
    const service = wrap(list(item('$tpl')), {}, () => [URI.file('/p/x.vue'), CLIENT_CODE_ID]);

    const answer = await service.provideCompletionItems?.(
      document,
      { line: 0, character: 0 },
      { triggerKind: 1 },
      TOKEN,
    );

    expect(answer?.items.map((i) => i.label)).toEqual(['$tpl']);
  });

  it('leaves a `.fud` the language does not hold a script for', async () => {
    const document = TextDocument.create('file:///p/pages/index.fud.client.ts', 'typescript', 1, '');
    const service = wrap(list(item('$tpl')), {}, () => [FUD_URI, CLIENT_CODE_ID]);

    const answer = await service.provideCompletionItems?.(
      document,
      { line: 0, character: 0 },
      { triggerKind: 1 },
      TOKEN,
    );

    expect(answer?.items.map((i) => i.label)).toEqual(['$tpl']);
  });

  it('drops the scaffolding in the SERVER projection, and narrows nothing else', async () => {
    // `@code` and nothing else: a position there is ordinary TypeScript, so the whole scope
    // is the right answer — but `$props` and `$on` are still names nobody may write.
    const answer = await completeAt('@|', list(item('$props'), item('atob')), {
      codeId: SERVER_CODE_ID,
    });

    expect(answer?.items.map((i) => i.label)).toEqual(['atob']);
  });

  it('drops the scaffolding when the client projection is missing from the batch', async () => {
    const answer = await completeAt('@|', list(item('$tpl'), item('atob')), { virtuals: [] });

    expect(answer?.items.map((i) => i.label)).toEqual(['atob']);
  });
});

describe('a `@` in markup, when TypeScript says nothing at all', () => {
  it('answers with the template’s own names over an `undefined` reply', async () => {
    // A program that has not finished loading answers `undefined` at every offset. The names
    // come from the parse, so they are the answer whether or not TypeScript ever arrives.
    const answer = await completeAt('@|', undefined);

    expect(answer?.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['counter', 'onClick', '@()', '@if']),
    );
    // An incomplete list, so the editor asks again once the program is up.
    expect(answer?.isIncomplete).toBe(true);
  });

  it('and over a `null` one, which is the other way a service declines', async () => {
    const answer = await completeAt('@|', null);

    expect(answer?.items.map((i) => i.label)).toEqual(expect.arrayContaining(['counter', '@()']));
  });

  it('gives the silence back untouched where it owns nothing', async () => {
    // Plain text: no rule of this decorator fires, so a `null` stays `null` and the position
    // travels on to whoever else may have an answer.
    expect(await completeAt('hola|', null)).toBeNull();
    expect(await completeAt('hola|', undefined)).toBeUndefined();
  });
});

describe('the two rules over a reply that does arrive', () => {
  it('keeps what the template can see and drops what it cannot', async () => {
    const answer = await completeAt(
      '@|',
      list(item('counter'), item('atob'), item('$tpl'), item('AbortController')),
    );

    expect(answer?.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['counter', 'onClick', '@()']),
    );
    expect(answer?.items.map((i) => i.label)).not.toContain('atob');
    expect(answer?.items.map((i) => i.label)).not.toContain('$tpl');
  });

  it('drops an auto-import even when its label is a name in scope', async () => {
    // Both marks the protocol carries before the item is resolved: the module shown on the
    // right of the list, and the source the resolve step would import from. Either one is
    // proof the name does not exist at this position yet.
    const answer = await completeAt(
      '@|',
      list(
        item('counter', { labelDetails: { description: '../../vite.config' } }),
        item('onClick', { data: { source: '@fudic/transport' } }),
      ),
    );

    // Offered all the same, but as the names of the template rather than as imports: no
    // `labelDetails`, no `data`, and the kind the scope knows.
    const counter = answer?.items.find((i) => i.label === 'counter');
    expect(counter?.detail).toBe('in scope');
    expect(counter?.labelDetails).toBeUndefined();
    expect(answer?.items.find((i) => i.label === 'onClick')?.kind).toBe(
      CompletionItemKind.Function,
    );
  });

  it('anchors every item on what was typed after the `@`, never on the `@` itself', async () => {
    // The editor filters an item against the text between the start of its replacement range
    // and the caret: with the `@` inside that range the text is `@c`, `counter` does not start
    // with it, and the item is dropped after arriving correctly.
    const answer = await completeAt('@c|', list(item('counter')));
    const counter = answer?.items.find((i) => i.label === 'counter');

    expect(counter?.textEdit).toBeDefined();
    const range = (counter?.textEdit as { range: { start: { character: number } } }).range;
    expect(range.start.character).toBe(
      ((counter?.textEdit as { range: { end: { character: number } } }).range.end.character - 1),
    );
  });
});

describe('the same answer is not said twice', () => {
  it('collapses the repeats Volar produces by asking once per mapping', async () => {
    // One caret maps into the projection at more than one generated position, and every
    // plugin is asked at each: the editor rendered `handlerClick` three times. The request's
    // cancellation token is what identifies the request, so the second call with the SAME
    // token keeps only what the first did not say.
    const { source, cached, client, document } = project('@');
    // AFTER the `@`, which is where the caret is when the list is asked for.
    const at = source.indexOf('<p>') + '<p>'.length + 1;
    const position = document.positionAt(mapToGenerated(client, at, 'completion') ?? 0);
    const service = wrap(list(item('counter')), { [FUD_URI.toString()]: cached }, () => [
      FUD_URI,
      CLIENT_CODE_ID,
    ]);
    const ask = async (): Promise<readonly string[]> =>
      (
        (await service.provideCompletionItems?.(
          document,
          position,
          { triggerKind: 1 },
          TOKEN,
        )) as CompletionList
      ).items.map((i) => i.label);

    const first = await ask();
    const second = await ask();

    expect(first).toContain('counter');
    expect(second).toEqual([]);
  });

  it('starts over for a new request, so pressing Ctrl+Space again answers again', async () => {
    const { source, cached, client, document } = project('@');
    // AFTER the `@`, which is where the caret is when the list is asked for.
    const at = source.indexOf('<p>') + '<p>'.length + 1;
    const position = document.positionAt(mapToGenerated(client, at, 'completion') ?? 0);
    const service = wrap(list(item('counter')), { [FUD_URI.toString()]: cached }, () => [
      FUD_URI,
      CLIENT_CODE_ID,
    ]);
    const ask = async (token: typeof TOKEN): Promise<readonly string[]> =>
      (
        (await service.provideCompletionItems?.(
          document,
          position,
          { triggerKind: 1 },
          token,
        )) as CompletionList
      ).items.map((i) => i.label);

    await ask(TOKEN);
    const again = await ask({ ...TOKEN });

    expect(again).toContain('counter');
  });
});
