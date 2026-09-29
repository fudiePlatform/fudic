/**
 * BUG-42 §6.D, criterion 30 — the root `<template>` of a component in the editor: its attributes
 * offered and explained, and the ids of the template inside `shadowrootreferencetarget`.
 */

import { describe, expect, it } from 'vitest';
import type { CompletionList } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { RequestStats } from '../../src/stats.js';
import { createFudicService, createFudicTagService } from '../../src/services/plugin.js';
import { TEMPLATE_ATTRIBUTES } from '../../src/services/template-attrs.js';
import { silenceOwnedPositions } from '../../src/services/owned.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { ProjectConfigs } from '../../src/project-config.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { LAYOUT, memoryFs } from '../_support.js';

const PATH = '/p/components/app-input.fud';

/** A component whose root template is `template`, with the caret at `|`. */
function at(template: string, path = PATH) {
  const offset = template.indexOf('|');
  const text = template.replace('|', '');
  const index = new WorkspaceIndex(memoryFs({ '/p/layouts/_layout.fud': LAYOUT, [path]: text }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(path, 1, text);
  const document = TextDocument.create(URI.file(path).toString(), 'fud', 1, text);
  const context = fakeServiceContext({ [URI.file(path).toString()]: cached }, () => undefined, {});
  const stats = new RequestStats();
  return {
    document,
    position: document.positionAt(offset),
    service: createFudicService({ index, stats, typescript: true }).create(context),
    tagService: createFudicTagService({ index, stats }).create(context),
  };
}

const labels = (answer: unknown): string[] => ((answer as CompletionList | undefined)?.items ?? []).map((i) => String(i.label));

describe('the root template (criterion 30)', () => {
  it('offers the five standard attributes and `formassociated`, with their cards', async () => {
    const { tagService, document, position } = at('<app-input>\n  <template |><input></template>\n</app-input>\n');
    const answer = (await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as CompletionList;
    expect(labels(answer)).toEqual(
      expect.arrayContaining([
        'shadowrootmode',
        'shadowrootdelegatesfocus',
        'shadowrootreferencetarget',
        'shadowrootclonable',
        'shadowrootserializable',
        'formassociated',
      ]),
    );
    const marker = answer.items.find((i) => i.label === 'formassociated');
    expect(String((marker?.documentation as { value: string }).value)).toContain('marcador de fudic');
    expect(answer.items.find((i) => i.label === 'shadowrootreferencetarget')?.command).toBeDefined();
  });

  it('leaves out what the template already carries, and says nothing on another template', async () => {
    const carried = at('<app-input>\n  <template shadowrootmode="open" |><input></template>\n</app-input>\n');
    const list = await carried.tagService.provideCompletionItems?.(carried.document, carried.position, { triggerKind: 1 }, TOKEN);
    expect(labels(list)).not.toContain('shadowrootmode');
    expect(labels(list)).toContain('formassociated');

    const nested = at('<app-input>\n  <template shadowrootmode="open"><template |></template></template>\n</app-input>\n');
    const none = await nested.tagService.provideCompletionItems?.(nested.document, nested.position, { triggerKind: 1 }, TOKEN);
    expect(labels(none)).not.toContain('formassociated');
  });

  it('explains each attribute on hover', async () => {
    for (const attr of TEMPLATE_ATTRIBUTES) {
      const source = `<app-input>\n  <template ${attr.name === 'shadowrootmode' ? 'shadowrootmode="open"' : `shadowrootmode="open" ${attr.name}`}><input></template>\n</app-input>\n`;
      const { service, document } = at(source.replace(`${attr.name}`, `${attr.name.slice(0, 2)}|${attr.name.slice(2)}`));
      const position = document.positionAt(source.indexOf(attr.name) + 2);
      const hover = await service.provideHover?.(document, position, TOKEN);
      expect(String((hover?.contents as { value: string }).value)).toBe(attr.hover);
    }
  });

  it('says nothing past the name, or on an attribute it does not know', async () => {
    const source = '<app-input>\n  <template shadowrootmode="open" data-x><input></template>\n</app-input>\n';
    const { service, document } = at(source);
    expect(await service.provideHover?.(document, document.positionAt(source.indexOf('open') + 1), TOKEN)).toBeUndefined();
    expect(await service.provideHover?.(document, document.positionAt(source.indexOf('data-x') + 2), TOKEN)).toBeUndefined();
  });

  it('offers the static ids of the template inside `shadowrootreferencetarget`', async () => {
    const { tagService, document, position } = at(
      '<app-input>\n  <template shadowrootmode="open" shadowrootreferencetarget="|"><div id="caja"><input id="campo"><i id="@x"></i></div></template>\n</app-input>\n',
    );
    const answer = await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN);
    expect(labels(answer)).toEqual(['caja', 'campo']);
  });

  it('with no id in the template, no list', async () => {
    const { tagService, document, position } = at(
      '<app-input>\n  <template shadowrootmode="open" shadowrootreferencetarget="|"><input></template>\n</app-input>\n',
    );
    expect(await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)).toBeUndefined();
  });

  it('another attribute value of the template is not the bridge’s', async () => {
    const { tagService, document, position } = at(
      '<app-input>\n  <template shadowrootmode="|"><input id="campo"></template>\n</app-input>\n',
    );
    expect(labels(await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN))).not.toContain('campo');
  });
});

