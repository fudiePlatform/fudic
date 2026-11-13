/**
 * SDD-81 criterion 34 in the editor: a `fudic.json` with a bad `serve` is `FUD1488` while it is
 * written, over the field, as the build says it; any other document gets nothing.
 */

import { describe, expect, it } from 'vitest';
import { CancellationToken, type Diagnostic } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { configDiagnostics, createConfigFileService } from '../../src/services/config-file.js';
import { RequestStats } from '../../src/stats.js';
import ts from 'typescript';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext } from '../_lsp.js';
import { memoryFs } from '../_support.js';

const json = (text: string, uri = 'file:///p/fudic.json'): TextDocument => TextDocument.create(uri, 'json', 1, text);
const BASE = { kind: 'app', id: 'p', prefix: 'app' };

describe('the diagnostics of a fudic.json (criterion 34)', () => {
  it('serve.uploads with a size that is none: FUD1488 on the field', () => {
    const text = JSON.stringify({ ...BASE, serve: { uploads: { maxFileSize: 'x' } } }, null, 2);
    const found = configDiagnostics(json(text))!;
    expect(found.map((d) => d.code)).toEqual(['FUD1488']);
    const at = text.indexOf('"maxFileSize"');
    expect(found[0]!.range.start).toEqual(json(text).positionAt(at));
    expect(found[0]!.severity).toBe(1);
    expect(found[0]!.codeDescription?.href).toContain('FUD1488');
  });

  it('serve.trustProxy that is no boolean: FUD1488', () => {
    expect(configDiagnostics(json(JSON.stringify({ ...BASE, serve: { trustProxy: 1 } })))!.map((d) => d.code)).toEqual(['FUD1488']);
  });

  it('a file that is not JSON: FUD0725 at its start', () => {
    const found = configDiagnostics(json('{ nope'))!;
    expect(found.map((d) => d.code)).toEqual(['FUD0725']);
    expect(found[0]!.range).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
  });

  it('a good one says nothing, and another JSON is none of its business', () => {
    expect(configDiagnostics(json(JSON.stringify({ ...BASE, serve: { trustProxy: true } })))).toEqual([]);
    expect(configDiagnostics(json('{ nope', 'file:///p/package.json'))).toBeUndefined();
    expect(configDiagnostics(json('{ nope', 'file:///p/not-fudic.json'))).toBeUndefined();
  });

  it('through the service', async () => {
    const service = createConfigFileService({ stats: new RequestStats() }).create(fakeServiceContext({}, () => undefined));
    const found = (await service.provideDiagnostics?.(json('{ nope'), CancellationToken.None)) as Diagnostic[];
    expect(found.map((d) => d.code)).toEqual(['FUD0725']);
  });
});

describe('what the project as a whole says of its Baseline, opening its fudic.json (SDD-83 §4.1)', () => {
  const NOTE = `<head><style>textarea { field-sizing: content; }</style></head>\n<acme-note>\n  <template shadowrootmode="open"><p>x</p></template>\n</acme-note>\n`;
  const MENU = `<head><style>:host(:state(open)) { color: red; }</style></head>\n<app-menu>\n  <template shadowrootmode="open"><p>x</p></template>\n</app-menu>\n`;
  const CONFIG = JSON.stringify({ id: 'app', baseline: { allow: ['state', 'popover'] } });
  const FILES = {
    '/p/package.json': JSON.stringify({ name: 'app', dependencies: { '@acme/ui': '1.0.0', '@acme/named': '1.0.0' } }),
    // A library with its name, which writes nothing the app refuses.
    '/p/node_modules/@acme/named/package.json': JSON.stringify({ name: '@acme/named', version: '1.0.0' }),
    '/p/node_modules/@acme/named/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'named' }),
    // No name: the library goes by its folder. A sheet of `styles`: read from the disk.
    '/p/node_modules/@acme/ui/package.json': JSON.stringify({ version: '1.0.0' }),
    '/p/node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'acme', baseline: 'newly', styles: { note: 'note.css' } }),
    '/p/node_modules/@acme/ui/note.css': '.x { anchor-name: --a; }',
    // In the index, but the editor holds no projection of it.
    '/p/src/app-unread.fud': MENU.replaceAll('app-menu', 'app-unread'),
    // Another folder of the workspace: not this project's.
    '/q/src/app-other.fud': MENU.replaceAll('app-menu', 'app-other'),
    '/p/node_modules/@acme/ui/acme-note.fud': NOTE,
    '/p/src/app-menu.fud': MENU,
  };

  /** A TypeScript service with an empty program: the markup and the `<style>` need none. */
  const emptyService = (): ts.LanguageService =>
    ts.createLanguageService({
      getScriptFileNames: () => [],
      getScriptVersion: () => '1',
      getScriptSnapshot: () => undefined,
      getCurrentDirectory: () => '/p',
      getCompilationSettings: () => ({}),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: () => false,
      readFile: () => undefined,
    });

  async function diagnose(text: string, typescript = true): Promise<Diagnostic[]> {
    const fs = memoryFs(FILES);
    const index = new WorkspaceIndex(fs);
    index.scan('/p');
    index.scan('/q');
    const cache = new DocumentCache(index);
    const documents = Object.fromEntries(
      ['/p/node_modules/@acme/ui/acme-note.fud', '/p/src/app-menu.fud', '/q/src/app-other.fud'].map((path) => [
        URI.file(path).toString(),
        cache.get(path, 1, FILES[path as keyof typeof FILES]),
      ]),
    );
    const provided = typescript ? { 'typescript/languageService': emptyService() } : {};
    const service = createConfigFileService({ stats: new RequestStats(), project: { index, fs, typescript: ts } }).create(
      fakeServiceContext(documents, () => undefined, provided),
    );
    return ((await service.provideDiagnostics?.(json(text, URI.file('/p/fudic.json').toString()), CancellationToken.None)) ??
      []) as Diagnostic[];
  }

  it('a library that writes what the app does not accept is FUD1526; an id nothing uses, FUD1528 on it', async () => {
    const found = await diagnose(CONFIG);
    expect(found.map((d) => [d.code, d.severity])).toEqual([
      ['FUD1526', 2],
      ['FUD1528', 4],
    ]);
    expect(found[0]!.message).toBe("`/p/node_modules/@acme/ui` uses features this app's Baseline does not accept: anchor-positioning, field-sizing");
    const at = CONFIG.indexOf('"popover"');
    expect(found[1]!.range.start).toEqual(json(CONFIG).positionAt(at));
  });

  it('under the policy of the file itself', async () => {
    const raised = JSON.stringify({ id: 'app', baseline: { allow: ['state'] }, diagnostics: { FUD1526: 'error' } });
    expect((await diagnose(raised)).map((d) => [d.code, d.severity])).toEqual([['FUD1526', 1]]);
    // With no "baseline" written, about the whole file.
    const [whole] = await diagnose(JSON.stringify({ id: 'app' }));
    expect(whole!.range.start).toEqual({ line: 0, character: 0 });
  });

  it('nothing more with no program, or a file that is not usable', async () => {
    expect(await diagnose(CONFIG, false)).toEqual([]);
    expect((await diagnose('{ nope')).map((d) => d.code)).toEqual(['FUD0725']);
    const other = createConfigFileService({
      stats: new RequestStats(),
      project: { index: new WorkspaceIndex(memoryFs({})), fs: memoryFs({}), typescript: ts },
    }).create(fakeServiceContext({}, () => undefined));
    expect(await other.provideDiagnostics?.(json('{}', 'file:///p/package.json'), CancellationToken.None)).toBeUndefined();
  });
});
