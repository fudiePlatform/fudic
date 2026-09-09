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
import { clientFileName } from '@fudic/language-core';
import {
  component,
  LAYOUT,
  memoryFs,
  projectionService,
  propsComponent,
  route,
} from '../_support.js';
import { CANCELLED, fakeServiceContext, TOKEN } from '../_lsp.js';

const SLUG = '/p/blog/[slug].fud';
const URI_OF_SLUG = URI.file(SLUG).toString();

const LAYOUT_WITH_NAV = LAYOUT.replace('<main>', '<main>\n      @RenderSection(nav)');

/**
 * A route whose `@code` declares a form, with `markup` inside the `<form>` that opens its scope.
 *
 * The shapes are written out rather than imported: the corpus cannot reach `@fudic/forms`, and
 * what these tests measure is the SHAPE test — a control is callable and carries `set`/`touch`,
 * a form carries `$touch`/`$validate` — not the package that happens to satisfy it.
 */
const FORM_ROUTE = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
@code {
  type Control<T> = { (): T; set(v: T): void; touch(): void };
  type Group<S> = S & { $touch(): void; $validate(): Promise<boolean> };
  const userForm = {} as Group<{ alias: Control<string> }>;
  const alias = userForm.alias;
}

<article>
  <form control="@userForm">
    ${markup}
  </form>
