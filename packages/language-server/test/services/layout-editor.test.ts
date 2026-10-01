/**
 * SDD-48 in the server's own Volar service, in process (criteria 12–17).
 *
 * `acceptance/layout-editor.test.ts` and `acceptance/holes.test.ts` drive the same answers over a
 * real LSP round trip; these call the plugin's methods directly, which is where the branches of
 * each answer can be reached one by one — a hole's parentheses, a `@render`'s name and
 * arguments, the two bulbs, the colour of a snippet's name.
 */

import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, CompletionList } from '@volar/language-service';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { RequestStats } from '../../src/stats.js';
import { SEMANTIC_TOKENS_LEGEND } from '../../src/capabilities.js';
import { createFudicService } from '../../src/services/plugin.js';
import { holeArgumentContextAt, slotsAround } from '../../src/services/hole-args.js';
import { parameterNames, renderArgContextAt, renderContextAt, signatureOf } from '../../src/services/render.js';
import { holeDiagnostics, missingSections } from '../../src/services/holes.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { LAYOUT, memoryFs } from '../_support.js';

const APP_FRAME = `<app-frame>
  <template shadowrootmode="open">
    <slot name="top"></slot><slot name="content"></slot>
  </template>
</app-frame>
`;

const UI = `@snippet ficha(titulo: string, tono: "a" | "b" = "a", cb: (x: number, y: string) => void) {
  <p>@titulo</p>
}
@snippet pie() { <hr> }
`;

const CAMPOS = '@snippet texto(nombre: string) { <input name="@nombre"> }\n';

const FRAME_LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="component" href="../components/app-frame.fud">
    @RenderHead()
  </head>
  <body>
    @RenderSection(cabecera, required: true)
    @RenderSection(pie, required: true)
    <app-frame>@RenderBody(slot: "content")</app-frame>
  </body>
</html>
`;

const FILES: Readonly<Record<string, string>> = {
  '/p/components/app-frame.fud': APP_FRAME,
  '/p/snippets/ui.fud': UI,
  '/p/snippets/campos.fud': CAMPOS,
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/layouts/_frame.fud': FRAME_LAYOUT,
};

/** The service over one `.fud` at `path`, the caret where `|` was. */
function setup(marked: string, path = '/p/layouts/_edit.fud') {
  const offset = marked.indexOf('|');
  const text = marked.replace('|', '');
  const index = new WorkspaceIndex(memoryFs({ ...FILES, [path]: text }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(path, 1, text);
  const document = TextDocument.create(URI.file(path).toString(), 'fud', 1, text);
  const context = fakeServiceContext({ [URI.file(path).toString()]: cached });
  const service = createFudicService({ index, stats: new RequestStats(), typescript: false }).create(context);
  return { service, document, cached, index, offset, position: document.positionAt(Math.max(offset, 0)) };
}

async function complete(marked: string, path?: string): Promise<CompletionItem[]> {
  const { service, document, position } = setup(marked, path);
  const got = (await service.provideCompletionItems?.(document, position, { triggerKind: 1 }, TOKEN)) as
    | CompletionList
    | undefined;
  return got?.items ?? [];
}

const labels = (items: readonly CompletionItem[]): string[] => items.map((i) => i.label);
const newTexts = (items: readonly CompletionItem[]): string[] =>
  items.map((i) => (i.textEdit as { newText: string }).newText);

/** A layout that links the component and the snippets, `body` inside `<app-frame>`. */
const layout = (body: string): string =>
  `<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="component" href="../components/app-frame.fud">
    <link rel="snippet" href="../snippets/ui.fud">
    <link rel="snippet" href="../snippets/campos.fud" as="campos">
    @code {
      const { titulo = "x" } = props<{ titulo?: string }>();
    }
    @RenderHead()
  </head>
  <body>
    <app-frame>
      ${body}
    </app-frame>
  </body>
