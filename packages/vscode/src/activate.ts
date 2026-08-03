/**
 * Activation, as plain code (SDD-25 §4.1, §4.6, §5).
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
import { createStatus, type Status } from './status.js';
import { readSettings, type FudicSettings } from './settings.js';
import { resolveServerPath, type ResolvedServer } from './server-path.js';
import { RESTART_HINT, superviseStart } from './supervisor.js';
import { degradedMessage, resolveTsdk, type ResolvedTsdk } from './tsdk.js';
import type {
  ClientFactory,
  ClientLaunch,
  ConfigurationPort,
  DelayPort,
  FileSystemPort,
  LanguageClientPort,
  LoggerPort,
  NotificationPort,
  StatusBarPort,
  WorkspacePort,
} from './ports.js';

export interface FudicHost {
  readonly config: ConfigurationPort;
  readonly fs: FileSystemPort;
  readonly workspace: WorkspacePort;
  readonly notifications: NotificationPort;
  readonly logger: LoggerPort;
  readonly createClient: ClientFactory;
  readonly statusBar: StatusBarPort;
  readonly delay: DelayPort;
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
  /** Whether the client is currently up. False after three failed attempts. */
  readonly running: boolean;
  readonly status: Status;
  /** Shared with the supervisor so a crash loop cannot repeat the degraded warning. */
  readonly warnOnce: Once;
  /** Stops the old server and resolves everything again. Resolves to whether it came up. */
  restart(): Promise<boolean>;
  stop(): Promise<void>;
}

interface Boot {
  readonly settings: FudicSettings;
  readonly server: ResolvedServer;
  readonly tsdk: ResolvedTsdk;
  readonly launch: ClientLaunch;
  readonly client: LanguageClientPort;
  readonly running: boolean;
}

/**
 * One full resolution: settings, server, tsdk, client, start.
 *
 * A restart re-runs *this*, not just `client.start()`. That is the whole point of §4.3: the
 * causes are a dependency that was just installed, a branch that was just changed, a `tsdk`
 * that moved — all of them things that change what the answers are, not just whether the
 * process is alive. Restarting without re-resolving would relaunch the stale state.
 */
const boot = async (host: FudicHost, status: Status, warnOnce: Once): Promise<Boot> => {
  const settings = readSettings(host.config);
  const server = resolveServerPath(settings.serverPath, host.bundledServerPath, host.fs);
  const tsdk = resolveTsdk({
    configured: host.config.get('typescript.tsdk'),
    folders: host.workspace.folders,
    vscodeTsdk: host.vscodeTsdk,
    fs: host.fs,
  });

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
  const running = await superviseStart({
    start: () => client.start(),
    onState: (state) => status.setState(state),
    delay: host.delay,
    log: (message) => host.logger.info(message),
    offerRestart: () => host.notifications.warn(RESTART_HINT),
  });

  if (running) status.setState(tsdk.degraded ? 'degraded' : 'ready');

  return { settings, server, tsdk, launch, client, running };
};

/**
 * Stopping a server that may already be gone, and releasing what it held.
 *
 * `stop()` on a client whose process died rejects, and a restart that fails because the
 * previous server was *already* dead is the exact case the restart command exists for.
 *
 * `dispose()` therefore runs in a `finally`, not after the `await`: the client that could not
 * be stopped is exactly the one whose watchers nobody else is going to release, and skipping it
 * there is how a crash loop ends up holding a set of watchers per attempt.
 */
const stopQuietly = async (client: LanguageClientPort, host: FudicHost): Promise<void> => {
  try {
    await client.stop();
  } catch (error) {
    host.logger.info(`stopping the previous server failed, continuing: ${String(error)}`);
  } finally {
    client.dispose();
  }
};

export const activateFudic = async (host: FudicHost): Promise<FudicSession> => {
  const status = createStatus(host.statusBar);
  const warnOnce = createOnce();
  let current = await boot(host, status, warnOnce);

  return {
    get client() {
      return current.client;
    },
    get settings() {
      return current.settings;
    },
    get server() {
      return current.server;
    },
    get tsdk() {
      return current.tsdk;
    },
    get launch() {
      return current.launch;
    },
    get running() {
      return current.running;
    },
    status,
    warnOnce,
    restart: async () => {
      await stopQuietly(current.client, host);
      current = await boot(host, status, warnOnce);
      return current.running;
    },
    stop: async () => {
      await stopQuietly(current.client, host);
      status.setState('stopped');
    },
  };
};
