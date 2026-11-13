/**
 * SDD-83 §3.11 through the services, criteria 32 and 34: each bulb of a `.fud`, a `.fudapi` and a
 * `.fudspec` writes what the table says and the warning is gone after it; the completion of a code
 * after `fud-disable-next-line ` puts the codes of the next line first; the hover over one says its
 * two severities.
 */

import { describe, expect, it } from 'vitest';
import { CancellationToken, type CodeAction, type CompletionList, type Diagnostic, type Hover, type TextEdit } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import ts from 'typescript';
import { clientFileName, GLOBALS_DTS } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { createFudapiService } from '../../src/fudapi/service.js';
import { createFudspecService } from '../../src/fudspec/service.js';
import { ProjectConfigs } from '../../src/project-config.js';
import { createFudicService, ownDiagnostics } from '../../src/services/plugin.js';
import { RequestStats } from '../../src/stats.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { memoryFs } from '../_support.js';
import { SRC, world as apiWorld } from '../fudapi/_api.js';
import { SPEC_PATH, world as specWorld } from '../fudspec/_spec.js';

const PATH = '/p/src/app-x.fud';
const URI_ = URI.file(PATH).toString();
const CONFIG_URI = URI.file('/p/fudic.json').toString();

/** A TypeScript service over the projection that reads the `lib` from disk: the browser's names are declared there. */
function projectionService(path: string, text: string): ts.LanguageService {
  const files: Record<string, string> = { [path]: text, '/p/fudic-globals.d.ts': GLOBALS_DTS };
  const read = (name: string): string | undefined => files[name] ?? ts.sys.readFile(name);
  return ts.createLanguageService({
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const found = read(name);
      return found === undefined ? undefined : ts.ScriptSnapshot.fromString(found);
    },
    getScriptKind: () => ts.ScriptKind.TS,
    getCurrentDirectory: () => '/p',
    getCompilationSettings: () => ({ strict: true, target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], allowNonTsExtensions: true }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (name) => read(name) !== undefined,
    readFile: read,
  });
}

/** The `.fud` service over `text`, with `config` as the project's `fudic.json` when given. */
function fud(text: string, config?: string, typed = false) {
  const files: Record<string, string> = { [PATH]: text, ...(config === undefined ? {} : { '/p/fudic.json': config }) };
  const fs = memoryFs(files);
  const index = new WorkspaceIndex(fs);
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, text);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(cached.path))!;
  const provided = typed ? { 'typescript/languageService': projectionService(cached.path, client.text) } : {};
  const service = createFudicService({ index, stats: new RequestStats(), typescript: true, configs: new ProjectConfigs(fs) }).create(
    fakeServiceContext({ [URI_]: cached }, () => undefined, provided),
  );
  const document = TextDocument.create(URI_, 'fud', 1, text);
  return {
    document,
    async codes(): Promise<string[]> {
      return (((await service.provideDiagnostics?.(document, TOKEN)) ?? []) as Diagnostic[]).map((d) => String(d.code));
    },
    async actions(needle: string): Promise<CodeAction[]> {
      const at = document.positionAt(text.indexOf(needle));
      return ((await service.provideCodeActions?.(document, { start: at, end: at }, { diagnostics: [] }, TOKEN)) ?? []) as CodeAction[];
    },
    async complete(offset: number): Promise<CompletionList | undefined> {
      return (await service.provideCompletionItems?.(document, document.positionAt(offset), { triggerKind: 1 }, TOKEN)) as CompletionList | undefined;
    },
    async hover(offset: number): Promise<Hover | undefined> {
      return (await service.provideHover?.(document, document.positionAt(offset), TOKEN)) as Hover | undefined;
    },
  };
}

/** The text of `uri` once the action's edits are in it — and the reason written where the cursor goes. */
function applied(text: string, action: CodeAction | undefined, uri = URI_, reason = 'on purpose'): string {
  const document = TextDocument.create(uri, 'plain', 0, text);
  const edited = TextDocument.applyEdits(document, (action?.edit?.changes?.[uri] ?? []) as TextEdit[]);
  const cursor = action?.command?.arguments as [string, number, number] | undefined;
  if (cursor === undefined) return edited;
  const after = TextDocument.create(uri, 'plain', 1, edited);
  const at = after.offsetAt({ line: cursor[1], character: cursor[2] });
  return `${edited.slice(0, at)}${reason}${edited.slice(at)}`;
}

