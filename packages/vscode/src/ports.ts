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

/** The status bar item of §4.4, reduced to the four things done to it. */
export interface StatusBarPort {
  setText(text: string): void;
  setTooltip(text: string): void;
  show(): void;
  hide(): void;
}

/** The injected clock. Nothing in this package sleeps against the real one in a test. */
export type DelayPort = (ms: number) => Promise<void>;

/** What the commands need to know about the active editor. */
export interface EditorPort {
  /** The URI of the active `.fud`, or `undefined` when the active document is not one. */
  activeFudUri(): string | undefined;
}

/** Opening the read-only views the debugging commands produce (§4.3). */
export interface DocumentsPort {
  openReadOnly(name: string, languageId: string, text: string): Promise<void>;
}

/** Formatting, which is delegated all the way to SDD-26 through the server. */
export interface FormatterPort {
  formatActiveDocument(): Promise<void>;
}

/** Command registration. The adapter binds it to `vscode.commands`. */
export interface CommandsPort {
  register(id: string, handler: () => Promise<void>): void;
}

/**
 * How a comment is written in one region, as the server answers it (BUG-22 §5).
 *
 * Spelled here rather than imported, like the request names: the shape on the wire is the
 * contract, and a client that reads it does not need the compiler's types to do so.
 */
export interface CommentSyntax {
  /** The line comment, for the regions that have one. Absent where none exists. */
  readonly line?: string;
  /** What a new block comment is written with. */
  readonly block: readonly [string, string];
  /** Every pair that counts as a comment when one is being removed. */
  readonly removes: readonly (readonly [string, string])[];
}

/** The lines a toggle would act on, in the active `.fud`. */
export interface CommentSelection {
  readonly uri: string;
  /** The whole document, split. The toggle needs the lines around the selection too. */
  readonly lines: readonly string[];
  /** Both ends included. An empty selection is the line the caret is on. */
  readonly firstLine: number;
  readonly lastLine: number;
  /** Where the region is asked about: the first thing written on the first selected line. */
  readonly offset: number;
}

/** The lines a toggle replaces, and what with. */
export interface LineReplacement {
  readonly firstLine: number;
  readonly lastLine: number;
  readonly newLines: readonly string[];
}

/** What commenting needs from the editor: the selection, and a way to replace whole lines. */
export interface SelectionPort {
  /** The selection in the active `.fud`, or nothing when the focus is elsewhere. */
  current(): CommentSelection | undefined;
  replaceLines(replacement: LineReplacement): Promise<void>;
}

/** One edit the user just made to a `.fud`. */
export interface TypedText {
  readonly uri: string;
  /** Offset just PAST what was typed: where the caret is now. */
  readonly offset: number;
  /** What was inserted. A single `>` is the only thing the tag closer reacts to. */
  readonly text: string;
  /** The document version after the edit, so a stale answer can be dropped. */
  readonly version: number;
}

/** Where a snippet goes, and which document it was computed for. */
export interface SnippetTarget extends TypedText {}

/**
 * Typing, which is the one thing the client watches instead of being asked about (BUG-22).
 *
 * Closing a tag cannot be a language feature: nothing was requested, and the caret has to end
 * up BETWEEN the two tags, which a `TextEdit` has no way of saying. So the client notices the
 * keystroke, asks the server what belongs there, and inserts it as a snippet — the same shape
 * every editor uses for HTML.
 */
export interface TypingPort {
  /** Every change to an open document. `undefined` for the ones that are not a `.fud` edit. */
  onTyped(listener: (typed: TypedText | undefined) => void): void;
  /** Insert `text` at the target, leaving the caret in front of it. */
  insert(target: SnippetTarget): Promise<void>;
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
  /**
   * Release what this client owns besides its process: its file watchers.
   *
   * `stop()` is not enough. `vscode-languageclient` disposes the LISTENERS it attaches to a
   * watcher, never the watcher itself — those belong to whoever created them — so a restart
   * that only stops the client leaves the old ones registered with the editor, and every
   * restart adds another set.
   */
  dispose(): void;
}

/** Builds a client for a launch. The adapter binds this to `vscode-languageclient`. */
export type ClientFactory = (launch: ClientLaunch) => LanguageClientPort;
