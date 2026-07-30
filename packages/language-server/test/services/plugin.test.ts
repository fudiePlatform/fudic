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
import { createFudicService, fudicDocumentOf, rangeOf } from '../../src/services/plugin.js';
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

  return {
    service,
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

  it('offers the declared tags after `<`, ahead of the native ones (§6.4)', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article><|</article>\n`,
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(['app-badge']);
    expect(list?.items[0]?.sortText).toBe('0_app-badge');
    expect(list?.items[0]?.labelDetails?.description).toBe('fudic component');
  });

  it('says nothing where none of the three contexts apply', async () => {
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>plain |text</article>\n`,
    );

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

describe('documents that are not ours', () => {
  it('answers nothing for another language', async () => {
    const { service, context, position } = setup(`<p>x</p>\n`);
    const other = TextDocument.create('file:///p/data/posts.ts', 'typescript', 1, 'export {};');

    expect(fudicDocumentOf(context, other)).toBeUndefined();
    expect(await completionsOf(service, other, position)).toBeUndefined();
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
  });

  it('answers nothing for a .fud the language has never seen', async () => {
    const { service, position } = setup(`<p>x</p>\n`);
    const unknown = TextDocument.create('file:///p/other.fud', 'fud', 1, '<p>x</p>');

    expect(await completionsOf(service, unknown, position)).toBeUndefined();
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
    expect([stats.completed, stats.cancelled]).toEqual([0, 2]);
  });
});
