/**
 * The host API, as narrow interfaces (SDD-25 §5).
 *
 * This file is the boundary that makes the invariant enforceable rather than aspirational:
 * nothing under `src/` imports `vscode` except the adapter, because nothing under `src/`
 * can — it only ever sees these. Each port lists the methods that are actually used, so a
 * test double is three lines rather than a mock of the editor.
 */

/** The trace levels `fudic.trace.server` accepts. */
export type TraceLevel = 'off' | 'messages' | 'verbose';

/** Reads settings by their full id. Anything unset comes back as `undefined`. */
export interface ConfigurationPort {
  get(id: string): unknown;
}

/** The one filesystem question the client asks: is this thing there? */
export interface FileSystemPort {
  exists(path: string): boolean;
}

/** What the client needs to know about the open workspace. */
export interface WorkspacePort {
  /** Absolute path of each open folder. Empty when the editor has no folder open. */
  readonly folders: readonly string[];
}

/** User-facing messages. Deliberately not a general `window` — the client shows warnings. */
export interface NotificationPort {
  warn(message: string): void;
}

/** The output channel, which is also where §4.4 sends the user when the status bar is clicked. */
export interface LoggerPort {
  info(message: string): void;
}

/** What the client is asked to launch. Everything here is already resolved. */
export interface ClientLaunch {
  readonly serverPath: string;
  readonly documentSelector: readonly { readonly scheme: string; readonly language: string }[];
  /** Glob patterns the server wants file events for. */
  readonly fileEvents: readonly string[];
  readonly initializationOptions: {
    readonly typescript: { readonly tsdk: string };
    readonly fudic: {
      readonly templateDiagnostics: boolean;
      readonly exposeVirtualFiles: boolean;
    };
  };
}

/** The language client, reduced to what this package does with it. */
export interface LanguageClientPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendRequest<T>(method: string, params: unknown): Promise<T>;
}

/** Builds a client for a launch. The adapter binds this to `vscode-languageclient`. */
export type ClientFactory = (launch: ClientLaunch) => LanguageClientPort;
