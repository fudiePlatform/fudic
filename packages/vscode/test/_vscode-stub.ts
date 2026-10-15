/**
 * The double for the `vscode` module.
 *
 * `vscode` is injected by the extension host at runtime and has no npm package behind it,
 * so under Node it simply cannot be resolved. `vitest.config.ts` aliases it here, which is
 * what lets `src/extension.ts` — the one file that imports it — load in a test and count
 * towards coverage.
 *
 * It stays small because it can: everything else in `src/` receives the host API through a
 * port, so this only has to cover what the adapter itself touches. Types still come from
 * `@types/vscode` — the alias is a runtime substitution, so the adapter is still typechecked
 * against the real API.
 */

import { URI } from 'vscode-uri';

export interface StubState {
  /** Backing store for `workspace.getConfiguration().get(id)`. */
  settings: Record<string, unknown>;
  folders: readonly { readonly uri: { readonly fsPath: string } }[] | undefined;
  appRoot: string;
  /** Everything `showWarningMessage` was called with. */
  warnings: string[];
  /** Everything written to the output channel. */
  output: string[];
  /** Globs handed to `createFileSystemWatcher`. */
  watchers: string[];
  disposed: number;
  /** Everything the status bar item was set to, in order. */
  bar: { text: string; tooltip: string; visible: boolean; command: string };
  /** Ids passed to `commands.registerCommand`, with their handlers. */
  commandHandlers: Map<string, () => unknown>;
  /** Handlers registered for `onDidChangeActiveTextEditor`. */
  editorListeners: ((editor: EditorStub | undefined) => void)[];
  activeEditor: EditorStub | undefined;
  outputShown: number;
  /** Content providers registered by scheme. */
  contentProviders: Map<string, { provideTextDocumentContent(uri: URI): string }>;
  /** Documents opened read-only, in order, with the URI as the object the editor holds. */
  openedDocuments: [URI, string][];
  /** Commands run through `executeCommand`. */
  executed: string[];
  /** The arguments each of those was run with, in the same order. */
  executedArgs: unknown[][];
  /** Handlers registered for `onDidChangeTextDocument`. */
  changeListeners: ((event: ChangeEventStub) => void)[];
  /** Handlers registered for `onDidChangeTextEditorSelection`. */
  selectionListeners: ((event: SelectionEventStub) => void)[];
  /** Every snippet inserted, as `[text, offset]`. */
  snippets: [string, number][];
  /** Every replacement applied through `editor.edit`, as `[range, text]`. */
  edits: [RangeStub, string][];
  /** Every webview panel created, in order (SDD-32). */
  panels: PanelStub[];
  /** Every URI handed to `env.openExternal`, as text. */
  external: string[];
  /** The workbench's own status bar item: the one created at priority 99 (BUG-48). */
  benchBar: { text: string; tooltip: string; visible: boolean; command: string };
  /** Every decoration type created, with its options and whether it was disposed. */
  decorationTypes: { readonly options: unknown; disposed: boolean }[];
  /** The editors in view: what the margin is painted on. */
  visibleEditors: VisibleEditorStub[];
  /** Handlers registered for `onDidChangeVisibleTextEditors`. */
  visibleListeners: (() => void)[];
  /** `activeColorTheme.kind`. */
  themeKind: number;
  /** Handlers registered for `onDidChangeActiveColorTheme`. */
  themeListeners: ((theme: { kind: number }) => void)[];
  /** Each diagnostic collection by name: what it holds by file path, and whether it was disposed. */
  problems: Map<string, { readonly byPath: Map<string, DiagnosticStub[]>; disposed: boolean }>;
  /** CodeLens providers registered, with their selector. */
  codeLensProviders: { readonly selector: unknown; readonly provider: CodeLensProviderStub }[];
  /** Every document `showTextDocument` was asked to show, with its options. */
  shownDocuments: [unknown, unknown][];
  /** Every `withProgress` shown, in order: its options, and whether its task has ended. */
  progress: { readonly options: { readonly location: number; readonly title: string }; ended: boolean }[];
}

