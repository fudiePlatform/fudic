/**
 * SDD-79 §4.8, §4.9 — the style guide in the editor, criteria 18–22.
 *
 * A component of a library (`libs/ui`) whose chain holds the guide library (`@acme/guide`): what
 * it may adopt is the build's answer (the `styles` and the pieces of every package of its chain),
 * writing an element of its root template adds the piece that styles it, and the two warnings say
 * what is missing and what is unused — with a repair each, the second one only on request.
 */

import { describe, expect, it } from 'vitest';
import type {
  CodeAction,
  CompletionList,
  LanguageServicePlugin,
  LanguageServicePluginInstance,
  TextEdit,
} from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { ProjectConfigs } from '../../src/project-config.js';
import { repairsFor } from '../../src/repairs.js';
import { RequestStats } from '../../src/stats.js';
import { silenceOwnedPositions } from '../../src/services/owned.js';
import { createFudicService, createFudicTagService } from '../../src/services/plugin.js';
import { adoptionEditFor, guidePieceDiagnostics } from '../../src/services/template-attrs.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { LAYOUT, memoryFs } from '../_support.js';

const UI = '/ws/libs/ui';
const GUIDE = `${UI}/node_modules/@acme/guide`;
const CARD = `${UI}/src/ui-card.fud`;

const WORKSPACE: Readonly<Record<string, string>> = {
  [`${UI}/package.json`]: JSON.stringify({ name: '@acme/ui', dependencies: { '@acme/guide': 'workspace:*' } }),
  [`${UI}/fudic.json`]: JSON.stringify({ kind: 'lib', prefix: 'ui', styles: { cards: 'cards.css' } }),
  [`${UI}/cards.css`]: '.card { padding: 0; }',
  [`${GUIDE}/package.json`]: JSON.stringify({ name: '@acme/guide' }),
  [`${GUIDE}/fudic.json`]: JSON.stringify({
    kind: 'lib',
    globalStyles: { base: 'base.css' },
    guide: { sheet: 'guide.css', icon: 'logo.svg' },
  }),
  [`${GUIDE}/guide.css`]: ['tokens', 'base', 'h1', 'button', 'ul', 'ol', 'panel'].map((f) => `@import "./${f}.css";`).join('\n'),
  [`${GUIDE}/tokens.css`]: ':root { --ink: #111; }',
  [`${GUIDE}/base.css`]: '* { box-sizing: border-box; }',
  [`${GUIDE}/h1.css`]: ':where(h1) { margin: 0; }',
  [`${GUIDE}/button.css`]: ':where(button) { padding: 0; }',
  [`${GUIDE}/ul.css`]: ':where(ul) > :where(li) { margin: 0; }',
  [`${GUIDE}/ol.css`]: ':where(ol) > :where(li) { margin: 0; }',
  [`${GUIDE}/panel.css`]: '.panel { padding: 0; }',
};

/** `ui-card` with `template` as its root template; the caret at `|`, when there is one. */
const card = (template: string): string => `<ui-card>\n  ${template}\n</ui-card>\n`;

function open(marked: string, path = CARD, extra: Readonly<Record<string, string>> = {}) {
  const offset = marked.indexOf('|');
  const text = marked.replace('|', '');
  const fs = memoryFs({ ...WORKSPACE, '/ws/libs/ui/src/layouts/_layout.fud': LAYOUT, ...extra, [path]: text });
  const index = new WorkspaceIndex(fs);
  index.scan('/ws');
  const configs = new ProjectConfigs(fs);
  const cached = new DocumentCache(index).get(path, 1, text);
  const uri = URI.file(path).toString();
  const document = TextDocument.create(uri, 'fud', 1, text);
  const context = fakeServiceContext({ [uri]: cached }, () => undefined, {});
  const stats = new RequestStats();
  return {
    text,
    offset,
    cached,
    configs,
    document,
    position: document.positionAt(offset),
    service: createFudicService({ index, stats, typescript: true, configs }).create(context),
    tagService: createFudicTagService({ index, stats, configs }).create(context),
    context,
  };
}

