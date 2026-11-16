/**
 * SDD-83 §3.10: the editor publishes what the build reports — the diagnostics of a `.fud`, a
 * `.fudapi` and a `.fudspec` under the policy of the nearest `fudic.json` and the file's own
 * comments, with a `FUD1523` for a comment that silences nothing.
 */

import { describe, expect, it } from 'vitest';
import { CancellationToken, type Diagnostic } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { Policy } from '@fudic/diagnostics';
import { DocumentCache } from '../../src/document-cache.js';
import { createFudapiService } from '../../src/fudapi/service.js';
import { createFudspecService } from '../../src/fudspec/service.js';
import { ProjectConfigs } from '../../src/project-config.js';
import { createFudicService } from '../../src/services/plugin.js';
import { RequestStats } from '../../src/stats.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { memoryFs } from '../_support.js';
import { SRC, world as apiWorld } from '../fudapi/_api.js';
import { SPEC_PATH, world as specWorld } from '../fudspec/_spec.js';

const PATH = '/p/src/app-x.fud';

/** Two `@click` inside a loop, on 0-based lines 7 and 8: two FUD1380. */
const LOOP = (comment = '') => `@code {
  const items = [1, 2];
  function pick(n: number): void { console.log(n); }
}
<app-x>
  <template shadowrootmode="open">
    @foreach (const n of items) key (n) {
${comment}      <button @click=@pick(n)>a</button>
      <i @click=@pick(n)>b</i>
    }
  </template>
</app-x>
`;

async function fudDiagnostics(text: string, config?: string): Promise<string[]> {
  const fs = memoryFs({ ...(config === undefined ? {} : { '/p/fudic.json': config }), [PATH]: text });
  const index = new WorkspaceIndex(fs);
  index.scan('/p');
  const configs = new ProjectConfigs(fs);
  const cached = new DocumentCache(index).get(PATH, 1, text);
  const uri = URI.file(PATH).toString();
  const context = fakeServiceContext({ [uri]: cached }, () => undefined, {});
  const service = createFudicService({ index, stats: new RequestStats(), typescript: true, configs }).create(context);
  const found = ((await service.provideDiagnostics?.(TextDocument.create(uri, 'fud', 1, text), TOKEN)) ?? []) as Diagnostic[];
  return found.map((d) => `${String(d.code)} ${d.severity}`);
}

describe('a .fud in the editor', () => {
  it('as it is, with no fudic.json', async () => {
    expect(await fudDiagnostics(LOOP())).toEqual(['FUD1380 2', 'FUD1380 2']);
  });

  it('under the nearest fudic.json', async () => {
    expect(await fudDiagnostics(LOOP(), '{"diagnostics":{"FUD1380":"off"}}')).toEqual([]);
    expect(await fudDiagnostics(LOOP(), '{"diagnostics":{"warnings":"error"}}')).toEqual(['FUD1380 1', 'FUD1380 1']);
  });

  it('silenced by its comment, and a comment that silences nothing is a hint', async () => {
    const comment = '      @* fud-disable-next-line FUD1380, FUD1022: on purpose *@\n';
    expect(await fudDiagnostics(LOOP(comment))).toEqual(['FUD1380 2', 'FUD1523 4']);
  });
});

describe('a .fudapi and a .fudspec in the editor', () => {
  const off: Policy = { codes: new Map([['FUD1523', 'off']]) };

  it('a .fudapi: its comment that silences nothing, unless the project turns it off', async () => {
    const path = `${SRC}/notes.fudapi`;
    const api = URI.file(path);
    const embedded = URI.parse(`volar-embedded-content://root/${encodeURIComponent(api.toString())}`);
    const decode = (uri: URI): [URI, string] | undefined => (uri.toString() === embedded.toString() ? [api, 'root'] : undefined);
    const text = '# fud-disable FUD1380: nothing here\n';
    const pull = async (policyFor?: (p: string) => Policy | null) => {
      const { host, implementations, generated } = apiWorld({});
      const service = createFudapiService({
        host,
        implementations,
        generated,
        stats: new RequestStats(),
        ...(policyFor === undefined ? {} : { policyFor }),
      }).create(fakeServiceContext({}, decode));
      const found = ((await service.provideDiagnostics?.(TextDocument.create(embedded.toString(), 'fudapi', 1, text), CancellationToken.None)) ??
        []) as Diagnostic[];
      return found.map((d) => d.code);
    };
    expect(await pull()).toEqual(['FUD1523']);
    expect(await pull(() => off)).toEqual([]);
  });

  it('a .fudspec: the same', async () => {
    const spec = URI.file(SPEC_PATH);
    const embedded = URI.parse(`volar-embedded-content://root/${encodeURIComponent(spec.toString())}`);
    const decode = (uri: URI): [URI, string] | undefined => (uri.toString() === embedded.toString() ? [spec, 'root'] : undefined);
    const text = 'component fud-card\n# fud-disable FUD1380: nothing here\ncriterion a\n  given\n    props vacio\n  then\n    min-height fud-card 44\n';
    const pull = async (policyFor?: (p: string) => Policy | null) => {
      const { host } = specWorld({});
      const service = createFudspecService({ host, stats: new RequestStats(), ...(policyFor === undefined ? {} : { policyFor }) }).create(
        fakeServiceContext({}, decode),
      );
      const found = ((await service.provideDiagnostics?.(TextDocument.create(embedded.toString(), 'fudspec', 1, text), CancellationToken.None)) ??
        []) as Diagnostic[];
      return found.map((d) => d.code);
    };
    expect(await pull()).toEqual(['FUD1523']);
    expect(await pull(() => off)).toEqual([]);
  });
});

describe('ProjectConfigs.policyFor', () => {
  it('the nearest fudic.json above the file, or null', () => {
    const configs = new ProjectConfigs(memoryFs({ '/w/a/fudic.json': '{"diagnostics":{"FUD1380":"off"}}' }));
    expect(configs.policyFor('/w/a/src/x.fud')?.codes.get('FUD1380')).toBe('off');
    expect(configs.policyFor('/w/b/src/x.fud')).toBeNull();
  });
});