</article>
`;

/** Set the service up over one `.fud`, whose cursor is where `|` was. */
function setup(
  source: string,
  path = SLUG,
  typescript = true,
  extra: Readonly<Record<string, string>> = {},
  /** Mount a real TypeScript over the projection, for the answers that depend on a type. */
  mountTypeScript = false,
) {
  const offset = source.indexOf('|');
  const text = source.replace('|', '');
  const files: Record<string, string> = {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/components/site-nav.fud': component('site-nav'),
    '/p/layouts/_layout.fud': LAYOUT_WITH_NAV,
    ...extra,
    [path]: text,
  };

  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const cached = new DocumentCache(index).get(path, 1, text);
  const document = TextDocument.create(URI.file(path).toString(), 'fud', 1, text);
  const stats = new RequestStats();
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path));
  const context = fakeServiceContext(
    { [URI.file(path).toString()]: cached },
    () => undefined,
    mountTypeScript && client !== undefined
      ? { 'typescript/languageService': projectionService(cached.path, client.text) }
      : {},
  );
  // `typescript` decides who answers at a `@` in markup and at a binding value: with it
  // mounted — the default — the list is TypeScript's and this service stays quiet, or the
  // developer sees every name twice. Pass `false` to measure what the root says on its own.
  const service = createFudicService({ index, stats, typescript }).create(context);
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

describe('completion — the dot and the at-sign (BUG-16 §6.10–§6.12)', () => {
  /** A route whose markup is `markup`, with `app-badge` linked. */
  const withBadge = (markup: string): string =>
    `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>${markup}</article>\n`;

  it.each([
    ['a property with no name yet', '<app-badge .|>'],
    ['a property being typed', '<app-badge .ton|>'],
    ['an event with no name yet', '<app-badge @|>'],
    ['an event being typed', '<app-badge @cli|>'],
  ])('says nothing at %s: the projection owns that list', async (_title, markup) => {
    const { service, document, position } = setup(withBadge(markup));

    // Silence is the answer. An item from this plugin would claim the position in Volar and
    // the projection — which is where the props and the DOM's events come from — would never
    // be asked.
    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('offers no Razor directive inside a tag: there a `@` is an event', async () => {
    const { service, document, position } = setup(withBadge('<app-badge @fore|>'));

    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('is the transition again outside the tag (§6.12)', async () => {
    // Measured with no TypeScript, which is where this service owns the answer. With it
    // mounted the very same list arrives from `ts-completion.ts` — the constructs, the scope
    // and the escape hatch in one reply — and this one stays quiet so nothing is said twice.
    const { service, document, position } = setup(
      withBadge('<app-badge></app-badge>\n@fore|'),
      SLUG,
      false,
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((item) => item.label)).toContain('@foreach');
  });

  it('and says nothing there with TypeScript mounted, rather than offering the tags', async () => {
    // `@fore` is a construct being written, not a tag. The directive branch declines because
    // TypeScript carries the list, and the position must not fall through to the word branch,
    // which answered it with every component of the workspace.
    const { service, document, position } = setup(withBadge('<app-badge></app-badge>\n@fore|'));

    expect(await completionsOf(service, document, position)).toBeUndefined();
  });
});

describe('a control header is not markup (BUG-17 §6.10–§6.13)', () => {
  /** A route whose `<article>` holds `markup`, with `app-badge` linked. */
  const inMarkup = (markup: string): string =>
    `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>\n  ${markup}\n</article>\n`;

  it.each([
    ['@if', '@if (us|) { <p>x</p> }'],
    ['an else-if arm', '@if (a) { <p>x</p> } else if (us|) { <p>y</p> }'],
    ['@switch', "@switch (us|) { case 'a': <p>x</p> default: <p>y</p> }"],
    ['@foreach', '@foreach (const item of us|) key (item.id) { <p>x</p> }'],
    ['@for', '@for (let i = 0; i < us|; i++) key (i) { <p>x</p> }'],
    ['@while', '@while (us|) key (1) { <p>x</p> }'],
    ['a key clause', '@foreach (const item of items) key (us|) { <p>x</p> }'],
  ])('offers nothing inside the parentheses of %s', async (_case, markup) => {
    const { service, document, position } = setup(inMarkup(markup));

    // The three voices at once: `us` is a word, so before the fix it drew the workspace tags,
    // the snippets and Emmet's `<us></us>`. Here the position is an expression, and the only
    // list that belongs to it is TypeScript's over the projection.
    expect(await completionsOf(service, document, position)).toBeUndefined();
  });

  it('merges the tags with Emmet again just past the `)` (§6.12)', async () => {
    const { service, document, position } = setup(inMarkup('@if (a) { ul>li| }'));
    const labels = (await completionsOf(service, document, position))?.items.map(
      (item) => item.label,
    );

    // Both voices, and in that order: the body of a branch is markup like any other.
    expect(labels).toContain('app-badge');
    expect(labels).toContain('ul>li');
  });

  it('is still the transition for a `@` in the body of a branch (§6.12)', async () => {
    // With no TypeScript, where this service owns the list; mounted, the same one arrives from
    // `ts-completion.ts`. What §6.12 pins either way is that the body of a branch is markup, so
    // a `@` there is the transition and not an event.
    const { service, document, position } = setup(inMarkup('@if (a) { @fore| }'), SLUG, false);
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((item) => item.label)).toContain('@foreach');
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

  it('adds the `class:` bindings beside HTML’s own list, in a NATIVE tag', async () => {
    // `class:red` is the grammar's, not a component's (decision 28), and a `<div>` was the one
    // place it could not be reached by asking: the list there is the HTML service's, which has
    // never heard of it. Additional, so HTML's 151 attributes stay and these go in front.
    const source = `<app-x>\n  <template shadowrootmode="open">\n    <style>\n      .red { color: red }\n    </style>\n    <div |></div>\n  </template>\n</app-x>\n`;
    const { tagService, document, position } = setup(source, '/p/comp.fud');
    const list = await completionsOf(tagService, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(['class:red']);
    expect(list?.items[0]?.sortText).toBe('0_red');
    // A binding with no expression is half of one, so accepting it writes the `=@` and asks
    // again — the same gesture a prop and an event make.
    expect(list?.items[0]?.textEdit?.newText).toBe('class:red=@');
    expect(list?.items[0]?.command?.command).toBe('editor.action.triggerSuggest');
  });

  it('and says nothing there in a file that declares no class at all', async () => {
    // `class:` with no name behind it completes nothing, and an item that inserts half a
    // binding is worse than no item.
    const { tagService, document, position } = setup(
      `<app-x>\n  <template shadowrootmode="open">\n    <div |></div>\n  </template>\n</app-x>\n`,
      '/p/comp.fud',
    );

    expect(await completionsOf(tagService, document, position)).toBeUndefined();
  });

  it('offers the names in scope inside a plain attribute’s value, each writing its `@`', async () => {
    // Any attribute takes a binding — `role="@data.title"` — and nothing said so: the names
    // appeared only once the `@` was typed, so the author had to know the answer to ask.
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n@code {\n  @client {\n    const titulo = 1;\n  }\n}\n<article>\n  <div role="|"></div>\n</article>\n`;
    const { tagService, document, position } = setup(source);
    const list = await completionsOf(tagService, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(
      expect.arrayContaining(['@titulo', '@()']),
    );
    // The `@` is written by the item, not typed by the author: it is not in the range.
    const titulo = list?.items.find((item) => item.label === '@titulo');
    expect(titulo?.textEdit?.newText).toBe('@titulo');
    expect(titulo?.filterText).toBe('titulo');
  });

  it('and offers none of them in a LAYOUT, which interpolates nothing at all', async () => {
    // No `@code` (`FUD0437`) and no `load`, so there is no name a `@` could reach — `@()`
    // included. An empty list rather than a wrong one, and the position travels on.
    const { tagService, document, position } = setup(
      LAYOUT_WITH_NAV.replace('<main>', '<main><div role="|"></div>'),
      '/p/layouts/_other.fud',
    );

    expect(await completionsOf(tagService, document, position)).toBeUndefined();
  });

  it('but not inside the `href` of a `<link>`, whose list is a closed set of paths', async () => {
    // An `href` is a PATH the build resolves: an interpolation there cannot be followed to a
    // file, and offering the template's names is offering a way to write what never resolves.
    const source = `<link rel="component" href="|">\n<article>hi</article>\n`;
    const { tagService, document, position } = setup(source);

    expect(await completionsOf(tagService, document, position)).toBeUndefined();
  });

  it('and declines a value the author opened with a `.`, which is FUD0056', async () => {
    // This plugin is ADDITIONAL, so nothing silences it for us: it has to decline itself, or
    // it fills a position the compiler is reporting an error on.
    const { tagService, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article><app-badge .name=.|></article>\n`,
    );

    expect(await completionsOf(tagService, document, position)).toBeUndefined();
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

  // BUG-23 criterion 21.b. An empty element is not what the author wants written: they want
  // the tag AND the props it cannot do without, in the order the child declares them.
  describe('the tag expands with its required props (criterion 21.b)', () => {
    const BUTTON = '/p/components/app-button.fud';
    const withButton = (type: string, pattern = '{ label, tone }'): Record<string, string> => ({
      [BUTTON]: propsComponent('app-button', pattern, type),
    });

    it('one tabstop per required prop, none for the optional ones', async () => {
      const { service, document, position } = setup(
        `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  app-but|\n</article>\n`,
        SLUG,
        true,
        withButton('{ label: string; tone?: string }'),
      );
      const list = await completionsOf(service, document, position);

      // No quotes: what follows a `.prop=` is whatever is assignable to it — a bare scalar
      // (decision 105), an `@` expression (103), a quoted string — and picking one of the three
      // for the author is picking wrong two times out of three.
      expect(item(list, 'app-button')?.textEdit?.newText).toBe(
        '<app-button .label=$1>$0</app-button>',
      );
      // And the list opens on the first one: the caret lands there and there is nothing else
      // the author can be about to do.
      expect(item(list, 'app-button')?.command?.command).toBe('editor.action.triggerSuggest');
    });

    it('a component with no required props expands exactly as it did before', async () => {
      const { service, document, position } = setup(
        `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  app-but|\n</article>\n`,
        SLUG,
        true,
        withButton('{ label?: string; tone?: string }', '{ label, tone }'),
      );
      const list = await completionsOf(service, document, position);

      expect(item(list, 'app-button')?.textEdit?.newText).toBe('<app-button>$0</app-button>');
    });

    it('a named type proves nothing, so it degrades to the plain element', async () => {
      const { service, document, position } = setup(
        `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  app-but|\n</article>\n`,
        SLUG,
        true,
        withButton('Props', '{ label }'),
      );
      const list = await completionsOf(service, document, position);

      expect(item(list, 'app-button')?.textEdit?.newText).toBe('<app-button>$0</app-button>');
    });
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
    // Measured with no TypeScript, where the root owns the list. With it mounted the same
    // snippets ride inside TypeScript's reply — one voice per position — and the acceptance
    // suite measures that stack whole (BUG-23 §2.5).
    const { service, document, position } = setup(
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  @|\n</article>\n`,
      SLUG,
      false,
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((entry) => entry.label)).toContain('@foreach');
    expect(list?.items.map((entry) => entry.label)).not.toContain('@RenderBody');
    expect(item(list, '@if')?.textEdit?.newText).toBe('@if (${1:condition}) {\n  $0\n}');
    expect(item(list, '@if')?.insertTextFormat).toBe(2);
  });

  it('a `delegate:` offers the bindings of the loop it is written in (SDD-37 §6.19)', async () => {
    const { service, document, position } = setup(
      '<app-x>\n  <template shadowrootmode="open">\n' +
        '    <div @click="@pick($event, $day)">\n' +
        '      @foreach (const day of days) key (day.id) {\n' +
        '        <b delegate:|></b>\n' +
        '      }\n' +
        '    </div>\n  </template>\n</app-x>\n',
      '/p/comp.fud',
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((entry) => entry.label)).toEqual(['day']);
    // No `=@`, and no second list: a marker takes no value (decision 116).
    expect(list?.items[0]?.textEdit?.newText).toBe('day');
    expect(list?.items[0]?.command).toBeUndefined();
  });

  it('a `delegate:` offers every enclosing header, outermost first', async () => {
    const { service, document, position } = setup(
      '<app-x>\n  <template shadowrootmode="open">\n' +
        '    <div @click="@pick($row, $tag)">\n' +
        '      @foreach (const row of rows) key (row.id) {\n' +
        '        @foreach (const tag of row.tags) key (tag.id) {\n' +
        '          <b delegate:|></b>\n' +
        '        }\n' +
        '      }\n' +
        '    </div>\n  </template>\n</app-x>\n',
      '/p/comp.fud',
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((entry) => entry.label)).toEqual(['row', 'tag']);
  });

  it('a `delegate:` offers ITS loop and not the one next to it', async () => {
    const { service, document, position } = setup(
      '<app-x>\n  <template shadowrootmode="open">\n' +
        '    <div @click="@pick($day)">\n' +
        '      @foreach (const other of xs) key (other.id) { <i>@other.n</i> }\n' +
        '      @foreach (const day of days) key (day.id) { <b delegate:|></b> }\n' +
        '    </div>\n  </template>\n</app-x>\n',
      '/p/comp.fud',
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.map((entry) => entry.label)).toEqual(['day']);
  });

  it('offers the marker at a GAP too, whole and with no `=@` to finish', async () => {
    const { tagService, document, position } = setup(
      '<app-x>\n  <template shadowrootmode="open">\n' +
        '    <div @click="@pick($day)">\n' +
        '      @foreach (const day of days) key (day.id) { <b |></b> }\n' +
        '    </div>\n  </template>\n</app-x>\n',
      '/p/comp.fud',
    );
    const list = await completionsOf(tagService, document, position);

    expect(list?.items.map((entry) => entry.label)).toEqual(['delegate:day']);
    // A marker is not half a binding: there is no `=@` to write and nothing left to ask.
    expect(list?.items[0]?.textEdit?.newText).toBe('delegate:day');
    expect(list?.items[0]?.command).toBeUndefined();
  });

  it('and offers no marker at a gap outside every loop', async () => {
    const { tagService, document, position } = setup(
      '<app-x>\n  <template shadowrootmode="open">\n    <b |></b>\n  </template>\n</app-x>\n',
      '/p/comp.fud',
    );

    expect(await completionsOf(tagService, document, position)).toBeUndefined();
  });

  it('a `delegate:` outside every loop says nothing, and does not silence Emmet', async () => {
    const { service, document, position } = setup(
      '<app-x>\n  <template shadowrootmode="open">\n    <b delegate:|></b>\n  </template>\n</app-x>\n',
      '/p/comp.fud',
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.some((entry) => entry.detail === 'binding of the loop')).not.toBe(true);
  });

  it('says nothing inside a plain `class` when the file declares none', async () => {
    // The same condition the `class:` branch has: a file with no `<style>` has nothing to say,
    // and an empty list would silence Emmet without putting anything in its place (§4.3).
    const { service, document, position } = setup(
      `<app-x>\n  <template shadowrootmode="open">\n    <div class="re|"></div>\n  </template>\n</app-x>\n`,
      '/p/comp.fud',
    );
    const list = await completionsOf(service, document, position);

    expect(list?.items.some((item) => item.detail === 'class of this file')).not.toBe(true);
  });

  it('and in a layout it offers @RenderBody instead of @section', async () => {
    const { service, document, position } = setup(
      LAYOUT_WITH_NAV.replace('<main>', '<main>@|'),
      '/p/layouts/_other.fud',
      false,
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

    // `@section` is two tokens: the marker, then the keyword right after it.
    expect(tokens?.length).toBe(2);
    const [atLine, atCharacter, atLength, atType] = tokens?.[0] ?? [];
    expect([atLine, atCharacter, atLength]).toEqual([1, 0, 1]);
    expect(atType).toBe(SEMANTIC_TOKENS_LEGEND.tokenTypes.indexOf('fudAt'));

    const [line, character, length, type, modifiers] = tokens?.[1] ?? [];
    expect([line, character, length]).toEqual([1, 1, 'section'.length]);
    expect(type).toBe(SEMANTIC_TOKENS_LEGEND.tokenTypes.indexOf('fudDirective'));
    expect(modifiers).toBe(0);
  });
});

