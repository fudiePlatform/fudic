/**
 * The adapter (SDD-25 §4.1, §5).
 *
 * The one file that imports `vscode`, so the one file a test can only reach through a
 * double — which is precisely why it is required to have no branches. What is checked here
 * is the wiring: that the ports are built from the right places, that the client is
 * registered under the id `fudic.trace.server` depends on, and that deactivation is safe
 * whether or not activation ever got anywhere.
 */

import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { activate, createClient, deactivate } from '../src/extension.js';
import { LanguageClient } from './_languageclient-stub.js';
import { reset, state } from './_vscode-stub.js';
import type { ExtensionContext, OutputChannel } from 'vscode';
import type { ClientLaunch } from '../src/ports.js';

const context = (): ExtensionContext =>
  ({ extensionPath: '/ext', subscriptions: [] }) as unknown as ExtensionContext;

beforeEach(() => {
  reset();
  LanguageClient.reset();
});

describe('activate', () => {
  it('builds the client from the workspace, the app root and the extension path', async () => {
    state.folders = [{ uri: { fsPath: '/work/app' } }];
    state.appRoot = '/vscode';

    const ctx = context();
    await activate(ctx);

    const client = LanguageClient.created[0];
    expect(client?.id).toBe('fudic');
    expect(client?.started).toBe(1);
    expect(ctx.subscriptions).toHaveLength(1);
  });

  it('points the server at the bundled bundle and watches the three globs', async () => {
    await activate(context());

    const options = LanguageClient.created[0]?.serverOptions as { run: { module: string } };
    expect(options.run.module).toBe(join('/ext', 'dist', 'server.cjs'));
    expect(state.watchers).toEqual(['**/*.fud', '**/tsconfig*.json', '**/package.json']);
  });

  it('reports through the output channel and the warning surface', async () => {
    // No workspace folder and no TypeScript anywhere: the degraded path, end to end,
    // through the real adapter rather than a hand-built host.
    await activate(context());

    expect(state.output.some((line) => line.startsWith('server:'))).toBe(true);
    expect(state.warnings).toHaveLength(1);
  });

  it('comes up even when the server refuses to start', async () => {
    LanguageClient.failNextStart = true;

    await expect(activate(context())).resolves.toBeUndefined();
  });
});

describe('createClient', () => {
  it('narrows the client to the three things this package does with it', async () => {
    // The port exists so the rest of the package cannot reach for the client's other four
    // hundred members. Which means the narrowing itself is the contract, and it gets driven
    // here rather than being the one wrapper nobody exercises.
    const launch: ClientLaunch = {
      serverPath: '/srv.js',
      documentSelector: [{ scheme: 'file', language: 'fudic' }],
      fileEvents: ['**/*.fud'],
      initializationOptions: {
        typescript: { tsdk: '/lib' },
        fudic: { templateDiagnostics: true, exposeVirtualFiles: false },
      },
    };
    const port = createClient(launch, { appendLine: () => undefined } as unknown as OutputChannel);

    await port.start();
    await port.sendRequest('fudic/virtualFiles', { uri: 'file:///x.fud' });
    await port.stop();

    const client = LanguageClient.created[0];
    expect(client?.started).toBe(1);
    expect(client?.stopped).toBe(1);
    expect(client?.requests).toEqual([
      { method: 'fudic/virtualFiles', params: { uri: 'file:///x.fud' } },
    ]);
  });
});

describe('deactivate', () => {
  it('stops a running client', async () => {
    await activate(context());
    await deactivate();

    expect(LanguageClient.created[0]?.stopped).toBe(1);
  });

  it('is safe when there was never a session', async () => {
    // VS Code calls it on shutdown regardless of how activation went — including after an
    // activation that threw before there was anything to stop.
    await expect(deactivate()).resolves.toBeUndefined();
  });
});
