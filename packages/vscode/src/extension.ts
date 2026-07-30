/**
 * The extension entry point (SDD-25 §4.1, §5).
 *
 * The only file in the package that imports `vscode`, and an adapter with no branches: it
 * builds the ports and hands them to `activateFudic`, which is where every decision is
 * made. Anything that would need a `?? []` or a path join lives in `vscode-shape.ts`, so
 * nothing conditional hides behind the one module a test can reach only through a double.
 *
 * Activation stays cheap: an output channel, a few strings, and a client that starts a
 * process. Nothing here parses a `.fud`.
 */

import { existsSync } from 'node:fs';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { activateFudic, type FudicSession } from './activate.js';
import { bundledServerPath, folderPaths, vscodeTsdkPath } from './vscode-shape.js';
import type { ClientLaunch, LanguageClientPort } from './ports.js';

let session: FudicSession | undefined;

/**
 * Exported so the narrowing below is reachable from a test.
 *
 * It is the whole of what this package does with `vscode-languageclient`, and leaving it
 * inside `activate` would mean the only way to exercise it is an extension host — which is
 * how a three-line wrapper ends up being the part nobody ever checks.
 */
export const createClient = (
  launch: ClientLaunch,
  output: vscode.OutputChannel,
): LanguageClientPort => {
  const client = new LanguageClient(
    // The id is `fudic` because `vscode-languageclient` derives the trace setting from it:
    // registering under this name is what makes `fudic.trace.server` work.
    'fudic',
    'Fudic',
    {
      run: { module: launch.serverPath, transport: TransportKind.ipc },
      debug: {
        module: launch.serverPath,
        transport: TransportKind.ipc,
        options: { execArgv: ['--nolazy', '--inspect=6009'] },
      },
    },
    {
      documentSelector: [...launch.documentSelector],
      initializationOptions: launch.initializationOptions,
      synchronize: {
        fileEvents: launch.fileEvents.map((glob) => vscode.workspace.createFileSystemWatcher(glob)),
      },
      outputChannel: output,
    },
  );

  // Narrowed to the port rather than passed through: the rest of the package should not be
  // able to reach for the client's other four hundred members.
  return {
    start: () => client.start(),
    stop: () => client.stop(),
    sendRequest: (method, params) => client.sendRequest(method, params),
  };
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Fudic');
  context.subscriptions.push(output);

  session = await activateFudic({
    config: { get: (id) => vscode.workspace.getConfiguration().get(id) },
    fs: { exists: existsSync },
    workspace: { folders: folderPaths(vscode.workspace.workspaceFolders) },
    notifications: { warn: (message) => void vscode.window.showWarningMessage(message) },
    logger: { info: (message) => output.appendLine(message) },
    createClient: (launch) => createClient(launch, output),
    bundledServerPath: bundledServerPath(context.extensionPath),
    vscodeTsdk: vscodeTsdkPath(vscode.env.appRoot),
  });
}

export async function deactivate(): Promise<void> {
  const stopping = session?.client.stop();
  session = undefined;
  await stopping;
}