</html>
`;

/** A route with a snippet of its own, the two snippet files linked, and `markup` below. */
const withLocal = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="snippet" href="../snippets/ui.fud">
<link rel="snippet" href="../snippets/nadie.fud">
<link rel="snippet" href="../snippets/campos.fud" as="campos">
@snippet mio() { <i></i> }
${markup}
`;

describe('the parentheses of a hole (criterion 13)', () => {
  it('offers each slot of the component around it as a whole argument', async () => {
    const items = await complete(layout('@RenderBody(|)'));
    expect(labels(items)).toEqual(['slot: "top"', 'slot: "content"']);
  });

  it('offers `required: true` first in a section, and leaves out what is written', async () => {
    expect(labels(await complete(layout('@RenderSection(nav, |)\n@RenderBody()')))).toEqual([
      'required: true',
      'slot: "top"',
      'slot: "content"',
    ]);
    expect(labels(await complete(layout('@RenderSection(nav, required: true, |)\n@RenderBody()')))).toEqual([
      'slot: "top"',
      'slot: "content"',
    ]);
  });

  it('offers the bare names inside the quotes, replacing the name already there', async () => {
    const items = await complete(layout('@RenderBody(slot: "co|nt")'));
    expect(labels(items)).toEqual(['top', 'content']);
    expect(newTexts(items)).toEqual(['top', 'content']);
  });

  it('offers the quoted slots after `slot:`, spaced as the house writes it, and the booleans after `required:`', async () => {
    expect(newTexts(await complete(layout('@RenderBody(slot:|)')))).toEqual([' "top"', ' "content"']);
    expect(newTexts(await complete(layout('@RenderBody(slot: |)')))).toEqual(['"top"', '"content"']);
    expect(labels(await complete(layout('@RenderSection(nav, required: |)\n@RenderBody()')))).toEqual([
      'true',
      'false',
    ]);
  });

  it('offers no slot with no component around the hole, or one the index does not know', async () => {
    const bare = `<!DOCTYPE html><html><head>@RenderHead()</head><body><main>@RenderBody(|)</main></body></html>`;
    expect(await complete(bare)).toEqual([]);
    const unknown = layout('<app-ghost>@RenderBody(|)</app-ghost>');
    expect(await complete(unknown)).toEqual([]);
  });
});

describe('holeArgumentContextAt', () => {
  const at = (marked: string) => holeArgumentContextAt(marked.replace('|', ''), marked.indexOf('|'));

  it('is nothing outside a hole, past its `)`, on a section name or mid-value', () => {
    expect(at('<p>(|</p>')).toBeUndefined();
    expect(at('@RenderBody() |')).toBeUndefined();
    expect(at('@RenderSection(na|')).toBeUndefined();
    expect(at('@RenderSection(nav, required: tr|')).toBeUndefined();
  });

  it('reads a slot value up to its closing quote, and to the end of an unclosed one', () => {
    expect(at('@RenderBody(slot: "a|b")')).toEqual({ kind: 'slot', span: { start: 19, end: 21 } });
    expect(at("@RenderBody(slot: 'a|")).toEqual({ kind: 'slot', span: { start: 19, end: 20 } });
  });

  it('knows the keys a hole has left, even with no `)` yet', () => {
    expect(at('@RenderSection(nav, slot: "x", |')).toEqual({
      kind: 'key',
      span: { start: 31, end: 31 },
      keys: ['required'],
    });
  });
});

describe('slotsAround', () => {
  it('names the slots of the nearest component, and none when its tag is not linked', () => {
    const source = layout('<app-frame>@RenderBody()</app-frame>');
    const { cached, index } = setup(source);
    expect(slotsAround(cached, index, source.indexOf('@RenderBody'))).toEqual(['top', 'content']);
    // Past its closing tag the caret is no longer inside it.
    expect(slotsAround(cached, index, source.indexOf('</body>'))).toEqual([]);
    // A `<link>` with no href yet points at nothing, and is stepped over.
    const bare = source.replace('<link rel="component" href="../components/app-frame.fud">', '<link rel="component">');
    const unlinked = setup(bare);
    expect(slotsAround(unlinked.cached, unlinked.index, bare.indexOf('@RenderBody'))).toEqual([]);
  });
});

