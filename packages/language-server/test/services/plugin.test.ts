/**
 * The server's own Volar service (SDD-24 §4.2–§4.4, §6.3–§6.6).
 *
 * Driven through the plugin's own methods with a context holding one document: everything the
 * service reaches for is the root virtual code of the document it was asked about, and a full
 * LSP round trip belongs to phase 7.
 */

import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionList, LanguageServicePluginInstance } from '@volar/language-service';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { RequestStats } from '../../src/stats.js';
import { SEMANTIC_TOKENS_LEGEND } from '../../src/capabilities.js';
import {
  createFudicService,
  createFudicTagService,
  fudicDocumentOf,
  rangeOf,
} from '../../src/services/plugin.js';
import { component, LAYOUT, memoryFs, route } from '../_support.js';
import { CANCELLED, fakeServiceContext, TOKEN } from '../_lsp.js';

const SLUG = '/p/blog/[slug].fud';
const URI_OF_SLUG = URI.file(SLUG).toString();

const LAYOUT_WITH_NAV = LAYOUT.replace('<main>', '<main>\n      @RenderSection(nav)');

/** Set the service up over one `.fud`, whose cursor is where `|` was. */
function setup(source: string, path = SLUG) {
  const offset = source.indexOf('|');
  const text = source.replace('|', '');
  const files: Record<string, string> = {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/components/site-nav.fud': component('site-nav'),
    '/p/layouts/_layout.fud': LAYOUT_WITH_NAV,
    [path]: text,
  };

  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const cached = new DocumentCache(index).get(path, 1, text);
  const document = TextDocument.create(URI.file(path).toString(), 'fud', 1, text);
  const stats = new RequestStats();
  const context = fakeServiceContext({ [URI.file(path).toString()]: cached });
  const service = createFudicService({ index, stats }).create(context);
  // The tag branch is a second plugin, and for the reason in BUG-15 §4.6: it merges instead of
  // claiming, and in Volar that is a property of a plugin rather than of a branch.
  const tagService = createFudicTagService({ index, stats }).create(context);

  return {
    service,
    tagService,
    context,
    document,
    cached,
    stats,
    position: document.positionAt(offset === -1 ? 0 : offset),
  };
}

const completionsOf = async (
  service: LanguageServicePluginInstance,
  document: TextDocument,
  position: { line: number; character: number },
): Promise<CompletionList | undefined> =>
  (await service.provideCompletionItems?.(
    document,
    position,
    { triggerKind: 1 },
    TOKEN,
  )) as CompletionList | undefined;

describe('capabilities', () => {
  it('declares what it actually answers', () => {
    const service = createFudicService({ index: new WorkspaceIndex(memoryFs({})), stats: new RequestStats() });

    expect(service.name).toBe('fudic');
    expect(service.capabilities.completionProvider?.triggerCharacters).toContain('<');
    expect(service.capabilities.diagnosticProvider).toEqual({
      interFileDependencies: true,
      workspaceDiagnostics: false,
    });
    expect(service.capabilities.semanticTokensProvider?.legend).toBe(SEMANTIC_TOKENS_LEGEND);
  });
});

describe('completion', () => {
  it('offers the components for an href of rel="component" (§6.5)', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="|">\n<p>x</p>\n`,
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((item) => item.label)).toEqual([
      '../components/app-badge.fud',
      '../components/site-nav.fud',
    ]);
    expect(list?.items[0]?.detail).toBe('component · <app-badge>');
    expect(list?.isIncomplete).toBe(false);
  });

  it('offers the layouts for an href of rel="layout", with no tag in the detail', async () => {
    const { service, document, position } = setup(`<link rel="layout" href="|">\n<p>x</p>\n`);
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(['../layouts/_layout.fud']);
    expect(list?.items[0]?.detail).toBe('layout');
  });

  it('offers the sections the layout declares after @section (§6.6)', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n@section |\n<p>x</p>\n`,
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(['nav']);
  });

  it('says nothing after a `<`: the tag is the additional plugin’s (BUG-15 §4.6)', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article><|</article>\n`,
    );

    // Staying quiet here is the fix: an answer from this plugin sets Volar's
    // `mainCompletionUri` and the HTML service never gets to add the native tags.
    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('says nothing outside markup, where no context applies', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n@code {\n  const a = |1;\n}\n<p>x</p>\n`,
    );

    // Inside `@code` the language is TypeScript: no tag, no Emmet, and `1` is not a word.
    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('replaces exactly the stretch being typed', async () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../comp|">\n<p>x</p>\n`;
    const { service, document, position, cached } = setup(source);
    const list = await completionsOf(service, document, position);
    const edit = list?.items[0]?.textEdit;

    expect(edit).toBeDefined();
    const value = cached.source.indexOf('../comp');
    expect(edit).toMatchObject({
      range: rangeOf(document, { start: value, end: value + '../comp'.length }),
    });
  });
});

