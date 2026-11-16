/**
 * SDD-83 §3.6 in the editor: the three detectors of a `.fud` — its markup, its `<style>` and its
 * `@code` — published against the Baseline of the nearest `fudic.json`, as the build reports them;
 * and a `FUD1524` the project raises to an error is a fudic error that silences TypeScript.
 */

import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { clientFileName } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { ProjectConfigs } from '../../src/project-config.js';
import { silenceEchoes } from '../../src/services/one-voice.js';
import { createFudicService } from '../../src/services/plugin.js';
import { RequestStats } from '../../src/stats.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { browserProjectionService as projectionService, memoryFs } from '../_support.js';

const PATH = '/p/src/app-x.fud';

const SOURCE = `@code {
  requestIdleCallback(() => {});
}
<head><style>textarea { field-sizing: content; }</style></head>
<app-x>
  <template shadowrootmode="open"><dialog closedby="any"></dialog></template>
</app-x>
`;

/** The `FUD1524` the editor publishes, as `text-under-it`, with or without a TypeScript service and the configs. */
async function published(options: { readonly typescript: boolean; readonly configs: boolean; readonly config?: string }): Promise<string[]> {
  const fs = memoryFs({ ...(options.config === undefined ? {} : { '/p/fudic.json': options.config }), [PATH]: SOURCE });
  const index = new WorkspaceIndex(fs);
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, SOURCE);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(cached.path))!;
  const uri = URI.file(PATH).toString();
  const provided = options.typescript ? { 'typescript/languageService': projectionService(cached.path, client.text) } : {};
  const context = fakeServiceContext({ [uri]: cached }, () => undefined, provided);
  const configs = options.configs ? { configs: new ProjectConfigs(fs) } : {};
  const service = createFudicService({ index, stats: new RequestStats(), typescript: true, ...configs }).create(context);
  const document = TextDocument.create(uri, 'fud', 1, SOURCE);
  const found = ((await service.provideDiagnostics?.(document, TOKEN)) ?? []) as Diagnostic[];
  return found
    .filter((d) => d.code === 'FUD1524')
    .map((d) => SOURCE.slice(document.offsetAt(d.range.start), document.offsetAt(d.range.end)));
}

describe('the detectors in the editor', () => {
  it('the markup, the <style> and the @code, against widely when the project says nothing', { timeout: 60_000 }, async () => {
    expect(await published({ typescript: true, configs: true })).toEqual([
      'closedby',
      'field-sizing',
      'content',
      'requestIdleCallback',
    ]);
  });

  it('with no TypeScript service, the markup and the <style> only', async () => {
    expect(await published({ typescript: false, configs: true })).toEqual(['closedby', 'field-sizing', 'content']);
  });

  it('with no configs, the host cannot say what the project asks for: nothing is judged', async () => {
    expect(await published({ typescript: true, configs: false })).toEqual([]);
  });

  it('what the nearest fudic.json allows does not warn', async () => {
    const config = '{"baseline":{"target":"widely","allow":["field-sizing"]}}';
    expect(await published({ typescript: false, configs: true, config })).toEqual(['closedby']);
  });
});

describe('ProjectConfigs.baselineFor', () => {
  it('the nearest fudic.json above the file, or widely', () => {
    const configs = new ProjectConfigs(memoryFs({ '/w/a/fudic.json': '{"baseline":2024}' }));
    expect(configs.baselineFor('/w/a/src/x.fud').target).toBe(2024);
    expect(configs.baselineFor('/w/b/src/x.fud')).toEqual({ target: 'widely', allow: new Set() });
  });
});

describe('a FUD1524 the project raises to an error speaks', () => {
  const cached = new DocumentCache(new WorkspaceIndex(memoryFs({ [PATH]: SOURCE }))).get(PATH, 1, SOURCE);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(PATH))!;
  const projection = TextDocument.create('volar-embedded-content://client_ts/p', 'typescript', 1, client.text);
  // A TypeScript diagnostic over `requestIdleCallback`, in the projection's coordinates.
  const start = client.text.indexOf('requestIdleCallback');
  const found = [{ range: { start: projection.positionAt(start), end: projection.positionAt(start + 19) }, message: 'ts' }];
  const plugin: LanguageServicePlugin = { name: 'typescript-semantic', capabilities: {}, create: () => ({ provideDiagnostics: () => found }) };
  const context = (typescript: boolean): LanguageServiceContext =>
    ({
      decodeEmbeddedDocumentUri: () => [URI.file(PATH), 'client_ts'],
      language: { scripts: { get: () => ({ generated: { root: { client: { id: 'client_ts' }, document: cached } } }) } },
      inject: (key: string) => (typescript && key === 'typescript/languageService' ? projectionService(cached.path, client.text) : undefined),
    }) as unknown as LanguageServiceContext;
  const errors = () => ({ codes: new Map(), warnings: 'error' as const });
  const widely = () => ({ target: 'widely' as const, allow: new Set<string>() });

  it('with the program, the TypeScript diagnostic it meets is silenced', { timeout: 60_000 }, async () => {
    const [wrapped] = silenceEchoes([plugin], new WorkspaceIndex(memoryFs({})), errors, widely);
    expect(await wrapped!.create(context(true)).provideDiagnostics!(projection, TOKEN)).toEqual([]);
  });

  it('without the program, or without a baseline, the @code is not judged', async () => {
    const [wrapped] = silenceEchoes([plugin], new WorkspaceIndex(memoryFs({})), errors, widely);
    expect(await wrapped!.create(context(false)).provideDiagnostics!(projection, TOKEN)).toEqual(found);
    const [plain] = silenceEchoes([plugin], new WorkspaceIndex(memoryFs({})), errors);
    expect(await plain!.create(context(true)).provideDiagnostics!(projection, TOKEN)).toEqual(found);
  });
});