/** A CodeLens provider, as the adapter registers it. */
export interface CodeLensProviderStub {
  readonly onDidChangeCodeLenses?: (listener: () => void) => unknown;
  provideCodeLenses(document: unknown): CodeLensStub[];
}

/** An editor in view: its file and the decorations painted on it, by decoration type. */
export interface VisibleEditorStub {
  readonly document: { readonly uri: { readonly fsPath: string } };
  readonly painted: Map<unknown, Range[]>;
  setDecorations(type: unknown, ranges: Range[]): void;
}

/** Builds an editor in view over a file. */
export const visibleEditor = (fsPath: string): VisibleEditorStub => {
  const painted = new Map<unknown, Range[]>();
  return { document: { uri: { fsPath } }, painted, setDecorations: (type, ranges) => void painted.set(type, ranges) };
};

/** A `vscode.WebviewPanel`, as the workbench tab uses it. */
export interface PanelStub {
  readonly viewType: string;
  title: string;
  readonly column: number;
  readonly options: unknown;
  readonly webview: { html: string; readonly posted: unknown[] };
  revealed: number;
  /** Posts a message from the page, as its button would. */
  receive(message: unknown): void;
  /** Closes the tab, as the user would. */
  dispose(): void;
}

export interface EditorStub {
  readonly document: {
    readonly languageId: string;
    readonly version: number;
    readonly eol: number;
    readonly uri: { readonly fsPath: string; toString(): string };
    positionAt(offset: number): number;
    getText(): string;
    offsetAt(position: { line: number; character: number }): number;
  };
  readonly selection: { readonly start: { line: number }; readonly end: { line: number } };
  insertSnippet(
    snippet: { value: string },
    location: unknown,
    options: unknown,
  ): Thenable<boolean>;
  edit(build: (builder: { replace(range: unknown, text: string): void }) => void): Thenable<boolean>;
}

/** Builds an editor stub the way `fudUriOf` expects to find one. */
export const editorFor = (
  languageId: string,
  uri = 'file:///x.fud',
  version = 1,
  text = '',
  selection: { start: { line: number }; end: { line: number } } = {
    start: { line: 0 },
    end: { line: 0 },
  },
): EditorStub => ({
  document: {
    languageId,
    version,
    eol: 1,
    uri: { fsPath: URI.parse(uri).fsPath, toString: () => uri },
    positionAt: (offset: number) => offset,
    getText: () => text,
    // Line/character to offset over the same text, so an assertion about the offset is an
    // assertion about the document rather than about the double.
    offsetAt: ({ line, character }) =>
      text
        .split('\n')
        .slice(0, line)
        .reduce((total, own) => total + own.length + 1, 0) + character,
  },
  selection,
  insertSnippet: (snippet, location) => {
    state.snippets.push([snippet.value, location as number]);
    return Promise.resolve(true);
  },
  edit: (build) => {
    build({
      replace: (range, replacement) => {
        state.edits.push([range as RangeStub, replacement]);
      },
    });
    return Promise.resolve(true);
  },
});

/** `vscode.Range`, reduced to the four numbers it is built from. */
export class Range {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {}
}

export type RangeStub = Range;

export const DiagnosticSeverity = { Error: 0, Warning: 1 } as const;

/** `vscode.Diagnostic`: a range, a message, a severity, and the source set afterwards. */
export class Diagnostic {
  source: string | undefined;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: number,
  ) {}
}

export type DiagnosticStub = Diagnostic;

/** `vscode.CodeLens`: where, and the command it runs. */
export class CodeLens {
  constructor(
    readonly range: Range,
    readonly command: { title: string; command: string; arguments: unknown[] },
  ) {}
}

export type CodeLensStub = CodeLens;

/** A `vscode.TextDocumentChangeEvent`, as the tag closer reads it. */
export interface ChangeEventStub {
  readonly document: {
    readonly languageId: string;
    readonly version: number;
    readonly uri: { toString(): string };
  };
  readonly contentChanges: readonly { readonly rangeOffset: number; readonly text: string }[];
}