describe('the tag plugin (BUG-15 §4.6)', () => {
  it('declares itself additional, which is the whole reason it is a plugin', () => {
    const deps = { index: new WorkspaceIndex(memoryFs({})), stats: new RequestStats() };
    const plugin = createFudicTagService(deps);

    expect(plugin.name).toBe('fudic-tags');
    expect(plugin.capabilities.completionProvider?.triggerCharacters).toContain('<');
    // On the INSTANCE, not on the plugin: that is where Volar reads it from.
    expect(plugin.create(fakeServiceContext({})).isAdditionalCompletion).toBe(true);
  });

  it('offers the declared tags after `<`, ahead of the native ones (§6.4)', async () => {
    const { tagService, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article><|</article>\n`,
    );
    const list = await completionsOf(tagService, document, position);
    const badge = list?.items[0];

    // The linked one first, then the one the workspace has and this file does not (SDD-28).
    expect(list?.items.map((item) => item.label)).toEqual(['app-badge', 'site-nav']);
    expect(badge?.sortText).toBe('0_app-badge');
    expect(badge?.labelDetails?.description).toBe('fudic component');
    // With the `<` already written, the tag completes into what follows it.
    expect(badge?.textEdit?.newText).toBe('app-badge>$0</app-badge>');
    expect(badge?.insertTextFormat).toBe(2);
  });

  it('says nothing where there is no `<` to complete', async () => {
    const { tagService, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  app|\n</article>\n`,
    );

    expect(await completionsOf(tagService, document, position)).toBeUndefined();
  });

  it('says nothing about a document that is not ours', async () => {
    const { tagService, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article><|</article>\n`,
    );
    const alien = TextDocument.create(URI.file('/p/other.txt').toString(), 'plaintext', 1, '<');

    expect(await completionsOf(tagService, alien, position)).toBeUndefined();
  });

  it('does not work when the request was already cancelled', async () => {
    const { tagService, document, position, stats } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article><|</article>\n`,
    );

    const answer = await tagService.provideCompletionItems?.(
      document,
      position,
      { triggerKind: 1 },
      CANCELLED,
    );

    expect(answer).toBeUndefined();
    // Counted apart from `completion`: it is the same request answered a second time, not a
    // second request, and §6.14 is a claim about how many requests a burst made.
    expect(stats.of('tagCompletion').cancelled).toBe(1);
    expect(stats.of('completion').cancelled).toBe(0);
  });
});

