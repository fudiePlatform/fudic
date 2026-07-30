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
}

export interface EditorStub {
  readonly document: { readonly languageId: string };
}

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
};

export const reset = (): void => {
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
};

/** Fires `onDidChangeActiveTextEditor`, as focusing another tab would. */
export const focusEditor = (editor: EditorStub | undefined): void => {
  state.activeEditor = editor;
  for (const listener of state.editorListeners) listener(editor);
};

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;

export const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: (line: string) => state.output.push(line),
    show: () => {
      state.outputShown += 1;
    },
    dispose: () => {
      state.disposed += 1;
    },
  }),
  createStatusBarItem: (_alignment: number, _priority: number) => ({
    get text() {
      return state.bar.text;
    },
    set text(value: string) {
      state.bar.text = value;
    },
    get tooltip() {
      return state.bar.tooltip;
    },
    set tooltip(value: string) {
      state.bar.tooltip = value;
    },
    get command() {
      return state.bar.command;
    },
    set command(value: string) {
      state.bar.command = value;
    },
    show: () => {
      state.bar.visible = true;
    },
    hide: () => {
      state.bar.visible = false;
    },
    dispose: () => {
      state.disposed += 1;
    },
  }),
  onDidChangeActiveTextEditor: (listener: (editor: EditorStub | undefined) => void) => {
    state.editorListeners.push(listener);
    return { dispose: () => undefined };
  },
  get activeTextEditor() {
    return state.activeEditor;
  },
  showWarningMessage: (message: string) => {
    state.warnings.push(message);
    return Promise.resolve(undefined);
  },
};

export const commands = {
  registerCommand: (id: string, handler: () => unknown) => {
    state.commandHandlers.set(id, handler);
    return { dispose: () => undefined };
  },
};

export const workspace = {
  getConfiguration: () => ({ get: (id: string) => state.settings[id] }),
  get workspaceFolders() {
    return state.folders;
  },
  createFileSystemWatcher: (glob: string) => {
    state.watchers.push(glob);
    return { dispose: () => undefined };
  },
};

export const env = {
  get appRoot() {
    return state.appRoot;
  },
};