/** A `vscode.TextEditorSelectionChangeEvent`, as the caret watcher reads it. */
export interface SelectionEventStub {
  readonly textEditor: {
    readonly document: {
      readonly languageId: string;
      readonly version: number;
      getText(): string;
      offsetAt(position: unknown): number;
    };
  };
  readonly selections: readonly { readonly isEmpty: boolean; readonly active: unknown }[];
}

/** Builds the event a caret at `offset` of `text` would fire. */
export const caretEvent = (
  languageId: string,
  text: string,
  offset: number,
  version = 1,
  isEmpty = true,
  count = 1,
): SelectionEventStub => ({
  textEditor: {
    document: {
      languageId,
      version,
      getText: () => text,
      offsetAt: (position) => position as number,
    },
  },
  selections: Array.from({ length: count }, () => ({ isEmpty, active: offset })),
});

const emptyBar = () => ({ text: '', tooltip: '', visible: false, command: '' });

export const state: StubState = {
  settings: {},
  folders: undefined,
  appRoot: '/vscode',
  warnings: [],
  output: [],
  watchers: [],
  disposed: 0,
  bar: emptyBar(),
  commandHandlers: new Map(),
  editorListeners: [],
  activeEditor: undefined,
  outputShown: 0,
  contentProviders: new Map(),
  openedDocuments: [],
  executed: [],
  executedArgs: [],
  changeListeners: [],
  selectionListeners: [],
  snippets: [],
  edits: [],
  panels: [],
  external: [],
  benchBar: emptyBar(),
  decorationTypes: [],
  visibleEditors: [],
  visibleListeners: [],
  themeKind: 1,
  themeListeners: [],
  problems: new Map(),
  codeLensProviders: [],
  shownDocuments: [],
  progress: [],
};

export const reset = (): void => {
  state.progress = [];
  state.benchBar = emptyBar();
  state.decorationTypes = [];
  state.visibleEditors = [];
  state.visibleListeners = [];
  state.themeKind = 1;
  state.themeListeners = [];
  state.problems = new Map();
  state.codeLensProviders = [];
  state.shownDocuments = [];
  state.settings = {};
  state.folders = undefined;
  state.appRoot = '/vscode';
  state.warnings = [];
  state.output = [];
  state.watchers = [];
  state.disposed = 0;
  state.bar = emptyBar();
  state.commandHandlers = new Map();
  state.editorListeners = [];
  state.activeEditor = undefined;
  state.outputShown = 0;
  state.contentProviders = new Map();
  state.openedDocuments = [];
  state.executed = [];
  state.executedArgs = [];
  state.changeListeners = [];
  state.selectionListeners = [];
  state.snippets = [];
  state.edits = [];
  state.panels = [];
  state.external = [];
};

/** Fires `onDidChangeTextEditorSelection`, as moving the caret would. */
export const moveCaret = (event: SelectionEventStub): void => {
  for (const listener of state.selectionListeners) listener(event);
};

/** Fires `onDidChangeTextDocument`, as typing would. */
export const typeInto = (event: ChangeEventStub): void => {
  for (const listener of state.changeListeners) listener(event);
};

/** Fires `onDidChangeActiveTextEditor`, as focusing another tab would. */
export const focusEditor = (editor: EditorStub | undefined): void => {
  state.activeEditor = editor;
  for (const listener of state.editorListeners) listener(editor);
};

/** Fires `onDidChangeVisibleTextEditors`, as opening or closing an editor would. */
export const showEditors = (editors: VisibleEditorStub[]): void => {
  state.visibleEditors = editors;
  for (const listener of state.visibleListeners) listener();
};

/** Fires `onDidChangeActiveColorTheme`, as switching the theme would. */
export const changeTheme = (kind: number): void => {
  state.themeKind = kind;
  for (const listener of state.themeListeners) listener({ kind });
};

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;

