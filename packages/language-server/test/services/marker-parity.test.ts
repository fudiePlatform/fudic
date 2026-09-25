/**
 * BUG-42 §6.D, criteria 25–31 — `error` and `summary` have the same half of editor `control`
 * has, and `fields` is offered and explained beside a summary.
 *
 * Criterion 31 is a TABLE and not a test per service: for each of the three attributes, the four
 * voices of BUG-42 §2.1 — the offer at a gap, the list of its value, the hover of its name and
 * the type of its value — answer. It is the check that would have caught the hole BUG-41's
 * criterion 19 let through: `error` compiled, projected and type-checked, and was offered nowhere.
 */

import { describe, expect, it } from 'vitest';
import type { CompletionItem, CompletionList } from '@volar/language-service';
import { CompletionItemKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { documentRoots, walk, type ElementNode } from '@fudic/compiler';
import { clientFileName, mapToGenerated } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { RequestStats } from '../../src/stats.js';
import { createFudicService, createFudicTagService } from '../../src/services/plugin.js';
import { filterTypeScriptCompletions } from '../../src/services/ts-completion.js';
import { formAttributeOffers, summaryNodesOf } from '../../src/services/forms.js';
import { CLIENT_CODE_ID } from '../../src/virtual-code.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { component, LAYOUT, memoryFs, projectionService } from '../_support.js';

const PATH = '/p/pages/index.fud';

/** The form of BUG-42 §0.1, as shapes: the corpus cannot reach `@fudic/forms`. */
const formPage = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
@code {
  type Control<T> = { (): T; set(v: T): void; touch(): void };
  type Group<S> = S & { $touch(): void; $validate(): Promise<boolean>; $valid(): boolean; $errors(): unknown };
  const userForm = {} as Group<{
    name: Control<string>; alias: Control<string>; email: Control<string>; web: Control<string>;
    acceso: Group<{ clave: Control<string>; repetir: Control<string> }>;
  }>;
  const plain = 'x';
}

<article>
  <form control="@userForm">
    ${markup}
  </form>
</article>
`;

/** A page whose markup has no form around it. */
const loosePage = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>${markup}</article>\n`;

function corpus(source: string) {
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/layouts/_layout.fud': LAYOUT,
      '/p/components/app-badge.fud': component('app-badge'),
      [PATH]: source,
    }),
  );
  index.scan('/p');
  return new DocumentCache(index).get(PATH, 1, source);
}

const labels = (answer: CompletionList | undefined | null): string[] => (answer?.items ?? []).map((i) => String(i.label));
const item = (label: string, extra: Partial<CompletionItem> = {}): CompletionItem => ({
  label,
  kind: CompletionItemKind.Variable,
  ...extra,
});
const list = (...items: CompletionItem[]): CompletionList => ({ isIncomplete: false, items });

/** The answer of the TypeScript decorator at the `|`, over `answer`, with a real checker. */
async function tsAt(markup: string, answer: CompletionList, build = formPage): Promise<CompletionList | undefined | null> {
  const source = build(markup.replace('|', ''));
  const cached = corpus(source);
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path))!;
  const document = TextDocument.create(`file://${client.fileName}`, 'typescript', 1, client.text);
  const generated = mapToGenerated(client, build(markup).indexOf('|'), 'completion');
  const [wrapped] = filterTypeScriptCompletions([
    { name: 'ts', capabilities: { completionProvider: {} }, create: () => ({ provideCompletionItems: () => answer }) },
  ]);
  const instance = wrapped!.create(
    fakeServiceContext(
      { [URI.file(PATH).toString()]: cached },
      () => [URI.file(PATH), CLIENT_CODE_ID],
      { 'typescript/languageService': projectionService(cached.path, client.text) },
    ),
  );
  return (await instance.provideCompletionItems?.(document, document.positionAt(generated ?? 0), { triggerKind: 1 }, TOKEN)) as
    | CompletionList
    | undefined;
}