describe('completion — snippets and Emmet (SDD-28 §5.3–§5.5)', () => {
  const item = (list: CompletionList | undefined, label: string) =>
    list?.items.find((candidate) => candidate.label === label);

  it('a bare word offers the components AND keeps Emmet whole', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  app|\n</article>\n`,
    );
    const list = await completionsOf(service, document, position);

    // Ours, with the `<` we write ourselves because the user did not type one.
    expect(item(list, 'app-badge')?.textEdit?.newText).toBe('<app-badge>$0</app-badge>');
    // And Emmet's, in the SAME response — here it reads `app` as the `applet` element.
    // Losing this is the regression of §5.3: every abbreviation the user has ever typed
    // would silently stop expanding.
    expect(item(list, 'applet')?.textEdit?.newText).toBe('<applet>${0}</applet>');
    expect(list?.isIncomplete).toBe(true);
  });

  it('an unlinked component carries its <link> along (criterion 12)', async () => {
    const { service, document, position, cached } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  site|\n</article>\n`,
    );
    const list = await completionsOf(service, document, position);
    const nav = item(list, 'site-nav');
    const edit = nav?.additionalTextEdits?.[0];

    expect(nav?.sortText).toBe('1_site-nav');
    expect(nav?.labelDetails?.description).toBe('fudic component · adds <link>');
    expect(edit?.newText).toBe('\n<link rel="component" href="../components/site-nav.fud">');
    expect(edit?.range.start).toEqual(document.positionAt(cached.source.indexOf('\n')));
  });

  it('a linked one carries nothing: no duplicate link (criterion 14)', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/site-nav.fud">\n<article>\n  site|\n</article>\n`,
    );
    const list = await completionsOf(service, document, position);

    expect(item(list, 'site-nav')?.additionalTextEdits).toBeUndefined();
    expect(item(list, 'site-nav')?.sortText).toBe('0_site-nav');
  });

  it('a `@` offers the directives of the role, and replaces the `@` with them', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  @|\n</article>\n`,
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((entry) => entry.label)).toContain('@foreach');
    expect(list?.items.map((entry) => entry.label)).not.toContain('@RenderBody');
    expect(item(list, '@if')?.textEdit?.newText).toBe('@if (${1:condition}) {\n  $0\n}');
    expect(item(list, '@if')?.insertTextFormat).toBe(2);
  });

  it('and in a layout it offers @RenderBody instead of @section', async () => {
    const { service, document, position } = setup(
      LAYOUT_WITH_NAV.replace('<main>', '<main>@|'),
      '/p/layouts/_other.fud',
    );
    const list = await completionsOf(service, document, position);
    const labels = list?.items.map((entry) => entry.label);

    expect(labels).toContain('@RenderBody');
    expect(labels).not.toContain('@section');
  });

  it('a file with nothing but the word being typed offers the four skeletons', async () => {
    const { service, document, position } = setup('rou|', '/p/new.fud');
    const list = await completionsOf(service, document, position);
    const labels = list?.items.map((entry) => entry.label);

    // Ours are there — the editor is the one that filters `rou` down to `route`.
    expect(labels).toContain('component');
    expect(labels).toContain('route');
    expect(labels).toContain('page');
    expect(labels).toContain('layout');
    expect(item(list, 'route')?.textEdit?.newText).toContain('<link rel="layout"');
  });

  const STYLED = (cursor: string): string =>
    `<head>\n  <style>\n    ${cursor}\n  </style>\n</head>\n\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n`;

  it('offers nothing inside a <style>: there a `@` is a CSS at-rule', async () => {
    const { service, document, position } = setup(STYLED('@|'), '/p/components/app-x.fud');

    // The `@` context matched and came up empty, and it must not answer with an empty list:
    // that would shadow the CSS service, whose `@media` this is.
    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('offers nothing for a word inside a <style> either', async () => {
    const { service, document, position } = setup(STYLED('col|or: red'), '/p/components/app-x.fud');

    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('inside @code it offers the zones, and no tag and no Emmet', async () => {
    const { service, document, position } = setup(
      `@code {\n  pro|\n}\n<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n`,
      '/p/components/app-x.fud',
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((entry) => entry.label)).toEqual(['props']);
  });
});

describe('documents that are not ours', () => {
  it('answers nothing for another language', async () => {
    const { service, context, position } = setup(`<p>x</p>\n`);
    const other = TextDocument.create('file:///p/data/posts.ts', 'typescript', 1, 'export {};');

    expect(fudicDocumentOf(context, other)).toBeUndefined();
    expect(await completionsOf(service, other, position)).toBeUndefined();
    expect(await service.provideDefinition?.(other, position, TOKEN)).toBeUndefined();
    expect(await service.provideDocumentLinks?.(other, TOKEN)).toBeUndefined();
    expect(await service.provideDiagnostics?.(other, TOKEN)).toBeUndefined();
    expect(
      await service.provideDocumentSemanticTokens?.(
        other,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        SEMANTIC_TOKENS_LEGEND,
        TOKEN,
      ),
    ).toBeUndefined();
    expect(
      await service.provideCodeActions?.(
        other,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        { diagnostics: [] },
        TOKEN,
      ),
    ).toBeUndefined();
    // Formatting answers `undefined` for a document that is not ours — and an empty LIST for
    // one that is and has nothing to change (SDD-26 task 33): Volar walks on after a nullish
    // answer, and a `.fud` handed to the HTML service would be laid out by a formatter that
    // has never heard of `@if`.
    expect(
      await service.provideDocumentFormattingEdits?.(
        other,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        { tabSize: 2, insertSpaces: true },
        undefined,
        TOKEN,
      ),
    ).toBeUndefined();
    expect(
      await service.provideOnTypeFormattingEdits?.(
        other,
        position,
        '}',
        { tabSize: 2, insertSpaces: true },
        undefined,
        TOKEN,
      ),
    ).toBeUndefined();
  });

  it('answers nothing for a .fud the language has never seen', async () => {
    const { service, position } = setup(`<p>x</p>\n`);
    const unknown = TextDocument.create('file:///p/other.fud', 'fud', 1, '<p>x</p>');

    expect(await completionsOf(service, unknown, position)).toBeUndefined();
  });
});

describe('definition', () => {
  const SOURCE = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article><app-badge>hi</app-badge><div>x</div></article>\n`;

  it('sends a component tag to the top of the file that defines it (§6.7)', async () => {
    const { service, document, cached } = setup(SOURCE);
    const at = cached.source.indexOf('<app-badge>') + 3;
    const links = await service.provideDefinition?.(document, document.positionAt(at), TOKEN);

    expect(links?.length).toBe(1);
    const top = { line: 0, character: 0 };
    expect(links?.[0]).toEqual({
      targetUri: URI.file('/p/components/app-badge.fud').toString(),
      targetRange: { start: top, end: top },
      targetSelectionRange: { start: top, end: top },
      originSelectionRange: rangeOf(document, {
        start: cached.source.indexOf('<app-badge>') + 1,
        end: cached.source.indexOf('<app-badge>') + 1 + 'app-badge'.length,
      }),
    });
  });

  it('leaves a native tag to whoever owns HTML', async () => {
    const { service, document, cached } = setup(SOURCE);
    const at = cached.source.indexOf('<div>') + 2;

    expect(
      await service.provideDefinition?.(document, document.positionAt(at), TOKEN),
    ).toBeUndefined();
  });
});