export const ViewColumn = { One: 1, Beside: -2 } as const;

/** `vscode.ThemeColor`: the id of a color of the theme. */
export class ThemeColor {
  constructor(readonly id: string) {}
}

export const ProgressLocation ={ SourceControl: 1, Window: 10, Notification: 15 } as const;

/** `vscode.EventEmitter`: listeners on `event`, called by `fire`, dropped by `dispose`. */
export class EventEmitter<T> {
  private listeners: ((value: T) => void)[] = [];
  readonly event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => undefined };
  };
  fire(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
  dispose(): void {
    this.listeners = [];
  }
}

/** A status bar item over one of the recorded bars. */
const barItem = (bar: () => StubState['bar']) => ({
  get text() {
    return bar().text;
  },
  set text(value: string) {
    bar().text = value;
  },
  get tooltip() {
    return bar().tooltip;
  },
  set tooltip(value: string) {
    bar().tooltip = value;
  },
  get command() {
    return bar().command;
  },
  set command(value: string) {
    bar().command = value;
  },
  show: () => {
    bar().visible = true;
  },
  hide: () => {
    bar().visible = false;
  },
  dispose: () => {
    state.disposed += 1;
  },
});

export const window = {
  createTextEditorDecorationType: (options: unknown) => {
    const type = { options, disposed: false };
    state.decorationTypes.push(type);
    return {
      type,
      dispose: () => {
        type.disposed = true;
      },
    };
  },
  get visibleTextEditors() {
    return state.visibleEditors;
  },
  onDidChangeVisibleTextEditors: (listener: () => void) => {
    state.visibleListeners.push(listener);
    return { dispose: () => undefined };
  },
  get activeColorTheme() {
    return { kind: state.themeKind };
  },
  onDidChangeActiveColorTheme: (listener: (theme: { kind: number }) => void) => {
    state.themeListeners.push(listener);
    return {
      dispose: () => {
        state.themeListeners = state.themeListeners.filter((l) => l !== listener);
      },
    };
  },
  createOutputChannel: (_name: string) => ({
    appendLine: (line: string) => state.output.push(line),
    show: () => {
      state.outputShown += 1;
    },
    dispose: () => {
      state.disposed += 1;
    },
  }),
  createStatusBarItem: (_alignment: number, priority: number) =>
    barItem(priority === 99 ? () => state.benchBar : () => state.bar),
  onDidChangeActiveTextEditor: (listener: (editor: EditorStub | undefined) => void) => {
    state.editorListeners.push(listener);
    return { dispose: () => undefined };
  },
  onDidChangeTextEditorSelection: (listener: (event: SelectionEventStub) => void) => {
    state.selectionListeners.push(listener);
    return { dispose: () => undefined };
  },
  get activeTextEditor() {
    return state.activeEditor;
  },
  showTextDocument: (document: unknown, options: unknown) => {
    state.shownDocuments.push([document, options]);
    return Promise.resolve(undefined);
  },
  withProgress: (options: { location: number; title: string }, task: () => Promise<void>) => {
    const shown = { options, ended: false };
    state.progress.push(shown);
    return task().then(() => {
      shown.ended = true;
    });
  },
  showWarningMessage: (message: string) => {
    state.warnings.push(message);
    return Promise.resolve(undefined);
  },
  createWebviewPanel: (viewType: string, title: string, column: number, options: unknown) => {
    const received: ((message: unknown) => void)[] = [];
    const disposed: (() => void)[] = [];
    const posted: unknown[] = [];
    const panel: PanelStub = {
      viewType,
      title,
      column,
      options,
      webview: { html: '', posted },
      revealed: 0,
      receive: (message) => {
        for (const listener of received) listener(message);
      },
      dispose: () => {
        for (const listener of disposed) listener();
      },
    };
    state.panels.push(panel);
    return {
      get title() {
        return panel.title;
      },
      set title(value: string) {
        panel.title = value;
      },
      webview: {
        set html(value: string) {
          panel.webview.html = value;
        },
        onDidReceiveMessage: (listener: (message: unknown) => void) => {
          received.push(listener);
          return { dispose: () => undefined };
        },
        postMessage: (message: unknown) => {
          posted.push(message);
          return Promise.resolve(true);
        },
      },
      reveal: () => {
        panel.revealed += 1;
      },
      onDidDispose: (listener: () => void) => {
        disposed.push(listener);
        return { dispose: () => undefined };
      },
    };
  },
};

