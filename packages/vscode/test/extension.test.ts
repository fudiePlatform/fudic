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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, createClient, deactivate } from '../src/extension.js';
import { LanguageClient } from './_languageclient-stub.js';
import { editorFor, focusEditor, reset, state } from './_vscode-stub.js';
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
    // Everything the adapter creates is pushed onto the subscriptions: the channel, the
    // status bar, the listeners, the content provider and the four commands. What matters
    // is that none of it is left for the garbage collector to guess about.
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(9);
    expect([...state.commandHandlers.keys()]).toContain('fudic.restartServer');
  });

  it('points the server at the bundled bundle and watches the three globs', async () => {
    await activate(context());

    const options = LanguageClient.created[0]?.serverOptions as { run: { module: string } };
    expect(options.run.module).toBe(join('/ext', 'dist', 'server.mjs'));
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
    // The adapter's clock is the real `setTimeout`, so the supervisor's backoff is faked
    // here rather than waited out — this is the one place the two meet.
    vi.useFakeTimers();
    LanguageClient.failNextStart = true;

    const activation = activate(context());
    await vi.runAllTimersAsync();

    await expect(activation).resolves.toBeUndefined();
    expect(LanguageClient.created[0]?.started).toBe(2);
    vi.useRealTimers();
  });
});

describe('the status bar', () => {
  it('shows the state of a .fud that was already open at activation', async () => {
    // The editor open when the extension wakes never fires the change event, so this is the
    // path a cold start actually takes — and the one that shows nothing if it is forgotten.
    state.activeEditor = editorFor('fudic');
    await activate(context());

    expect(state.bar.visible).toBe(true);
    expect(state.bar.text).toBe('Fudic ⚠');
  });

  it('follows the focus between languages', async () => {
    await activate(context());

    focusEditor(editorFor('fudic'));
    expect(state.bar.visible).toBe(true);

    focusEditor(editorFor('markdown'));
    expect(state.bar.visible).toBe(false);

    focusEditor(undefined);
    expect(state.bar.visible).toBe(false);
  });

  it('ignores focus changes that arrive without a session', async () => {
    // The listener is registered before the server is started and outlives deactivation, so
    // a tab switch in either window must not throw inside the event handler.
    await activate(context());
    await deactivate();

    expect(() => focusEditor(editorFor('fudic'))).not.toThrow();
  });

  it('opens the output channel when clicked', async () => {
    await activate(context());

    expect(state.bar.command).toBe('fudic.showOutput');
    state.commandHandlers.get('fudic.showOutput')?.();
    expect(state.outputShown).toBe(1);
  });
});

describe('the commands, through the adapter', () => {
  const run = async (id: string): Promise<void> => {
    await (state.commandHandlers.get(id) as (() => Promise<void>) | undefined)?.();
  };

  it('opens each virtual in its own editor, under the virtual scheme', async () => {
    // Criterion 8 as far as it can be taken without an editor: the request goes out, the
    // documents come back under `fudic-virtual:`, and each is given its language. Whether
    // VS Code then paints them is what the manual script is for.
    state.activeEditor = editorFor('fudic', 'file:///work/blog/[slug].fud');
    LanguageClient.answers['fudic/virtualFiles'] = [
      { fileName: 'blog/[slug].fud.ts', languageId: 'typescript', text: 'export {}' },
      { fileName: 'blog/[slug].fud.0.css', languageId: 'css', text: ':host{}' },
    ];
    await activate(context());

    await run('fudic.showVirtualFiles');

    expect(state.openedDocuments.map(([, language]) => language)).toEqual(['typescript', 'css']);
    const [uri] = state.openedDocuments[0] ?? [];
    expect(uri?.scheme).toBe('fudic-virtual');
  });

  it('serves the stored text back through the content provider', async () => {
    // The absolute path a virtual really carries, and the one the bug lived in: the store used
    // to be keyed on the URI text, which VS Code re-encodes on the way back — the provider was
    // asked for a key that had never been stored, and every editor opened empty.
    state.activeEditor = editorFor('fudic');
    LanguageClient.answers['fudic/virtualFiles'] = [
      { fileName: 'c:/work/components/x.fud.ts', languageId: 'typescript', text: 'const a = 1;' },
    ];
    await activate(context());
    await run('fudic.showVirtualFiles');

    const provider = state.contentProviders.get('fudic-virtual');
    const [uri] = state.openedDocuments[0] ?? [];
    // Asked with the very `Uri` object the editor holds, not with a string built here.
    expect(provider?.provideTextDocumentContent(uri!)).toBe('const a = 1;');
  });

  it('formats through the editor command, not by talking to the server', async () => {
    state.activeEditor = editorFor('fudic');
    await activate(context());

    await run('fudic.formatDocument');

    expect(state.executed).toEqual(['editor.action.formatDocument']);
  });

  it('restarts, and reports through the warning surface when it cannot', async () => {
    state.activeEditor = editorFor('fudic');
    await activate(context());
    const before = state.warnings.length;

    await run('fudic.restartServer');

    expect(LanguageClient.created).toHaveLength(2);
    expect(state.warnings.length).toBe(before);
  });

  it('refuses the debugging commands on a document that is not a .fud', async () => {
    state.activeEditor = editorFor('typescript');
    await activate(context());

    await run('fudic.showRegistry');

    expect(state.warnings.some((message) => message.includes('active .fud'))).toBe(true);
  });
});

describe('createClient', () => {
  it('narrows the client to the four things this package does with it', async () => {
    // The port exists so the rest of the package cannot reach for the client's other four
    // hundred members. Which means the narrowing itself is the contract, and it gets driven
    // here rather than being the one wrapper nobody exercises.
    const launch: ClientLaunch = {
      serverPath: '/srv.js',
      documentSelector: [{ scheme: 'file', language: 'fudic' }],
      fileEvents: ['**/*.fud', '**/package.json'],
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

    // `dispose` is the fourth, and the reason it exists: the watchers are created here, and
    // the client only ever disposes the listeners it hangs on them.
    expect(state.watchers).toEqual(['**/*.fud', '**/package.json']);
    expect(state.disposed).toBe(0);
    port.dispose();
    expect(state.disposed).toBe(2);
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