describe('hover', () => {
  it('shows the contract of the component under the pointer (SDD-36 §3.2)', async () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<app-badge></app-badge>\n`;
    const { service, document, cached } = setup(source);
    const at = document.positionAt(cached.source.indexOf('<app-badge') + 1);

    const hover = await service.provideHover?.(document, at, TOKEN);

    expect(String((hover?.contents as { value: string }).value)).toContain(
      '**`<app-badge>`** · fudic component',
    );
    // Underlines the NAME, not the whole tag: that is the stretch the answer is about.
    const name = cached.source.indexOf('app-badge');
    expect(hover?.range).toEqual(rangeOf(document, { start: name, end: name + 'app-badge'.length }));
  });

  it('says nothing over a native element or a document that is not ours', async () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<div></div>\n`;
    const { service, document, cached } = setup(source);
    const at = document.positionAt(cached.source.indexOf('<div') + 1);
    const other = TextDocument.create('file:///p/data/posts.ts', 'typescript', 1, 'export {};');

    expect(await service.provideHover?.(document, at, TOKEN)).toBeUndefined();
    expect(await service.provideHover?.(other, at, TOKEN)).toBeUndefined();
  });
});

/**
 * `control`, the one attribute name no other voice can explain (SDD-34, decision 109).
 *
 * It is not HTML's, so the HTML service has never heard of it, and it is not a prop, so the
 * projection has no member to hover. And the six characters mean three different things
 * depending on the tag under them — which is exactly the fact an author cannot read off the
 * source, and therefore the one worth saying.
 */