describe('document links', () => {
  it('points at the file each href resolves to', async () => {
    const { service, document } = setup(
      route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    );
    const links = await service.provideDocumentLinks?.(document, TOKEN);

    expect(links?.map((link) => link.target)).toEqual([
      URI.file('/p/components/app-badge.fud').toString(),
      URI.file('/p/layouts/_layout.fud').toString(),
    ]);
  });
});

describe('diagnostics', () => {
  it('reports FUD0460 on the .fud, with severity and source', async () => {
    const { service, document } = setup(
      route('../layouts/_layout.fud', ['../components/ghost.fud']),
    );
    const diagnostics = await service.provideDiagnostics?.(document, TOKEN);

    expect(diagnostics?.length).toBe(1);
    expect(diagnostics?.[0]).toMatchObject({ code: 'FUD0460', severity: 1, source: 'fudic' });
    expect(document.getText(diagnostics?.[0]?.range)).toBe('../components/ghost.fud');
  });

  it('carries each severity across unchanged', async () => {
    // A layout nobody points at is FUD0434 — a warning, not an error.
    const { service, document } = setup(LAYOUT_WITH_NAV, '/p/layouts/_other.fud');
    const diagnostics = (await service.provideDiagnostics?.(document, TOKEN)) ?? [];

    for (const diagnostic of diagnostics) {
      expect([1, 2, 3, 4]).toContain(diagnostic.severity);
    }
  });
});

describe('semantic tokens', () => {
  it('emits line, character, length and the legend index', async () => {
    const { service, document } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n@section nav {\n  <p>x</p>\n}\n<article>hi</article>\n`,
    );
    const tokens = await service.provideDocumentSemanticTokens?.(
      document,
      { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
      SEMANTIC_TOKENS_LEGEND,
      TOKEN,
    );

    expect(tokens?.length).toBe(1);
    const [line, character, length, type, modifiers] = tokens?.[0] ?? [];
    expect([line, character, length]).toEqual([1, 1, 'section'.length]);
    expect(type).toBe(SEMANTIC_TOKENS_LEGEND.tokenTypes.indexOf('fudDirective'));
    expect(modifiers).toBe(0);
  });
});

describe('code actions', () => {
  it('offers to create the file an href points at', async () => {
    const source = route('../layouts/_layout.fud', ['../components/ghost.fud']);
    const { service, document, cached } = setup(source);
    const at = cached.source.indexOf('../components/ghost.fud');
    const range = rangeOf(document, { start: at, end: at + 3 });

    const actions = await service.provideCodeActions?.(document, range, { diagnostics: [] }, TOKEN);

    expect(actions?.[0]?.title).toBe('Create ../components/ghost.fud');
    expect(actions?.[0]?.edit?.documentChanges?.[0]).toEqual({
      kind: 'create',
      uri: URI.file('/p/components/ghost.fud').toString(),
      options: { ignoreIfExists: true },
    });
  });

  it('offers nothing for a range that does not touch the href', async () => {
    const { service, document } = setup(
      route('../layouts/_layout.fud', ['../components/ghost.fud']),
    );
    const far = { start: { line: 4, character: 0 }, end: { line: 4, character: 1 } };

    expect(await service.provideCodeActions?.(document, far, { diagnostics: [] }, TOKEN)).toEqual(
      [],
    );
  });
});

describe('cancellation', () => {
  it('answers empty and counts the request as cancelled (§6.14)', async () => {
    const { service, document, position, stats } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<p>x</p>\n`,
    );

    expect(
      await service.provideCompletionItems?.(document, position, { triggerKind: 1 }, CANCELLED),
    ).toBeUndefined();
    expect(await service.provideDiagnostics?.(document, CANCELLED)).toBeUndefined();
    expect(await service.provideDefinition?.(document, position, CANCELLED)).toBeUndefined();
    expect([stats.completed, stats.cancelled]).toEqual([0, 3]);
  });
});
