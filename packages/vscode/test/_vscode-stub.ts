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
}

export const state: StubState = {
  settings: {},
  folders: undefined,
  appRoot: '/vscode',
  warnings: [],
  output: [],
  watchers: [],
  disposed: 0,
};

export const reset = (): void => {
  state.settings = {};
  state.folders = undefined;
  state.appRoot = '/vscode';
  state.warnings = [];
  state.output = [];
  state.watchers = [];
  state.disposed = 0;
};

export const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: (line: string) => state.output.push(line),
    dispose: () => {
      state.disposed += 1;
    },
  }),
  showWarningMessage: (message: string) => {
    state.warnings.push(message);
    return Promise.resolve(undefined);
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
