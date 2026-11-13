/**
 * SDD-84 §4.6 and criterion 31 in the editor: `FUD1555` on the `@code` of a `.fud`, next to the
 * Baseline detector, when the pages of its project require Trusted Types — its `page.headers`, or
 * the template when it has none — and never in a library; and a `FUD1555` the project raises to an
 * error is a fudic error that silences TypeScript.
 */

import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import { clientFileName } from '@fudic/language-core';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
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
  const el = document.createElement('div');
  const text: string = '<b>x</b>';
  el.innerHTML = text;
}
<app-x>
  <template shadowrootmode="open"><p>x</p></template>
</app-x>
`;

const APP = '{"id":"p"}';

/** The `FUD1555` the editor publishes over `SOURCE`, as the text under each. */
async function published(files: Readonly<Record<string, string>>, typescript = true): Promise<string[]> {
  const fs = memoryFs({ ...files, [PATH]: SOURCE });
  const index = new WorkspaceIndex(fs);
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, SOURCE);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(cached.path))!;
  const uri = URI.file(PATH).toString();
  const provided = typescript ? { 'typescript/languageService': projectionService(cached.path, client.text) } : {};
  const service = createFudicService({ index, stats: new RequestStats(), typescript: true, configs: new ProjectConfigs(fs) }).create(
    fakeServiceContext({ [uri]: cached }, () => undefined, provided),
  );
  const document = TextDocument.create(uri, 'fud', 1, SOURCE);
  const found = ((await service.provideDiagnostics?.(document, TOKEN)) ?? []) as Diagnostic[];
  return found.filter((d) => d.code === 'FUD1555').map((d) => SOURCE.slice(document.offsetAt(d.range.start), document.offsetAt(d.range.end)));
}

describe('FUD1555 in the editor (criterion 31)', () => {
  it('a string to innerHTML in an app with the template: the template requires Trusted Types', { timeout: 60_000 }, async () => {
    expect(await published({ '/p/fudic.json': APP })).toEqual(['el.innerHTML = text']);
  });

  it("not when the app's page.headers does not require them, nor in a library, nor with no project", { timeout: 60_000 }, async () => {
    expect(await published({ '/p/fudic.json': APP, '/p/page.headers': "Content-Security-Policy: default-src 'self'\n" })).toEqual([]);
    expect(await published({ '/p/fudic.json': '{"kind":"lib","prefix":"app"}' })).toEqual([]);
    expect(await published({})).toEqual([]);
  });

  it('with no program, nothing is judged', async () => {
    expect(await published({ '/p/fudic.json': APP }, false)).toEqual([]);
  });
});

describe('a FUD1555 the project raises to an error speaks', () => {
  const cached = new DocumentCache(new WorkspaceIndex(memoryFs({ [PATH]: SOURCE }))).get(PATH, 1, SOURCE);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(PATH))!;
  const projection = TextDocument.create('volar-embedded-content://client_ts/p', 'typescript', 1, client.text);
  // A TypeScript diagnostic over the assignment, in the projection's coordinates.
  const start = client.text.indexOf('el.innerHTML = text');
  const found = [{ range: { start: projection.positionAt(start), end: projection.positionAt(start + 19) }, message: 'ts' }];
  const plugin: LanguageServicePlugin = { name: 'typescript-semantic', capabilities: {}, create: () => ({ provideDiagnostics: () => found }) };
  const context = {
    decodeEmbeddedDocumentUri: () => [URI.file(PATH), 'client_ts'],
    language: { scripts: { get: () => ({ generated: { root: { client: { id: 'client_ts' }, document: cached } } }) } },
    inject: (key: string) => (key === 'typescript/languageService' ? projectionService(cached.path, client.text) : undefined),
  } as unknown as LanguageServiceContext;
  const errors = () => ({ codes: new Map(), warnings: 'error' as const });

  it('with Trusted Types required, the TypeScript diagnostic it meets is silenced', { timeout: 60_000 }, async () => {
    const [wrapped] = silenceEchoes([plugin], new WorkspaceIndex(memoryFs({})), errors, () => undefined, () => true);
    expect(await wrapped!.create(context).provideDiagnostics!(projection, TOKEN)).toEqual([]);
  });

  it('without them, it speaks', { timeout: 60_000 }, async () => {
    const [wrapped] = silenceEchoes([plugin], new WorkspaceIndex(memoryFs({})), errors);
    expect(await wrapped!.create(context).provideDiagnostics!(projection, TOKEN)).toEqual(found);
  });
});

describe('ProjectConfigs.projectFor', () => {
  it('the nearest fudic.json above the file, with its folder; null with none', () => {
    const configs = new ProjectConfigs(memoryFs({ '/w/a/fudic.json': '{"kind":"lib","prefix":"ui"}' }));
    expect(configs.projectFor('/w/a/src/x.fud')).toEqual({ root: '/w/a', config: expect.objectContaining({ kind: 'lib' }) });
    expect(configs.projectFor('/w/b/src/x.fud')).toBeNull();
  });
});