async function diagnostics(marked: string) {
  const { service, document, text } = open(marked);
  const found = (await service.provideDiagnostics?.(document, TOKEN)) ?? [];
  return found
    .filter((d) => d.code === 'FUD1440' || d.code === 'FUD1441' || d.code === 'FUD0744')
    .map((d) => ({ code: d.code, at: text.slice(document.offsetAt(d.range.start), document.offsetAt(d.range.end)) }));
}

/** The text after the action's edits, last first so the offsets hold. */
function applied(document: TextDocument, action: CodeAction): string {
  const edits: TextEdit[] = Object.values(action.edit?.changes ?? {})[0] ?? [];
  let text = document.getText();
  for (const e of [...edits].sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start))) {
    text = text.slice(0, document.offsetAt(e.range.start)) + e.newText + text.slice(document.offsetAt(e.range.end));
  }
  return text;
}

async function actions(marked: string): Promise<{ document: TextDocument; found: CodeAction[] }> {
  const { service, document, text } = open(marked);
  const whole = { start: { line: 0, character: 0 }, end: document.positionAt(text.length) };
  const found = ((await service.provideCodeActions?.(document, whole, { diagnostics: [] }, TOKEN)) ?? []).filter(
    (a): a is CodeAction => 'edit' in a && a.edit !== undefined,
  );
  return { document, found };
}