const pick = (actions: readonly CodeAction[], title: string): CodeAction => {
  const found = actions.find((a) => a.title === title);
  expect(found, `${title} among ${actions.map((a) => a.title).join(' | ')}`).toBeDefined();
  return found!;
};

/** Two `@click` inside a loop: two FUD1380. */
const LOOP = `@code {
  const items = [1, 2];
  function pick(n: number): void { console.log(n); }
}
<app-x>
  <template shadowrootmode="open">
    @foreach (const n of items) key (n) {
      <button @click=@pick(n)>a</button>
      <i @click=@pick(n)>b</i>
    }
  </template>
</app-x>
`;

describe('silencing in a .fud (criterion 32)', () => {
  it('on this line: the comment above with the reason, and that line is quiet; the other is not', async () => {
    const line = pick(await fud(LOOP).actions('@click=@pick(n)>a'), 'Silence FUD1380 on this line');
    const after = applied(LOOP, line);
    expect(after).toContain('      @* fud-disable-next-line FUD1380: on purpose *@\n      <button');
    expect(await fud(after).codes()).toEqual(['FUD1380']);
  });

  it('in this file, and in the project: then none', async () => {
    const config = '{\n  "id": "p"\n}';
    const actions = await fud(LOOP, config).actions('@click=@pick(n)>a');
    expect(await fud(applied(LOOP, pick(actions, 'Silence FUD1380 in this file'))).codes()).toEqual([]);
    const turned = applied(config, pick(actions, 'Turn FUD1380 off in the project'), CONFIG_URI);
    expect(turned).toBe('{\n  "id": "p",\n  "diagnostics": { "FUD1380": "off" }\n}');
    expect(await fud(LOOP, turned).codes()).toEqual([]);
  });

  it('a comment that silences nothing, and a code it refuses: «Remove», and then nothing is said', async () => {
    const unused = LOOP.replace('      <button', '      @* fud-disable-next-line FUD1022: x *@\n      <button');
    expect(await fud(unused).codes()).toEqual(['FUD1380', 'FUD1380', 'FUD1523']);
    expect(await fud(applied(unused, pick(await fud(unused).actions('@* fud'), 'Remove'))).codes()).toEqual(['FUD1380', 'FUD1380']);

    const refused = LOOP.replace('      <button', '      @* fud-disable-next-line FUD0051: x *@\n      <button');
    expect(await fud(refused).codes()).toContain('FUD1521');
    expect(await fud(applied(refused, pick(await fud(refused).actions('FUD0051'), 'Remove'))).codes()).toEqual(['FUD1380', 'FUD1380']);
  });

  it('a warning the project raised to an error is still silenced by its comment', async () => {
    const config = '{ "diagnostics": { "warnings": "error" } }';
    const after = applied(LOOP, pick(await fud(LOOP, config).actions('@click=@pick(n)>b'), 'Silence FUD1380 on this line'));
    expect(await fud(after, config).codes()).toEqual(['FUD1380']);
  });
});

const NOTE = `<head>
  <style>
    textarea {
      min-height: 3em;
      field-sizing: content;
    }
    x-menu:state(open) { color: red; }
  </style>
</head>
<app-x>
  <template shadowrootmode="open"><textarea></textarea></template>
</app-x>
`;

