/**
 * Activation, as plain code (SDD-25 §4.1, §5).
 *
 * Everything the extension decides at startup happens here, over the ports: which server,
 * which TypeScript, what the client is launched with, and what the user is told when the
 * answer is not the good one. The `vscode` module never appears, so all of it runs in a
 * test without an extension host.
 *
 * Activation stays cheap by contract: nothing here parses, indexes or reads a `.fud`. The
 * one expensive thing in the system is the server, and it runs in its own process.
 */

import { buildClientLaunch } from './client-options.js';
import { createOnce, type Once } from './once.js';
import { readSettings, type FudicSettings } from './settings.js';
import { resolveServerPath, type ResolvedServer } from './server-path.js';
import { degradedMessage, resolveTsdk, type ResolvedTsdk } from './tsdk.js';
import type {
  ClientFactory,
  ClientLaunch,
  ConfigurationPort,
  FileSystemPort,
  LanguageClientPort,
  LoggerPort,
  NotificationPort,
  WorkspacePort,
} from './ports.js';

export interface FudicHost {
  readonly config: ConfigurationPort;
  readonly fs: FileSystemPort;
  readonly workspace: WorkspacePort;
  readonly notifications: NotificationPort;
  readonly logger: LoggerPort;
  readonly createClient: ClientFactory;
  /** The server shipped inside the `.vsix` (§4.5). */
  readonly bundledServerPath: string;
  /** The lib directory inside VS Code itself, when the adapter can locate it. */
  readonly vscodeTsdk: string | null;
}

export interface FudicSession {
  readonly client: LanguageClientPort;
  readonly settings: FudicSettings;
  readonly server: ResolvedServer;
  readonly tsdk: ResolvedTsdk;
  readonly launch: ClientLaunch;
  /** Whether the client is currently up. False after a failed start. */
  readonly running: boolean;
  /** Shared with the supervisor so a crash loop cannot repeat the degraded warning. */
  readonly warnOnce: Once;
}

export const activateFudic = async (host: FudicHost): Promise<FudicSession> => {
  const settings = readSettings(host.config);
  const server = resolveServerPath(settings.serverPath, host.bundledServerPath, host.fs);
  const tsdk = resolveTsdk({
    configured: host.config.get('typescript.tsdk'),
    folders: host.workspace.folders,
    vscodeTsdk: host.vscodeTsdk,
    fs: host.fs,
  });

  const warnOnce = createOnce();
  if (server.warning !== undefined) host.notifications.warn(server.warning);
  if (tsdk.degraded) warnOnce(() => host.notifications.warn(degradedMessage(tsdk.source)));

  host.logger.info(`server: ${server.path} (${server.source})`);
  host.logger.info(`tsdk: ${tsdk.path} (${tsdk.source})`);
  host.logger.info(`trace: ${settings.trace}, format: ${String(settings.formatEnable)}`);

  const launch = buildClientLaunch(settings, server.path, tsdk.path);
  const client = host.createClient(launch);

  // A server that will not start must not take the editor with it: TextMate colour and the
  // language configuration still work, the file is still editable, and the restart command
  // is still there. Reporting it and carrying on is the behaviour §5 asks for.
  let running = true;
  try {
    await client.start();
  } catch (error) {
    running = false;
    host.logger.info(`the language server failed to start: ${String(error)}`);
  }

  return { client, settings, server, tsdk, launch, running, warnOnce };
};
