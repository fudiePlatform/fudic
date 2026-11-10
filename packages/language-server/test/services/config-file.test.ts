/**
 * SDD-81 criterion 34 in the editor: a `fudic.json` with a bad `serve` is `FUD1488` while it is
 * written, over the field, as the build says it; any other document gets nothing.
 */

import { describe, expect, it } from 'vitest';
import { CancellationToken, type Diagnostic } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { configDiagnostics, createConfigFileService } from '../../src/services/config-file.js';
import { RequestStats } from '../../src/stats.js';
import { fakeServiceContext } from '../_lsp.js';

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