describe('hover over a `control`', () => {
  /** The card two characters into the `control` written on `tag`. */
  const cardAt = async (markup: string, tag: string) => {
    const source = FORM_ROUTE(markup);
    const { service, document, cached } = setup(source);
    const at = cached.source.indexOf('control', cached.source.indexOf(`<${tag}`)) + 2;

    const hover = await service.provideHover?.(document, document.positionAt(at), TOKEN);
    return String((hover?.contents as { value: string } | undefined)?.value ?? '');
  };

  it('says «form» over a `<form>` and «control» over a field', async () => {
    expect(await cardAt('<input control="@userForm.alias">', 'form')).toContain(
      'Enlaza este `<form>` con el formulario',
    );
    expect(await cardAt('<input control="@userForm.alias">', 'input')).toContain(
      'Enlaza este campo con un control del formulario',
    );
  });

  it('says «group» over anything that groups part of the form', async () => {
    expect(await cardAt('<div control="@userForm"><input></div>', 'div')).toContain(
      'Agrupa parte del formulario',
    );
  });

  it('and points at the child’s own contract over a component tag (decision 112)', async () => {
    // The honest answer: what fits is whatever the `ctrl` the component declared takes, and
    // this server has not read it.
    expect(await cardAt('<app-badge control="@userForm.alias"></app-badge>', 'app-badge')).toContain(
      'Cruza el nodo al componente por su prop `ctrl`',
    );
  });

  it('underlines the name and nothing else', async () => {
    const source = FORM_ROUTE('<input control="@userForm.alias">');
    const { service, document, cached } = setup(source);
    const name = cached.source.indexOf('control', cached.source.indexOf('<input'));

    const hover = await service.provideHover?.(document, document.positionAt(name + 2), TOKEN);

    expect(hover?.range).toEqual(rangeOf(document, { start: name, end: name + 'control'.length }));
  });

  it('says nothing over an element that can make nothing of one', async () => {
    // `<input type="submit">` is `FUD0592`: there is no kind to name, so there is no card.
    const card = await cardAt('<input type="submit" control="@userForm.alias">', 'input');

    expect(card).toBe('');
  });
});