describe('the bulbs of a FUD1524 in a <style> (criteria 32, 33)', () => {
  it('Move to @supports leaves a rule that warns about nothing', async () => {
    const after = applied(NOTE, pick(await fud(NOTE).actions('field-sizing'), 'Move to @supports (field-sizing: content)'));
    expect(after).toContain('    }\n\n    @supports (field-sizing: content) {\n      textarea { field-sizing: content; }\n    }');
    expect((await fud(after).codes()).filter((c) => c === 'FUD1524')).toHaveLength(1);
  });

  it('Wrap in @supports selector(…) around the rule of the selector', async () => {
    const after = applied(NOTE, pick(await fud(NOTE).actions(':state'), 'Wrap in @supports selector(:state(open))'));
    expect(after).toContain('@supports selector(:state(open)) {\n      x-menu:state(open) { color: red; }\n    }');
    expect((await fud(after).codes()).filter((c) => c === 'FUD1524')).toHaveLength(2);
  });

  it('Allow it in the project, which writes the object form of baseline', async () => {
    const config = '{ "id": "p", "baseline": "widely" }';
    const turned = applied(config, pick(await fud(NOTE, config).actions('field-sizing'), 'Allow field-sizing in the project'), CONFIG_URI);
    expect(turned).toBe('{ "id": "p", "baseline": { "target": "widely", "allow": ["field-sizing"] } }');
    expect((await fud(NOTE, turned).codes()).filter((c) => c === 'FUD1524')).toHaveLength(1);
  });

  it('webstatus.dev, and a silence written as a CSS comment', async () => {
    const actions = await fud(NOTE).actions('field-sizing');
    expect(pick(actions, 'See field-sizing on webstatus.dev').command?.arguments).toEqual(['https://webstatus.dev/features/field-sizing']);
    const after = applied(NOTE, pick(actions, 'Silence FUD1524 on this line'));
    expect(after).toContain('      /* fud-disable-next-line FUD1524: on purpose */\n      field-sizing');
    // The property and its value are on that line: only the selector is left.
    expect((await fud(after).codes()).filter((c) => c === 'FUD1524')).toHaveLength(1);
  });

  it('in the markup: no @supports, the comment of the markup', async () => {
    const text = '<app-x>\n  <template shadowrootmode="open">\n    <dialog closedby="any"></dialog>\n  </template>\n</app-x>\n';
    const actions = await fud(text).actions('closedby');
    expect(actions.some((a) => a.title.startsWith('Move to') || a.title.startsWith('Wrap in'))).toBe(false);
    expect(applied(text, pick(actions, 'Silence FUD1524 on this line'))).toContain('    @* fud-disable-next-line FUD1524: on purpose *@\n    <dialog');
  });
});

describe('a FUD1524 in @code: a script comment', () => {
  it('// above the call, and then it is quiet', { timeout: 60_000 }, async () => {
    const text = `@code {\n  requestIdleCallback(() => {});\n}\n<app-x>\n  <template shadowrootmode="open"><p>x</p></template>\n</app-x>\n`;
    const world = fud(text, undefined, true);
    expect(await world.codes()).toEqual(['FUD1524']);
    const after = applied(text, pick(await world.actions('requestIdleCallback'), 'Silence FUD1524 on this line'));
    expect(after).toContain('  // fud-disable-next-line FUD1524: on purpose\n  requestIdleCallback');
    expect(await fud(after, undefined, true).codes()).toEqual([]);
  });
});

describe('completion and hover in a .fud (criterion 34)', () => {
  it('after fud-disable-next-line, the codes of the next line first', async () => {
    const text = LOOP.replace('      <button', '      @* fud-disable-next-line  *@\n      <button');
    const at = text.indexOf('next-line ') + 'next-line '.length;
    const list = (await fud(text).complete(at))!;
    const first = [...list.items].sort((a, b) => a.sortText!.localeCompare(b.sortText!))[0]!;
    expect(first.label).toBe('FUD1380');
    expect(list.items.some((i) => i.label === 'FUD0051')).toBe(false);
  });

  it('the hover over a code says its severity by default and in this project', async () => {
    const text = LOOP.replace('      <button', '      @* fud-disable-next-line FUD1380: x *@\n      <button');
    const at = text.indexOf('FUD1380') + 2;
    expect((await fud(text).hover(at))!.contents).toMatchObject({ value: expect.stringMatching(/Warning\.$/u) });
    const raised = (await fud(text, '{ "diagnostics": { "warnings": "error" } }').hover(at))!;
    expect(raised.contents).toMatchObject({ value: expect.stringMatching(/Warning by default; error in this project\.$/u) });
  });

  it('nothing of this outside a .fud of the workspace', async () => {
    const world = fud(LOOP);
    const service = createFudicService({ index: new WorkspaceIndex(memoryFs({})), stats: new RequestStats(), typescript: true }).create(
      fakeServiceContext({}, () => undefined),
    );
    expect(await service.provideCompletionItems?.(world.document, { line: 0, character: 0 }, { triggerKind: 1 }, TOKEN)).toBeUndefined();
  });
});