/** The plugin services over the page, with the caret at `|`. */
function servicesAt(markup: string, build = formPage, mountTypeScript = true) {
  const source = build(markup);
  const offset = source.indexOf('|');
  const text = source.replace('|', '');
  const cached = corpus(text);
  const document = TextDocument.create(URI.file(PATH).toString(), 'fud', 1, text);
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path));
  const context = fakeServiceContext(
    { [URI.file(PATH).toString()]: cached },
    () => undefined,
    mountTypeScript && client !== undefined ? { 'typescript/languageService': projectionService(cached.path, client.text) } : {},
  );
  const index = new WorkspaceIndex(memoryFs({}));
  const stats = new RequestStats();
  return {
    cached,
    document,
    position: document.positionAt(offset),
    service: createFudicService({ index, stats, typescript: true }).create(context),
    tagService: createFudicTagService({ index, stats }).create(context),
  };
}

async function nativeGap(markup: string, build = formPage): Promise<string[]> {
  const { tagService, document, position } = servicesAt(markup, build);
  return labels((await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as CompletionList);
}

async function hoverOf(markup: string, word: string): Promise<string> {
  const { service, document, cached } = servicesAt(markup);
  const at = cached.source.indexOf(`${word}=`, cached.source.indexOf('<article>'));
  const hover = await service.provideHover?.(document, document.positionAt(at + 1), TOKEN);
  return String((hover?.contents as { value: string } | undefined)?.value ?? '');
}

describe('the offer at a gap (criterion 25)', () => {
  it('offers `error` and `summary` inside a form, on a native tag', async () => {
    const found = await nativeGap('<div |></div>');
    expect(found).toEqual(expect.arrayContaining(['control', 'error', 'summary']));
    expect(found).not.toContain('fields');
  });

  it('and on a component tag, riding inside TypeScript’s reply', async () => {
    const answer = await tsAt('<app-badge |></app-badge>', list(item('"tone"', { kind: CompletionItemKind.Field })));
    expect(labels(answer)).toEqual(expect.arrayContaining(['control', 'error', 'summary']));
    const error = answer?.items.find((i) => i.label === 'error');
    expect(error?.insertText).toBe('error=@');
  });

  it('never outside a form', async () => {
    const found = await nativeGap('<div |></div>', loosePage);
    expect(found).not.toContain('error');
    expect(found).not.toContain('summary');
  });

  it('`fields` only beside a `summary=`, and each attribute only once', async () => {
    const found = await nativeGap('<div summary="@userForm" |></div>');
    expect(found).toContain('fields');
    expect(found).not.toContain('summary');
    expect(await nativeGap('<div summary="@userForm" fields |></div>')).not.toContain('fields');
    expect(await nativeGap('<small error="@userForm.name" |></small>')).not.toContain('error');
  });

  it('a layout offers none', () => {
    const path = '/p/layouts/_layout.fud';
    const source = LAYOUT.replace('@RenderBody()', '<form control="@f"><div></div></form>\n      @RenderBody()');
    const index = new WorkspaceIndex(memoryFs({ [path]: source }));
    index.scan('/p');
    const cached = new DocumentCache(index).get(path, 1, source);
    const divs: ElementNode[] = [];
    walk(documentRoots(cached.document), {
      element(el) {
        if (el.name === 'div') divs.push(el);
      },
    });
    expect(formAttributeOffers(cached, divs[0]!, false)).toEqual([]);
  });
});

describe('the value of `error` (criterion 26)', () => {
  const members = list(item('name'), item('alias'), item('email'), item('web'), item('acceso'), item('$valid'), item('$errors'), item('$touch'));

  it.each([
    ['with quotes', '<small error="@userForm.|"></small>'],
    ['without them', '<small error=@userForm.| class="e"></small>'],
  ])('`error=@userForm.` %s: the nodes, and no `$` member', async (_, markup) => {
    expect(labels(await tsAt(markup, members))).toEqual(['name', 'alias', 'email', 'web', 'acceso']);
  });

  it('with the value still empty: the nodes that lead to a control', async () => {
    const answer = await tsAt('<small error=|></small>', list(item('unrelated')));
    expect(labels(answer)).toEqual(['@userForm']);
  });

  it('right of the `=` in a native tag, before the `@`', async () => {
    const { tagService, document, position } = servicesAt('<small error=|></small>');
    const answer = (await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as CompletionList;
    expect(labels(answer)).toEqual(['@userForm']);
  });
});

describe('the value of `summary` (criterion 27)', () => {
  const NESTED = '<fieldset class="g" control="@userForm.acceso"><div summary=|></div></fieldset>';

  it('a value that is neither an expression nor empty is left to the rules below', async () => {
    expect(labels(await tsAt('<div summary="x|"></div>', list(item('userForm'))))).toEqual([]);
  });

  it('`fields` at a gap on a component tag carrying a summary, with no next list to ask for', async () => {
    const answer = await tsAt(
      '<app-badge summary="@userForm" |></app-badge>',
      list(item('"tone"', { kind: CompletionItemKind.Field })),
    );
    const fields = answer?.items.find((i) => i.label === 'fields');
    expect(fields?.insertText).toBe('fields');
    expect(fields?.command).toBeUndefined();
  });

  it('inside the fieldset: the group first, then the form, and nothing else', async () => {
    const answer = await tsAt(NESTED, list(item('unrelated')));
    expect(labels(answer)).toEqual(['@userForm.acceso', '@userForm']);
  });

  it('a component around it is a crossing, never a summary’s node', async () => {
    const answer = await tsAt('<app-badge control="@userForm.name"><div summary=|></div></app-badge>', list(item('x')));
    expect(labels(answer)).toEqual(['@userForm']);
  });

  it('in the form: only the form', async () => {
    expect(labels(await tsAt('<div summary=|></div>', list(item('x'))))).toEqual(['@userForm']);
  });

  it('after the `@`, the same nodes; after a dot, nothing', async () => {
    const at = await tsAt('<fieldset control="@userForm.acceso"><div summary="@|"></div></fieldset>', list(item('userForm'), item('plain')));
    expect(labels(at)).toEqual(['userForm.acceso', 'userForm']);
    const dot = await tsAt('<div summary="@userForm.|"></div>', list(item('name'), item('$valid')));
    expect(labels(dot)).toEqual([]);
  });

  it('right of the `=` in a native tag, before the `@`', async () => {
    const { tagService, document, position } = servicesAt(NESTED);
    const answer = (await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as CompletionList;
    expect(labels(answer)).toEqual(['@userForm.acceso', '@userForm']);
  });

  it('with nothing bound around it, no list', async () => {
    const { tagService, document, position } = servicesAt('<div summary=|></div>', loosePage);
    const answer = await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN);
    expect(labels(answer as CompletionList | undefined)).toEqual([]);
  });
});

describe('hover (criterion 28)', () => {
  it('explains `error`, `summary` and `fields`', async () => {
    expect(await hoverOf('<input control="@userForm.name"><small error="@userForm.name"></small>', 'error')).toContain(
      'Marca el elemento que dice el error de un control',
    );
    expect(await hoverOf('<div summary="@userForm" fields></div>', 'summary')).toContain('Marca el resumen de un form o de un grupo');
    const { service, document, cached } = servicesAt('<div summary="@userForm" fields></div>');
    const at = cached.source.indexOf(' fields') + 2;
    const hover = await service.provideHover?.(document, document.positionAt(at), TOKEN);
    expect(String((hover?.contents as { value: string }).value)).toContain('El resumen lista también');
  });

  it('`fields` on an element with no summary is the author’s word, and says nothing', async () => {
    const { service, document, cached } = servicesAt('<div fields></div>');
    const hover = await service.provideHover?.(document, document.positionAt(cached.source.indexOf(' fields') + 2), TOKEN);
    expect(hover ?? undefined).toBeUndefined();
  });
});

describe('a free expression still sees the API (criterion 29)', () => {
  it('`disabled=@(!userForm.` offers `$valid`', async () => {
    const answer = await tsAt('<button disabled=@(!userForm.|)></button>', list(item('name'), item('$valid')));
    expect(labels(answer)).toContain('$valid');
  });
});

describe('the parity table (criterion 31)', () => {
  it.each(['control', 'error', 'summary'])('`%s`: offered, listed, explained', async (attr) => {
    // Offer.
    expect(await nativeGap('<div |></div>')).toContain(attr);
    // List of its value.
    const markup =
      attr === 'control' ? '<input control=|>' : attr === 'error' ? '<small error=|></small>' : '<div summary=|></div>';
    expect(labels(await tsAt(markup, list(item('unrelated'))))).toContain('@userForm');
    // Hover.
    const bound =
      attr === 'control'
        ? '<input control="@userForm.name">'
        : attr === 'error'
          ? '<input control="@userForm.name"><small error="@userForm.name"></small>'
          : '<div summary="@userForm"></div>';
    expect(await hoverOf(bound, attr)).toContain(`**\`${attr}\`**`);
  });
});