/**
 * `control` on a NATIVE tag, which is the half of SDD-34 no other voice can answer.
 *
 * The attribute is not HTML's, so the HTML service has never heard of it; it is not a prop, so
 * no `$gap` carries it; and unlike `class:` it does not even announce itself with a prefix a
 * developer could guess at. Inside a form it is the reason the element is being written.
 */
describe('the `control` of a native tag', () => {
  const inForm = (markup: string, mountTypeScript = false) =>
    setup(FORM_ROUTE(markup), SLUG, true, {}, mountTypeScript);

  it('offers the attribute at a gap, saying what this element takes', async () => {
    const { tagService, document, position } = inForm('<input |>');
    const list = await completionsOf(tagService, document, position);
    const control = list?.items.find((item) => item.label === 'control');

    expect(control?.detail).toBe('control of the form');
    // `control=@` and ask again: the value is a node, and the list of nodes is the other half.
    expect(control?.textEdit?.newText).toBe('control=@');
    expect(control?.sortText).toBe('0_control');
    // Ahead of the classes, which is the other voice that merges into HTML's list here.
    expect(list?.items[0]?.label).toBe('control');
  });

  it('and never outside a form, where it would be `FUD0595`', async () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<article><input |></article>\n`;
    const { tagService, document, position } = setup(source);
    const list = await completionsOf(tagService, document, position);

    expect((list?.items ?? []).map((item) => item.label)).not.toContain('control');
  });

  it('offers the nodes right of the `=`, each item writing its own `@`', async () => {
    const { tagService, document, position } = inForm('<input control=|>', true);
    const list = await completionsOf(tagService, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(['@userForm', '@alias']);
    expect(list?.items.map((item) => item.detail)).toEqual(['form node', 'control']);
    // The bare name is what the editor filters on, so typing `ali` still finds `@alias`.
    expect(list?.items[1]?.filterText).toBe('alias');
    // Incomplete: a group is almost always reached THROUGH, so the next list is asked for
    // without a keystroke.
    expect(list?.isIncomplete).toBe(true);
  });

  it('offers on a `<form>` only what a form takes', async () => {
    const { tagService, document, position } = inForm('<form control=|></form>', true);
    const list = await completionsOf(tagService, document, position);

    expect(list?.items.map((item) => item.label)).toEqual(['@userForm']);
  });

  it('says nothing there when the checker cannot answer', async () => {
    // Nothing rather than an empty list: a widget that is up swallows the next Tab. With no
    // TypeScript mounted the position falls back to the names the template can see.
    const { tagService, document, position } = inForm('<input control=|>');
    const list = await completionsOf(tagService, document, position);

    expect((list?.items ?? []).map((item) => item.label)).not.toContain('@userForm');
  });

  it('says nothing there on an element that can make nothing of a control', async () => {
    const { tagService, document, position } = inForm('<input type="submit" control=|>', true);
    const list = await completionsOf(tagService, document, position);

    expect((list?.items ?? []).map((item) => item.label)).not.toContain('@userForm');
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

  /**
   * SDD-36 §3.1 — the table.
   *
   * Every one of these asks over the WHOLE document, which is the shape that matters: a bulb
   * is offered because a diagnostic is there, so a range that covers the file has to find it
   * and a file with nothing wrong has to come back empty.
   */
  /** Every action offered anywhere in `source`, with `source` written into the slug. */
  const fixesIn = async (
    source: string,
    extra: Readonly<Record<string, string>> = {},
    mountTypeScript = false,
  ) => {
    const { service, document } = setup(source, SLUG, true, extra, mountTypeScript);
    const whole = {
      start: { line: 0, character: 0 },
      end: { line: source.split('\n').length, character: 0 },
    };
    return (await service.provideCodeActions?.(document, whole, { diagnostics: [] }, TOKEN)) ?? [];
  };

  /** The single text edit an action makes on the file being edited. */
  const edit = (action: { edit?: { changes?: Record<string, unknown> } } | undefined) =>
    (Object.values(action?.edit?.changes ?? {})[0] as { newText: string }[] | undefined)?.[0];

  /**
   * The `control` bulb (SDD-34, decision 115).
   *
   * Not a repair of a diagnostic: nothing is wrong with a field that names no node, it is
   * unfinished. What it answers is «what is missing», which needs the whole tree — the `<form>`
   * above says which form the field belongs to, and its fields are the offers.
   */
  describe('the bulb that binds a field', () => {
    const bulbsIn = async (markup: string) =>
      (await fixesIn(FORM_ROUTE(markup), {}, true))
        .map((action) => action.title)
        .filter((title) => title.startsWith('Enlazar'));

    it('offers the fields of the form above, through the very path the author wrote', async () => {
      // `@userForm.alias` and not `alias`: the path a repair writes is the path they would
      // have written, which is why the owner travels as TEXT and not as a type.
      expect(await bulbsIn('<input>')).toEqual(['Enlazar control=@userForm.alias']);
    });

    it('writes the binding just past the tag name', async () => {
      const actions = await fixesIn(FORM_ROUTE('<input id="a">'), {}, true);
      const bind = actions.find((action) => action.title === 'Enlazar control=@userForm.alias');

      expect(edit(bind)?.newText).toBe(' control=@userForm.alias');
    });

    it('offers the form itself on a `<form>` that opens none yet', async () => {
      // With no form above, the element IS the one that opens the scope, and the candidates
      // are the nodes the file's `@code` declares.
      const source = `<link rel="layout" href="../layouts/_layout.fud">
@code {
  type Control<T> = { (): T; set(v: T): void; touch(): void };
  type Group<S> = S & { $touch(): void; $validate(): Promise<boolean> };
  const userForm = {} as Group<{ alias: Control<string> }>;
}

<article><form><input></form></article>
`;
      const titles = (await fixesIn(source, {}, true))
        .map((action) => action.title)
        .filter((title) => title.startsWith('Enlazar'));

      // The `<form>` takes the form; the `<input>` under it has no owner yet, and a leaf is
      // not what a form's own scope offers it.
      expect(titles).toEqual(['Enlazar control=@userForm']);
    });

    it('never offers a path the file already binds', async () => {
      // A field bound three lines up is not a repair, it is a duplicate — and both spellings
      // of one path count as the one binding they are.
      expect(await bulbsIn('<input control="@userForm.alias"><input>')).toEqual([]);
    });

    it('offers nothing where the element takes nothing', async () => {
      expect(await bulbsIn('<input type="submit">')).toEqual([]);
    });

    it('offers nothing when no TypeScript is mounted to say what a node is', async () => {
      const titles = (await fixesIn(FORM_ROUTE('<input>')))
        .map((action) => action.title)
        .filter((title) => title.startsWith('Enlazar'));

      expect(titles).toEqual([]);
    });

    it('offers nothing for a range that does not reach the element', async () => {
      // A bulb belongs to the tag it would edit: asked over the `<link>` line, the fields three
      // lines down are not what the developer is looking at.
      const source = FORM_ROUTE('<input>');
      const { service, document } = setup(source, SLUG, true, {}, true);
      const firstLine = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };

      const actions =
        (await service.provideCodeActions?.(document, firstLine, { diagnostics: [] }, TOKEN)) ?? [];

      expect(actions.map((action) => action.title)).toEqual([]);
    });

    it('offers nothing in a LAYOUT, whose template the projection does not carry', async () => {
      // A layout has no `@code` (`FUD0437`), so there is no node to name — and the value of its
      // `control` is not in the projection either, so the fields of the form above cannot be
      // read. Both roads end in the same silence.
      const layout = LAYOUT_WITH_NAV.replace(
        '<main>',
        '<main>\n      <form control="@userForm"><input></form>',
      );
      const { service, document } = setup(layout, '/p/layouts/_other.fud', true, {}, true);
      const whole = {
        start: { line: 0, character: 0 },
        end: { line: layout.split('\n').length, character: 0 },
      };

      const actions =
        (await service.provideCodeActions?.(document, whole, { diagnostics: [] }, TOKEN)) ?? [];

      expect(actions.map((action) => action.title).filter((t) => t.startsWith('Enlazar'))).toEqual(
        [],
      );
    });
  });

  describe('the repairs of SDD-36', () => {
    it('quotes an unquoted value (FUD0056)', async () => {
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n<div title=hola></div>\n`,
      );
      const quote = actions.find((action) => action.title === 'Entrecomillar el valor');

      expect(quote).toBeDefined();
      expect(edit(quote)?.newText).toBe('"hola"');
    });

    it('adds the <link> of a component the file writes without declaring (FUD0191)', async () => {
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n<app-badge></app-badge>\n`,
      );
      const link = actions.find((action) => action.title.startsWith('Añadir <link'));

      expect(link?.title).toBe('Añadir <link rel="component"> de <app-badge>');
      // The very edit `linkInsertionFor` writes, which is what the tag completion uses.
      expect(edit(link)?.newText).toContain('<link rel="component" href="../components/app-badge.fud">');
    });

    it('adds the key of a loop that renders markup (FUD0540)', async () => {
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n@foreach (const item of data.xs) {\n  <p>x</p>\n}\n`,
      );
      const key = actions.find((action) => action.title.startsWith('Añadir key'));

      expect(key?.title).toBe('Añadir key (item)');
      expect(edit(key)?.newText).toBe(' key (item)');
    });

    it('uses the FIRST binding of a destructuring header', async () => {
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n@foreach (const { id, tag } of data.xs) {\n  <p>x</p>\n}\n`,
      );

      expect(actions.find((action) => action.title.startsWith('Añadir key'))?.title).toBe(
        'Añadir key (id)',
      );
    });

    it('offers no key where the header declares no binding', async () => {
      // `FUD0543` owns that case and says something else; writing `key ()` would trade one
      // diagnostic for another.
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n@foreach (x of data.xs) {\n  <p>x</p>\n}\n`,
      );

      expect(actions.filter((action) => action.title.startsWith('Añadir key'))).toEqual([]);
    });

    it('does not quote a value that already carries a quote', async () => {
      // `title=a"b` is unquoted AND has a quote in it, so wrapping it in a pair produces a
      // value that ends where the author did not mean it to. The compiler is right to complain
      // and there is no repair that is certainly what was wanted.
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n<div title=a"b></div>\n`,
      );

      expect(actions.filter((action) => action.title === 'Entrecomillar el valor')).toEqual([]);
    });

    it('does not mistake a longer tag for the one it starts with', async () => {
      // `<app-badge-large>` opens a component of its own, not `app-badge`. Without the boundary
      // the repair would add the link of a component the author never wrote.
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n<app-badge-large></app-badge-large>\n`,
      );

      expect(actions.filter((action) => action.title.startsWith('Añadir <link'))).toEqual([]);
    });

    it('offers no link for a tag the workspace does not have', async () => {
      // The href is never guessed. A component the index has not seen has no path to point at,
      // and inventing one writes a `<link>` that will not resolve — trading `FUD0191` for
      // `FUD0460`.
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n<app-ghost></app-ghost>\n`,
      );

      expect(actions.filter((action) => action.title.startsWith('Añadir <link'))).toEqual([]);
    });

    it('offers no key where Oxc could not read the header', async () => {
      // Half a header is what every keystroke of writing one looks like. No statement comes
      // back, so there is no binding to name, and asking is still safe.
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n@foreach (const of) {\n  <p>x</p>\n}\n`,
      );

      expect(actions.filter((action) => action.title.startsWith('Añadir key'))).toEqual([]);
    });

    it('offers nothing for a repairable diagnostic outside the range asked about', async () => {
      // The bulb belongs to the line the caret is on, not to the file. A quick fix list that
      // answers about the whole document is a list nobody can read.
      const source = `<link rel="layout" href="../layouts/_layout.fud">\n<div title=hola></div>\n<p>x</p>\n`;
      const { service, document } = setup(source);
      const elsewhere = { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } };

      expect(
        await service.provideCodeActions?.(document, elsewhere, { diagnostics: [] }, TOKEN),
      ).toEqual([]);
    });

    it('offers nothing at all on a healthy file', async () => {
      expect(await fixesIn(`<link rel="layout" href="../layouts/_layout.fud">\n<p>x</p>\n`)).toEqual(
        [],
      );
    });
  });

  /**
   * The three repairs of the component contract (SDD-36 §3.1).
   *
   * Anchored on a fact and not on a diagnostic of ours: TypeScript reports all three over the
   * projection and offers no quick fix for any of them, so the voice is its and the hands are
   * here. No program is mounted in this file, which is also the degraded case — with no types
   * the shape of a hole falls back to `""`.
   */
  describe('the repairs of the contract', () => {
    /** A component with two required props, one optional, and a named slot. */
    const INPUT =
      `@code {\n  const { id, name, hint = '' } = props<{ id: number; name: string; hint?: string }>();\n}\n` +
      `<app-input>\n  <template shadowrootmode="open"><slot name="icon"></slot></template>\n</app-input>\n`;

    /** A component that declares a prop and no slot at all. */
    const BARE =
      `@code {\n  const { tone = '' } = props<{ tone?: string }>();\n}\n` +
      `<app-bare>\n  <template shadowrootmode="open"><slot></slot></template>\n</app-bare>\n`;

    const WORKSPACE = { '/p/components/app-input.fud': INPUT, '/p/components/app-bare.fud': BARE };

    /** A page that links both components, with `markup` in its body. */
    const page = (markup: string): string =>
      `<link rel="layout" href="../layouts/_layout.fud">\n` +
      `<link rel="component" href="../components/app-input.fud">\n` +
      `<link rel="component" href="../components/app-bare.fud">\n${markup}\n`;

    const contractFixesIn = (markup: string) => fixesIn(page(markup), WORKSPACE);

    const titled = <T extends { title: string }>(actions: readonly T[], prefix: string): T[] =>
      actions.filter((action) => action.title.startsWith(prefix));

    it('completes the required props a tag passes none of', async () => {
      const actions = await contractFixesIn('<app-input></app-input>');
      const fix = titled(actions, 'Completar')[0];

      expect(fix?.title).toBe('Completar las props requeridas de <app-input>');
      // One insertion and not two: two zero-length edits at one offset are two a client may
      // order either way. The optional `hint` is not in it — only what is required.
      expect(edit(fix)?.newText).toBe(' .id="" .name=""');
    });

    it('fills a required prop written with an empty value, in place', async () => {
      // `.id=""` is the state a tag is in halfway through being typed, and the checker sees a
      // string where a value should be. The repair replaces that attribute rather than adding
      // a second one beside it.
      const actions = await contractFixesIn('<app-input .id="" .name="n"></app-input>');

      expect(edit(titled(actions, 'Completar')[0])?.newText).toBe('.id=""');
    });

    it('sorts a replacement and an insertion into source order', async () => {
      // `.id` is written empty and `.name` is absent, so the fix carries two edits: one over
      // the attribute and one at the `>`. They may not overlap and they may not arrive out of
      // order — a client is entitled to refuse a set that does.
      const actions = await contractFixesIn('<app-input .id=""></app-input>');
      const edits = Object.values(titled(actions, 'Completar')[0]?.edit?.changes ?? {})[0] as
        | { newText: string }[]
        | undefined;

      expect(edits?.map((one) => one.newText)).toEqual(['.id=""', ' .name=""']);
    });

    it('inserts before the slash of a self-closing tag', async () => {
      const actions = await contractFixesIn('<app-input/>');

      expect(edit(titled(actions, 'Completar')[0])?.newText).toBe(' .id="" .name=""');
    });

    it('says nothing about a tag that passes everything it must', async () => {
      expect(await contractFixesIn('<app-input .id="1" .name="n"></app-input>')).toEqual([]);
    });

    it('does not offer a prop the tag already spells but the parse could not read', async () => {
      // `<app-input .id= .name=>` reads as ONE unquoted value that swallows the second name, so
      // `name` is absent from the attributes and present in the text. Inserting it would write
      // the attribute twice.
      const actions = await contractFixesIn('<app-input .id= .name=></app-input>');

      expect(edit(titled(actions, 'Completar')[0])?.newText).not.toContain('.name');
    });

    it('renames a prop the component does not declare', async () => {
      const actions = await contractFixesIn('<app-input .idd="1" .name="n"></app-input>');
      const fix = titled(actions, 'Cambiar a .')[0];

      expect(fix?.title).toBe('Cambiar a .id');
      expect(edit(fix)?.newText).toBe('.id');
    });

    it('suggests nothing when no declared name is close enough', async () => {
      // A repair the author has to think about is worse than none: this is a bulb, and what it
      // offers has to be obviously right.
      const actions = await contractFixesIn('<app-input .zzzzzz="1"></app-input>');

      expect(titled(actions, 'Cambiar a .')).toEqual([]);
    });

    it('never suggests a name the tag already carries', async () => {
      // Renaming `.nam` to a `.name` that is right there trades one error for a duplicate.
      const actions = await contractFixesIn('<app-input .id="1" .name="n" .nam="x"></app-input>');

      expect(titled(actions, 'Cambiar a .')).toEqual([]);
    });

    it('ignores a bare `.`, which names no prop at all', async () => {
      const actions = await contractFixesIn('<app-input .="1" .id="1" .name="n"></app-input>');

      expect(titled(actions, 'Cambiar a .')).toEqual([]);
    });

    it('ignores an attribute whose NAME is an expression', async () => {
      // `bus:( … )` names its event with an expression (decision 28.b), so the name is a node
      // and not a string. It is not a `.prop` and there is nothing about it to suggest.
      const actions = await contractFixesIn(
        '<app-input .id="1" .name="n" bus:(EVENTS.cart)="@h"></app-input>',
      );

      expect(titled(actions, 'Cambiar a .')).toEqual([]);
    });

    it('suggests nothing once every declared prop is already written', async () => {
      // There is no name left to rename TO. Offering one that is already on the tag would
      // trade an unknown prop for a duplicate attribute.
      const actions = await contractFixesIn(
        '<app-input .id="1" .name="n" .hint="h" .xxx="1"></app-input>',
      );

      expect(titled(actions, 'Cambiar a .')).toEqual([]);
    });

    it('renames a slot to each one the host declares', async () => {
      const actions = await contractFixesIn(
        '<app-input .id="1" .name="n"><div slot="PEPITO"></div></app-input>',
      );
      const fix = titled(actions, 'Cambiar a slot')[0];

      expect(fix?.title).toBe('Cambiar a slot="icon"');
      expect(edit(fix)?.newText).toBe('icon');
    });

    it('removes the slot when the host declares none to rename it to', async () => {
      const actions = await contractFixesIn('<app-bare><div slot="PEPITO"></div></app-bare>');
      const fix = titled(actions, 'Quitar slot')[0];

      expect(fix?.title).toBe('Quitar slot="PEPITO"');
      // The whitespace before it goes too, or the tag keeps a gap where the attribute was.
      expect(edit(fix)?.newText).toBe('');
    });

    it('says nothing about a slot the host does declare', async () => {
      const actions = await contractFixesIn(
        '<app-input .id="1" .name="n"><div slot="icon"></div></app-input>',
      );

      expect(titled(actions, 'Cambiar a slot')).toEqual([]);
      expect(titled(actions, 'Quitar slot')).toEqual([]);
    });

    it('says nothing about a slot whose name is not a literal', async () => {
      // `slot="@(x)"` names a slot whose identity is not known until it runs, and a repair
      // cannot rename what it cannot read. An empty `slot=""` names none either.
      const actions = await contractFixesIn(
        '<app-input .id="1" .name="n"><div slot="@(1)"></div><b slot=""></b></app-input>',
      );

      expect(titled(actions, 'Cambiar a slot')).toEqual([]);
      expect(titled(actions, 'Quitar slot')).toEqual([]);
    });

    it('says nothing about a slot with no component parent', async () => {
      // The host has to be a component for its slots to be a question at all.
      expect(await contractFixesIn('<div slot="PEPITO"></div>')).toEqual([]);
    });

    it('says nothing about a tag the file does not link', async () => {
      // With no `<link>` there is no contract to compare against, and `FUD0191` already owns
      // that mistake with a bulb of its own.
      const actions = await fixesIn(
        `<link rel="layout" href="../layouts/_layout.fud">\n<app-input></app-input>\n`,
        WORKSPACE,
      );

      expect(titled(actions, 'Completar')).toEqual([]);
    });

    it('offers nothing for a contract mistake outside the range asked about', async () => {
      // The bulb belongs to the line the caret is on. Every other repair is filtered by range
      // and so is this one — the tag is on line 3 and the question is about line 4.
      const source = page('<app-input></app-input>\n<p>x</p>');
      const { service, document } = setup(source, SLUG, true, WORKSPACE);
      const elsewhere = { start: { line: 4, character: 0 }, end: { line: 4, character: 1 } };

      expect(
        await service.provideCodeActions?.(document, elsewhere, { diagnostics: [] }, TOKEN),
      ).toEqual([]);
    });

    it('says nothing about a component’s own host wrapper', async () => {
      // A component's markup IS its own tag (decision 75). Nobody passes props to it there.
      const actions = await fixesIn(INPUT, WORKSPACE);

      expect(titled(actions, 'Completar')).toEqual([]);
    });
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