describe('the sheets a component chooses, from its fudic.json', () => {
  const FUDIC = JSON.stringify({ globalStyles: { theme: 'theme.css' }, styles: { panel: 'panel.css', forms: 'forms.css' } });

  /** Like `at`, with a fudic.json at the project root and the services handed its configs. */
  function withConfig(template: string) {
    const offset = template.indexOf('|');
    const text = template.replace('|', '');
    const fs = memoryFs({ '/p/fudic.json': FUDIC, [PATH]: text });
    const index = new WorkspaceIndex(fs);
    index.scan('/p');
    const configs = new ProjectConfigs(fs);
    const cached = new DocumentCache(index).get(PATH, 1, text);
    const document = TextDocument.create(URI.file(PATH).toString(), 'fud', 1, text);
    const context = fakeServiceContext({ [URI.file(PATH).toString()]: cached }, () => undefined, {});
    const stats = new RequestStats();
    return {
      document,
      position: document.positionAt(offset),
      service: createFudicService({ index, stats, typescript: true, configs }).create(context),
      tagService: createFudicTagService({ index, stats, configs }).create(context),
    };
  }

  it('offers the `styles` names inside the value, and not the global ones', async () => {
    const { tagService, document, position } = withConfig(
      '<app-input>\n  <template shadowrootmode="open" shadowrootadoptedstylesheets="|"><input></template>\n</app-input>\n',
    );
    expect(labels(await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN))).toEqual([
      'panel',
      'forms',
    ]);
  });

  it('leaves out the names already written, and completes the word being typed', async () => {
    const { tagService, document, position } = withConfig(
      '<app-input>\n  <template shadowrootmode="open" shadowrootadoptedstylesheets="panel f|"><input></template>\n</app-input>\n',
    );
    expect(labels(await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN))).toEqual([
      'forms',
    ]);
  });

  it('underlines a name the project does not declare', async () => {
    const { service, document } = withConfig(
      '<app-input>\n  <template shadowrootmode="open" shadowrootadoptedstylesheets="panel nope"><input></template>\n</app-input>\n',
    );
    const found = (await service.provideDiagnostics?.(document, TOKEN)) ?? [];
    expect(found.filter((d) => d.code === 'FUD0744').map((d) => d.message)).toEqual([
      expect.stringContaining('"nope"'),
    ]);
  });
});

describe('the root template is not an element: HTML stays silent there', () => {
  /** The HTML service double wrapped the way the server wraps the real one, at the `|`. */
  async function htmlAt(template: string): Promise<string[]> {
    const offset = template.indexOf('|');
    const text = template.replace('|', '');
    const index = new WorkspaceIndex(memoryFs({ '/p/layouts/_layout.fud': LAYOUT, [PATH]: text }));
    index.scan('/p');
    const cached = new DocumentCache(index).get(PATH, 1, text);
    const document = TextDocument.create(URI.file(PATH).toString(), 'fud', 1, text);
    const html = silenceOwnedPositions({
      name: 'html-double',
      capabilities: { completionProvider: {} },
      create: () => ({ provideCompletionItems: () => ({ isIncomplete: false, items: [{ label: 'accesskey' }] }) }),
    }).create(fakeServiceContext({ [URI.file(PATH).toString()]: cached }));
    return labels(await html.provideCompletionItems?.(document, document.positionAt(offset), { triggerKind: 1 }, TOKEN));
  }

  it('says nothing at a gap of the root template', async () => {
    expect(await htmlAt('<app-input>\n  <template shadowrootmode="open" |><input></template>\n</app-input>\n')).toEqual([]);
  });

  it('and still answers on the elements inside it', async () => {
    expect(await htmlAt('<app-input>\n  <template shadowrootmode="open"><input |></template>\n</app-input>\n')).toEqual([
      'accesskey',
    ]);
  });
});
