/** After the shutdown no service validates: a late Volar batch would ask a disposed project. */

import { describe, expect, it } from 'vitest';
import type { LanguageServicePlugin } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { quietAfterShutdown } from '../../src/services/shutdown.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';

const DOC = TextDocument.create('file:///a.fud', 'fud', 1, '');

describe('quietAfterShutdown', () => {
  it('passes diagnostics through until the server closes, then answers nothing', async () => {
    let closed = false;
    const [plugin] = quietAfterShutdown(
      [{ name: 'x', capabilities: {}, create: () => ({ provideDiagnostics: () => [{ message: 'm', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }] }) }],
      () => closed,
    );
    const instance = plugin!.create(fakeServiceContext({}));
    expect(await instance.provideDiagnostics?.(DOC, TOKEN)).toHaveLength(1);
    closed = true;
    expect(await instance.provideDiagnostics?.(DOC, TOKEN)).toBeUndefined();
  });

  it('leaves a service with no diagnostics as it is', () => {
    const instance = {};
    const plugin: LanguageServicePlugin = { name: 'y', capabilities: {}, create: () => instance };
    expect(quietAfterShutdown([plugin], () => true)[0]!.create(fakeServiceContext({}))).toBe(instance);
  });
});