describe('what a component of the library may adopt (criterion 18)', () => {
  it('its chain, root first: the pieces of the guide and the styles of its own package, not the globals nor the document', () => {
    const { configs } = open(card('<template shadowrootmode="open"></template>'));
    expect(configs.choosableStylesFor(CARD)).toEqual(['h1', 'button', 'ul', 'ol', 'panel', 'cards']);
    expect(configs.guidePiecesFor(CARD).map((p) => p.name)).toEqual(['h1', 'button', 'ul', 'ol', 'panel']);
  });

  it('offers the pieces inside the attribute', async () => {
    const { tagService, document, position } = open(
      card('<template shadowrootmode="open" shadowrootadoptedstylesheets="cards |"><button>x</button></template>'),
    );
    const answer = (await tagService.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as CompletionList;
    expect(answer.items.map((i) => i.label)).toEqual(['h1', 'button', 'ul', 'ol', 'panel']);
  });

  it('naming button is no FUD0744', async () => {
    expect(await diagnostics(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="button"><button>x</button></template>'))).toEqual([]);
  });

  it('the nearest fudic.json alone, for a file no package.json owns', () => {
    const { configs } = open('<p-x><template shadowrootmode="open"></template></p-x>', '/solo/src/p-x.fud', {
      '/solo/fudic.json': JSON.stringify({ kind: 'app', id: 'solo', guide: { sheet: 'g.css' } }),
      '/solo/g.css': '@import "./p.css";',
      '/solo/p.css': 'p { margin: 0; }',
    });
    expect(configs.guidePiecesFor('/solo/src/p-x.fud').map((p) => p.name)).toEqual(['p']);
    expect(configs.choosableStylesFor('/elsewhere/x.fud')).toBeNull();
    expect(configs.guidePiecesFor('/elsewhere/x.fud')).toEqual([]);
  });

  it('a name of the chain is kept the first time it appears', () => {
    const { configs } = open(card('<template shadowrootmode="open"></template>'), CARD, {
      [`${UI}/fudic.json`]: JSON.stringify({ kind: 'lib', prefix: 'ui', styles: { h1: 'own.css' } }),
      [`${UI}/own.css`]: 'h1 {}',
    });
    // The guide is the root of the chain: its h1 comes first, and the library's own is a clash
    // the build reports (FUD0741).
    expect(configs.choosableStylesFor(CARD)).toEqual(['h1', 'button', 'ul', 'ol', 'panel']);
  });

  it('a piece named like a sheet of styles of its own package is that sheet, not a piece', () => {
    const { configs } = open('<p-x><template shadowrootmode="open"></template></p-x>', '/solo/src/p-x.fud', {
      '/solo/fudic.json': JSON.stringify({ kind: 'app', id: 'solo', styles: { p: 'own.css' }, guide: { sheet: 'g.css' } }),
      '/solo/own.css': 'p {}',
      '/solo/g.css': '@import "./p.css";\n@import "./em.css";',
      '/solo/p.css': 'p { margin: 0; }',
      '/solo/em.css': 'em { margin: 0; }',
    });
    expect(configs.choosableStylesFor('/solo/src/p-x.fud')).toEqual(['p', 'em']);
    expect(configs.guidePiecesFor('/solo/src/p-x.fud').map((p) => p.name)).toEqual(['em']);
  });

  it('reads the guide again when a sheet or a fudic.json changes', () => {
    const files: Record<string, string> = { ...WORKSPACE, [CARD]: card('<template shadowrootmode="open"></template>') };
    const configs = new ProjectConfigs(memoryFs(files));
    expect(configs.guidePiecesFor(CARD)).toHaveLength(5);
    files[`${GUIDE}/guide.css`] = '@import "./h1.css";';
    expect(configs.guidePiecesFor(CARD)).toHaveLength(5);
    configs.sheetChanged();
    expect(configs.guidePiecesFor(CARD).map((p) => p.name)).toEqual(['h1']);
    files[`${GUIDE}/fudic.json`] = JSON.stringify({ kind: 'lib' });
    configs.invalidate(`${GUIDE}/fudic.json`);
    expect(configs.guidePiecesFor(CARD)).toEqual([]);
  });
});

describe('writing an element adds its piece (criterion 19)', () => {
  /** The completion of `<|` through the decorator, over an HTML service that offers `items`. */
  async function complete(marked: string, items: CompletionList['items'] = [{ label: 'button' }, { label: 'li' }, { label: 'div' }]) {
    const { context, document, position, configs } = open(marked);
    const inner: LanguageServicePluginInstance['provideCompletionItems'] = async () => ({ isIncomplete: false, items });
    const plugin: LanguageServicePlugin = {
      name: 'html-double',
      capabilities: { completionProvider: {} },
      create: () => ({ provideCompletionItems: inner }),
    };
    const service = silenceOwnedPositions(plugin, (path) => configs.guidePiecesFor(path)).create(context);
    const list = (await service.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as CompletionList;
    return { document, list, edits: (label: string) => list.items.find((i) => i.label === label)?.additionalTextEdits };
  }

  const apply = (document: TextDocument, edits: readonly TextEdit[] | undefined): string => {
    let text = document.getText();
    for (const e of [...(edits ?? [])].reverse()) {
      text = text.slice(0, document.offsetAt(e.range.start)) + e.newText + text.slice(document.offsetAt(e.range.end));
    }
    return text;
  };

  it('appends the piece to the attribute', async () => {
    const { document, edits } = await complete(
      card('<template shadowrootmode="open" shadowrootadoptedstylesheets="cards"><p>x</p><|</template>'),
    );
    expect(apply(document, edits('button'))).toContain('shadowrootadoptedstylesheets="cards button"');
    expect(apply(document, edits('li'))).toContain('shadowrootadoptedstylesheets="cards ul ol"');
    expect(edits('div')).toBeUndefined();
  });

  it('creates the attribute when there is none', async () => {
    const { document, edits } = await complete(card('<template shadowrootmode="open"><bu|</template>'));
    expect(apply(document, edits('button'))).toContain('<template shadowrootmode="open" shadowrootadoptedstylesheets="button">');
  });

  it('touches nothing when it is already there', async () => {
    const { edits } = await complete(
      card('<template shadowrootmode="open" shadowrootadoptedstylesheets="button"><|</template>'),
    );
    expect(edits('button')).toBeUndefined();
  });

  it('a decorator handed no guide adds nothing', async () => {
    const { context, document, position } = open(card('<template shadowrootmode="open"><|</template>'));
    const plugin: LanguageServicePlugin = {
      name: 'html-double',
      capabilities: { completionProvider: {} },
      create: () => ({ provideCompletionItems: async () => ({ isIncomplete: false, items: [{ label: 'button' }] }) }),
    };
    const list = (await silenceOwnedPositions(plugin).create(context).provideCompletionItems?.(
      document,
      position,
      { triggerKind: 1 },
      TOKEN,
    )) as CompletionList;
    expect(list.items).toEqual([{ label: 'button' }]);
  });

  it('keeps the edits the item already had', async () => {
    const own: TextEdit = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: '' };
    const { edits } = await complete(card('<template shadowrootmode="open"><|</template>'), [{ label: 'button', additionalTextEdits: [own] }]);
    expect(edits('button')).toHaveLength(2);
    expect(edits('button')![0]).toBe(own);
  });

  it('adds nothing in the light DOM of a layout, or where no tag is being written', async () => {
    const layout = await complete('<link rel="layout" href="./layouts/_layout.fud">\n<p>x</p><|\n');
    expect(layout.edits('button')).toBeUndefined();
    const text = await complete(card('<template shadowrootmode="open"><p>a |</p></template>'));
    expect(text.edits('button')).toBeUndefined();
  });
});

describe('the two warnings, and their repairs (criteria 20–22)', () => {
  it('FUD1440 over an h1 whose piece is not adopted; its repair adopts it', async () => {
    const marked = card('<template shadowrootmode="open" shadowrootadoptedstylesheets="cards"><h1 class="card">t</h1></template>');
    expect(await diagnostics(marked)).toEqual([{ code: 'FUD1440', at: 'h1' }]);
    const { document, found } = await actions(marked);
    const adopt = found.find((a) => a.title === "Adopt the guide's sheet for <h1>")!;
    expect(applied(document, adopt)).toContain('shadowrootadoptedstylesheets="cards h1"');
  });

  it('FUD1441 over an adopted h1 with no <h1>; its repair takes it away, the attribute too when alone', async () => {
    const alone = card('<template shadowrootmode="open" shadowrootadoptedstylesheets="h1"><p>t</p></template>');
    expect(await diagnostics(alone)).toEqual([{ code: 'FUD1441', at: 'h1' }]);
    const one = await actions(alone);
    expect(applied(one.document, one.found.find((a) => a.title === 'Stop adopting h1')!)).toContain('<template shadowrootmode="open"><p>');

    const first = await actions(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="h1 button"><button>b</button></template>'));
    expect(applied(first.document, first.found.find((a) => a.title === 'Stop adopting h1')!)).toContain(
      'shadowrootadoptedstylesheets="button"',
    );
    const last = await actions(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="button h1"><button>b</button></template>'));
    expect(applied(last.document, last.found.find((a) => a.title === 'Stop adopting h1')!)).toContain(
      'shadowrootadoptedstylesheets="button"',
    );
  });

  it('no FUD1441 for a class piece when a class is written with an expression', async () => {
    expect(
      await diagnostics(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="panel"><div class="@cls">x</div></template>')),
    ).toEqual([]);
  });

  it('no FUD1441 in the editor for a template that renders a snippet: what it writes is not in sight', async () => {
    expect(
      await diagnostics(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="h1">@render title()</template>')),
    ).toEqual([]);
  });

  it('nothing on a page, or on a component without its template', () => {
    const page = open('<!DOCTYPE html>\n<html><head><title>t</title></head><body><h1>x</h1></body></html>\n');
    expect(guidePieceDiagnostics(page.cached, page.configs.guidePiecesFor(CARD))).toEqual([]);
    const broken = open('<ui-card></ui-card>\n');
    expect(guidePieceDiagnostics(broken.cached, broken.configs.guidePiecesFor(CARD))).toEqual([]);
  });
});

describe('adoptionEditFor: only where it can add cleanly', () => {
  const pieces = () => open(card('<template shadowrootmode="open"></template>')).configs.guidePiecesFor(CARD);

  it('nowhere outside the root template', () => {
    const { cached, offset } = open(card('|<template shadowrootmode="open"></template>'));
    expect(adoptionEditFor(cached, offset, 'button', pieces())).toBeUndefined();
    const page = open('<!DOCTYPE html>\n<html><head></head><body>|</body></html>\n');
    expect(adoptionEditFor(page.cached, page.offset, 'button', pieces())).toBeUndefined();
    const bare = open('<ui-card>|</ui-card>\n');
    expect(adoptionEditFor(bare.cached, bare.offset, 'button', pieces())).toBeUndefined();
  });

  it('not over a value written with an expression', () => {
    const { cached, offset } = open(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="@x">|</template>'));
    expect(adoptionEditFor(cached, offset, 'button', pieces())).toBeUndefined();
  });

  it('a bare or empty attribute is written whole', () => {
    for (const attr of ['shadowrootadoptedstylesheets', 'shadowrootadoptedstylesheets=""']) {
      const { cached, offset, text } = open(card(`<template shadowrootmode="open" ${attr}>|</template>`));
      const edit = adoptionEditFor(cached, offset, 'button', pieces())!;
      expect(text.slice(0, edit.span.start) + edit.newText + text.slice(edit.span.end)).toContain(
        'shadowrootadoptedstylesheets="button">',
      );
    }
  });

  it('after a trailing space, no second one', () => {
    const { cached, offset, text } = open(card('<template shadowrootmode="open" shadowrootadoptedstylesheets="cards ">|</template>'));
    const edit = adoptionEditFor(cached, offset, 'button', pieces())!;
    expect(text.slice(0, edit.span.start) + edit.newText + text.slice(edit.span.end)).toContain('"cards button"');
  });
});

describe('repairsFor without the pieces', () => {
  it('FUD1440 has no repair when the input carries no pieces', async () => {
    const { cached, service, document } = open(card('<template shadowrootmode="open"><h1>t</h1></template>'));
    const found = (await service.provideDiagnostics?.(document, TOKEN)) ?? [];
    const d = found.find((x) => x.code === 'FUD1440')!;
    const diagnostic = {
      code: 'FUD1440' as const,
      severity: 'warning' as const,
      message: d.message,
      span: { start: document.offsetAt(d.range.start), end: document.offsetAt(d.range.end) },
    };
    const index = new WorkspaceIndex(memoryFs({}));
    expect(repairsFor({ cached, index }, diagnostic)).toEqual([]);
  });

  it('FUD1441 has none when its span is not in the attribute', () => {
    const { cached } = open(card('<template shadowrootmode="open"><h1>t</h1></template>'));
    const index = new WorkspaceIndex(memoryFs({}));
    const diagnostic = { code: 'FUD1441' as const, severity: 'warning' as const, message: 'm', span: { start: 0, end: 2 } };
    expect(repairsFor({ cached, index }, diagnostic)).toEqual([]);
    const page = open('<!DOCTYPE html>\n<html><head></head><body></body></html>\n');
    expect(repairsFor({ cached: page.cached, index }, diagnostic)).toEqual([]);
  });

  it('a repair of FUD1441 is manual; one of FUD1440 is not', async () => {
    const { cached, configs, service, document } = open(
      card('<template shadowrootmode="open" shadowrootadoptedstylesheets="h1"><button>b</button></template>'),
    );
    const found = (await service.provideDiagnostics?.(document, TOKEN)) ?? [];
    const index = new WorkspaceIndex(memoryFs({}));
    const of = (code: 'FUD1440' | 'FUD1441') => {
      const d = found.find((x) => x.code === code)!;
      const diagnostic = { code, severity: 'warning' as const, message: d.message, span: { start: document.offsetAt(d.range.start), end: document.offsetAt(d.range.end) } };
      return repairsFor({ cached, index, pieces: configs.guidePiecesFor(CARD) }, diagnostic);
    };
    expect(of('FUD1441').map((r) => r.manual)).toEqual([true]);
    expect(of('FUD1440').map((r) => 'manual' in r)).toEqual([false]);
  });
});