describe('`@render` (criterion 15)', () => {
  it('offers the local, the imported and each namespace after `@render `', async () => {
    const items = await complete(withLocal('<p>@render |</p>'), '/p/blog/x.fud');
    expect(labels(items)).toEqual(['mio', 'ficha', 'pie', 'campos']);
    expect(newTexts(items)).toEqual(['mio($0)', 'ficha($0)', 'pie($0)', 'campos.']);
  });

  it('offers the snippets of one namespace after its dot, and none of an unknown one', async () => {
    expect(labels(await complete(layout('@render campos.|\n@RenderBody()')))).toEqual(['texto']);
    expect(await complete(layout('@render otro.|\n@RenderBody()'))).toEqual([]);
  });

  it('offers the values of the view behind `@` and the parameters not given yet', async () => {
    const items = await complete(layout('@render ficha("a", |)\n@RenderBody()'));
    expect(labels(items)).toContain('@titulo');
    expect(labels(items)).toEqual(expect.arrayContaining(['titulo:', 'tono:', 'cb:']));
    const given = await complete(layout('@render ficha(tono: "b", |)\n@RenderBody()'));
    expect(labels(given)).not.toContain('tono:');
  });

  it('offers only values after a `name:`, and no parameter of a snippet it cannot see', async () => {
    expect(labels(await complete(layout('@render ficha(tono: |)\n@RenderBody()')))).toEqual(['@titulo']);
    expect(labels(await complete(layout('@render nadie(|)\n@RenderBody()')))).toEqual(['@titulo']);
  });
});

describe('the helpers of `@render`', () => {
  it('renderContextAt reads the namespace and the word, or nothing', () => {
    expect(renderContextAt('@render fi', 10)).toEqual({ span: { start: 8, end: 10 } });
    expect(renderContextAt('@render ui.fi', 13)).toEqual({ namespace: 'ui', span: { start: 11, end: 13 } });
    expect(renderContextAt('<p>fi', 5)).toBeUndefined();
  });

  it('renderArgContextAt follows the parentheses and the labels', () => {
    const at = (marked: string) => renderArgContextAt(marked.replace('|', ''), marked.indexOf('|'));
    expect(at('<p>|</p>')).toBeUndefined();
    expect(at('@render ui.ficha(a, @ti|')).toEqual({
      namespace: 'ui',
      name: 'ficha',
      afterLabel: false,
      span: { start: 20, end: 23 },
      labels: [],
    });
    expect(at('@render ficha(f(x), tono: |, cb: 1)')?.labels).toEqual(['tono', 'cb']);
    expect(at('@render ficha(f(x) |')).toBeUndefined();
    expect(at('@render ficha(f(|')).toBeUndefined();
    expect(at('@render ficha(a) |')).toBeUndefined();
  });

  it('parameterNames splits a signature at its top-level commas only', () => {
    expect(parameterNames('(titulo: string, cb: (x: number, y: string) => void, m: Map<string, number>, [a, b]: T)')).toEqual([
      'titulo',
      'cb',
      'm',
    ]);
    expect(parameterNames('()')).toEqual([]);
  });

  it('signatureOf finds a local, an imported and a namespaced snippet', () => {
    const { cached, index } = setup(withLocal('<p>x</p>'), '/p/blog/x.fud');
    expect(signatureOf(cached, index, { name: 'mio' })).toBe('()');
    expect(signatureOf(cached, index, { name: 'pie' })).toBe('()');
    expect(signatureOf(cached, index, { namespace: 'campos', name: 'texto' })).toBe('(nombre: string)');
    expect(signatureOf(cached, index, { name: 'nadie' })).toBeUndefined();
  });
});