describe('a .fudapi and a .fudspec', () => {
  const embedded = (file: URI) => URI.parse(`volar-embedded-content://root/${encodeURIComponent(file.toString())}`);
  const decoder = (file: URI) => (uri: URI): [URI, string] | undefined => (uri.toString() === embedded(file).toString() ? [file, 'root'] : undefined);
  const config = { path: '/ws/app/fudic.json', text: '{}' };
  const zero = (document: TextDocument) => ({ start: document.positionAt(0), end: document.positionAt(0) });

  it('a .fudapi: «Remove» for a comment that silences nothing, the codes after the keyword, the hover', async () => {
    const api = URI.file(`${SRC}/notes.fudapi`);
    const text = '# fud-disable FUD1380: nothing here\n# fud-disable \n';
    const make = (withConfig: boolean) => {
      const { host, implementations, generated } = apiWorld({});
      return createFudapiService({
        host,
        implementations,
        generated,
        stats: new RequestStats(),
        ...(withConfig ? { configFileFor: () => config } : {}),
      }).create(fakeServiceContext({}, decoder(api)));
    };
    const document = TextDocument.create(embedded(api).toString(), 'fudapi', 1, text);
    for (const withConfig of [false, true]) {
      const actions = (await make(withConfig).provideCodeActions?.(document, zero(document), { diagnostics: [] }, CancellationToken.None)) as CodeAction[];
      expect(actions.map((a) => a.title)).toContain('Remove');
    }
    const list = (await make(false).provideCompletionItems?.(document, document.positionAt(text.length - 1), { triggerKind: 1 }, CancellationToken.None)) as CompletionList;
    expect(list.items.some((i) => i.label === 'FUD1380')).toBe(true);
    const hover = (await make(false).provideHover?.(document, document.positionAt(16), CancellationToken.None)) as Hover;
    expect(hover.contents).toMatchObject({ value: expect.stringContaining('**FUD1380**') });
  });

  it('a .fudspec: the same', async () => {
    const spec = URI.file(SPEC_PATH);
    const text = 'component fud-card\n# fud-disable FUD1380: nothing here\n# fud-disable \ncriterion a\n  given\n    props vacio\n  then\n    min-height fud-card 44\n';
    const make = (withConfig: boolean) => {
      const { host } = specWorld({});
      return createFudspecService({ host, stats: new RequestStats(), ...(withConfig ? { configFileFor: () => config } : {}) }).create(fakeServiceContext({}, decoder(spec)));
    };
    const document = TextDocument.create(embedded(spec).toString(), 'fudspec', 1, text);
    const line = (n: number) => ({ start: { line: n, character: 0 }, end: { line: n, character: 0 } });
    for (const withConfig of [false, true]) {
      const actions = (await make(withConfig).provideCodeActions?.(document, line(1), { diagnostics: [] }, CancellationToken.None)) as CodeAction[];
      expect(actions.map((a) => a.title)).toContain('Remove');
    }
    const slot = text.indexOf('# fud-disable \n') + '# fud-disable '.length;
    const list = (await make(false).provideCompletionItems?.(document, document.positionAt(slot), { triggerKind: 1 }, CancellationToken.None)) as CompletionList;
    expect(list.items.some((i) => i.label === 'FUD1380')).toBe(true);
    const hover = (await make(false).provideHover?.(document, document.positionAt(text.indexOf('FUD1380') + 1), CancellationToken.None)) as Hover;
    expect(hover.contents).toMatchObject({ value: expect.stringContaining('**FUD1380**') });
  });
});

describe('ProjectConfigs.configFileFor', () => {
  it('the nearest usable fudic.json with its text, or nothing', () => {
    const configs = new ProjectConfigs(memoryFs({ '/w/a/fudic.json': '{ "id": "a" }', '/w/b/fudic.json': '{ nope' }));
    expect(configs.configFileFor('/w/a/src/x.fud')).toEqual({ path: '/w/a/fudic.json', text: '{ "id": "a" }' });
    expect(configs.configFileFor('/w/b/src/x.fud')).toBeUndefined();
    expect(configs.configFileFor('/w/c/src/x.fud')).toBeUndefined();
  });
});

describe('ownDiagnostics', () => {
  it('keeps what is about this file, written with its path or with none, and leaves another file out', () => {
    const at = { start: 0, end: 1 };
    const d = (file?: string) => ({ code: 'FUD1380' as const, severity: 'warning' as const, message: '', span: at, ...(file === undefined ? {} : { file }) });
    expect(ownDiagnostics(PATH, [d(), d(PATH), d('/p/src/other.fud')])).toEqual([d(), d(PATH)]);
  });
});