export const commands = {
  registerCommand: (id: string, handler: (...args: never[]) => unknown) => {
    state.commandHandlers.set(id, handler as () => unknown);
    return { dispose: () => undefined };
  },
  executeCommand: (id: string, ...args: unknown[]) => {
    state.executed.push(id);
    state.executedArgs.push(args);
    return Promise.resolve(undefined);
  },
};

export const languages = {
  setTextDocumentLanguage: (document: { uri: URI }, languageId: string) => {
    state.openedDocuments.push([document.uri, languageId]);
    return Promise.resolve(document);
  },
  createDiagnosticCollection: (name: string) => {
    const collection = { byPath: new Map<string, Diagnostic[]>(), disposed: false };
    state.problems.set(name, collection);
    // Keyed as a path is written: forward slashes, and the drive letter `fsPath` lowercases, upper.
    const key = (uri: URI) => uri.fsPath.replaceAll('\\', '/').replace(/^[a-z]:/u, (drive) => drive.toUpperCase());
    return {
      set: (uri: URI, diagnostics: Diagnostic[]) => void collection.byPath.set(key(uri), diagnostics),
      delete: (uri: URI) => void collection.byPath.delete(key(uri)),
      dispose: () => {
        collection.disposed = true;
      },
    };
  },
  registerCodeLensProvider: (selector: unknown, provider: CodeLensProviderStub) => {
    state.codeLensProviders.push({ selector, provider });
    return { dispose: () => undefined };
  },
};

/**
 * The REAL `Uri`, not an identity over the string.
 *
 * `vscode-uri` is the same implementation VS Code ships, and using it here is not
 * over-engineering the double: the previous stub returned `{ toString: () => value }`, so every
 * test round-tripped its own string and none of them could see that a URI does not come back
 * out as the text it went in as. That is exactly how `fudic.showVirtualFiles` shipped opening
 * blank editors with a suite at 100%.
 */
export const Uri = {
  parse: (value: string) => URI.parse(value),
  file: (path: string) => URI.file(path),
};

export const workspace = {
  getConfiguration: () => ({ get: (id: string) => state.settings[id] }),
  get workspaceFolders() {
    return state.folders;
  },
  createFileSystemWatcher: (glob: string) => {
    state.watchers.push(glob);
    // Counted, because a watcher that is never disposed is the defect: the client releases
    // the listeners it hangs on one, never the watcher itself.
    return {
      dispose: () => {
        state.disposed += 1;
      },
    };
  },
  registerTextDocumentContentProvider: (
    scheme: string,
    provider: { provideTextDocumentContent(uri: URI): string },
  ) => {
    state.contentProviders.set(scheme, provider);
    return { dispose: () => undefined };
  },
  // The document keeps the `Uri`, not its text: the adapter opens by `Uri` and the provider
  // is later asked with the same object, which is how the editor behaves.
  openTextDocument: (uri: URI) => Promise.resolve({ uri }),
  onDidChangeTextDocument: (listener: (event: ChangeEventStub) => void) => {
    state.changeListeners.push(listener);
    return { dispose: () => undefined };
  },
};

/** `vscode.SnippetString`, which is a wrapper over its text and nothing more. */
export class SnippetString {
  constructor(public readonly value: string) {}
}

export const env = {
  get appRoot() {
    return state.appRoot;
  },
  openExternal: (uri: { toString(): string }) => {
    state.external.push(uri.toString());
    return Promise.resolve(true);
  },
};