describe('the bulbs (criteria 14 and 15)', () => {
  const ROUTE = '/p/blog/marco.fud';
  const route = (body: string): string => `<link rel="layout" href="../layouts/_frame.fud">\n\n${body}`;

  async function fixes(source: string) {
    const { service, document } = setup(source, ROUTE);
    const whole = { start: { line: 0, character: 0 }, end: { line: source.split('\n').length, character: 0 } };
    const actions = (await service.provideCodeActions?.(document, whole, { diagnostics: [] }, TOKEN)) ?? [];
    return actions.map((a) => ({
      title: a.title,
      text: (Object.values(a.edit?.changes ?? {})[0] as { newText: string }[] | undefined)?.[0]?.newText,
    }));
  }

  it('writes every missing section after the last one, or at the end of the file', async () => {
    expect(await fixes(route('<p>x</p>\n@section cabecera {\n}\n\n'))).toEqual([
      { title: 'Añadir las secciones requeridas del layout (pie)', text: '\n\n@section pie {\n}' },
      { title: 'Explain FUD0890', text: undefined },
    ]);
    const bare = await fixes(route('<p>x</p>\n'));
    expect(bare.map((f) => f.title)).toEqual([
      'Añadir las secciones requeridas del layout (cabecera, pie)',
      'Explain FUD0890',
    ]);
  });

  it('writes the `@` of a path, and wraps anything else in `@( … )`', async () => {
    const source = route('@section cabecera {}\n@section pie {}\n<p>@render ficha(titulo, tono: a ? "a" : "b")</p>\n');
    const got = await fixes(source.replace('<link rel="layout" href="../layouts/_frame.fud">', '<link rel="layout" href="../layouts/_frame.fud">\n<link rel="snippet" href="../snippets/ui.fud">'));
    expect(got).toEqual([
      { title: 'Escribir @titulo', text: '@titulo' },
      { title: 'Explain FUD0894', text: undefined },
      { title: 'Envolver en @( … )', text: '@(a ? "a" : "b")' },
    ]);
  });
});

describe('the contract in the editor, and who has one', () => {
  it('reads a route against its layout, and nothing for a layout or a route with no layout', () => {
    const r = setup('<link rel="layout" href="../layouts/_frame.fud">\nsuelto\n', '/p/blog/marco.fud');
    expect(holeDiagnostics(r.cached, r.index).map((d) => d.code)).toEqual(['FUD0890', 'FUD0891']);
    expect(missingSections(r.cached, r.index).map((s) => s.name)).toEqual(['cabecera', 'pie']);

    const l = setup(FRAME_LAYOUT);
    expect(holeDiagnostics(l.cached, l.index)).toEqual([]);
    expect(missingSections(l.cached, l.index)).toEqual([]);

    const ghost = setup('<link rel="layout" href="../layouts/_nadie.fud">\n<p>x</p>\n', '/p/blog/x.fud');
    expect(holeDiagnostics(ghost.cached, ghost.index)).toEqual([]);
  });
});

describe('the colour of a snippet call (criterion 17)', () => {
  it('paints the namespace as one and the name as a function', async () => {
    // The third call has no name yet: there is nothing of it to paint but its keyword.
    const source = layout('@render campos.texto("a")\n@render ficha("b")\n@render ("c")\n@RenderBody()');
    const { service, document } = setup(source);
    const tokens = (await service.provideDocumentSemanticTokens?.(
      document,
      { start: { line: 0, character: 0 }, end: { line: 40, character: 0 } },
      SEMANTIC_TOKENS_LEGEND,
      TOKEN,
    )) as number[][] | undefined;
    const types = (tokens ?? []).map((t) => SEMANTIC_TOKENS_LEGEND.tokenTypes[t[3]!]);
    expect(types).toEqual(expect.arrayContaining(['namespace', 'function']));
    expect(types.filter((t) => t === 'function')).toHaveLength(2);
  });
});
