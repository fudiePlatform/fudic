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
import { watchTypedTags } from './auto-close.js';
import { registerCommands } from './commands/index.js';
import { watchEmptyValues } from './empty-value.js';
import { nodeProcesses } from './spawn.js';
import { createVirtualDocStore, VIRTUAL_SCHEME } from './virtual-doc-provider.js';
import { createWorkbenches, samePath, specLenses, type LensAction, type Workbenches } from './workbench.js';
import { handlePanelRequest, panelHtml, startingHtml, themeOf } from './workbench-panel.js';
import {
  bundledServerPath,
  caretAtOf,
  commentSelectionOf,
  folderPaths,
  fudUriOf,
  insertClosingTag,
  languageOf,
  MARGIN_COLORS,
  marginIcon,
  marginLines,
  problemLines,
  replaceLines,
  typedTextOf,
  viewsOf,
  vscodeTsdkPath,
  workbenchFileOf,
  type MarginKind,
} from './vscode-shape.js';
import type { ClientLaunch, CriterionView, LanguageClientPort, WorkbenchPanel, WorkbenchResultsPort } from './ports.js';

let session: FudicSession | undefined;
let workbenches: Workbenches | undefined;

/**
 * The workbench tab (SDD-32 §4.10): the shell framed beside the editor. Exported, like
 * `createClient`, so its wiring is assertable through the double.
 */
export const openWorkbenchPanel = (view: { readonly title: string }): WorkbenchPanel => {
  const panel = vscode.window.createWebviewPanel('fudic.workbench', view.title, vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.webview.html = startingHtml();
  /** The shell's URL once loaded: what «Open in browser» opens. */
  let url: string | undefined;
  let disposed = false;
  // «Open in browser», and the shell's «open this file at this line».
  panel.webview.onDidReceiveMessage((message: unknown) =>
    handlePanelRequest(message, {
      openExternal: () => {
        if (url !== undefined) void vscode.env.openExternal(vscode.Uri.parse(url));
      },
      openFile: (file, line) =>
        void vscode.window.showTextDocument(vscode.Uri.file(file), {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(line - 1, 0, line - 1, 0),
        }),
    }),
  );
  const themed = vscode.window.onDidChangeActiveColorTheme(
    (theme) => void panel.webview.postMessage({ type: 'theme', theme: themeOf(theme.kind) }),
  );
  panel.onDidDispose(() => {
    disposed = true;
    themed.dispose();
  });
  return {
    load: (shell, title) => {
      url = shell;
      panel.title = title;
      panel.webview.html = panelHtml(shell, themeOf(vscode.window.activeColorTheme.kind));
    },
    reveal: () => panel.reveal(),
    // A tab the user already closed has nobody to tell.
    showStopped: (message) => {
      if (!disposed) void panel.webview.postMessage({ type: 'stopped', message });
    },
    onClosed: (listener) => {
      panel.onDidDispose(listener);
    },
  };
};

const MARGIN_KINDS: readonly MarginKind[] = ['pass', 'fail', 'running'];

/**
 * The workbench's results in the `.fudspec` (BUG-48 §4.9): a mark in the margin of each
 * `criterion`, and the ones that did not pass in Problems. Kept by path, and painted again
 * whenever the visible editors change.
 */
export const createWorkbenchResults = (): WorkbenchResultsPort & vscode.Disposable & { repaint(): void } => {
  const decorations = new Map(
    MARGIN_KINDS.map((kind) => [
      kind,
      vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.parse(marginIcon(MARGIN_COLORS[kind])),
        gutterIconSize: 'contain',
      }),
    ]),
  );
  const problems = vscode.languages.createDiagnosticCollection('fudic-workbench');
  const kept = new Map<string, readonly CriterionView[]>();
  const repaint = (): void => {
    for (const editor of vscode.window.visibleTextEditors) {
      const lines = marginLines(viewsOf(kept, editor.document.uri.fsPath));
      for (const [kind, decoration] of decorations) {
        editor.setDecorations(decoration, lines[kind].map((line) => new vscode.Range(line, 0, line, 0)));
      }
    }
  };
  return {
    show(spec, views) {
      kept.set(samePath(spec), views);
      problems.set(
        vscode.Uri.file(spec),
        problemLines(views).map((problem) => {
          const range = new vscode.Range(problem.line, 0, problem.line, Number.MAX_SAFE_INTEGER);
          const diagnostic = new vscode.Diagnostic(range, problem.message, vscode.DiagnosticSeverity.Error);
          diagnostic.source = 'fudic workbench';
          return diagnostic;
        }),
      );
      repaint();
    },
    clear(spec) {
      kept.delete(samePath(spec));
      problems.delete(vscode.Uri.file(spec));
      repaint();
    },
    repaint,
    dispose() {
      problems.dispose();
      for (const decoration of decorations.values()) decoration.dispose();
    },
  };
};

/** The command behind the status bar item. Not contributed: it is not a user command. */
const SHOW_OUTPUT = 'fudic.showOutput';

/** The command behind every CodeLens of a `.fudspec`: `(file, action)`. */
const RUN_CRITERION = 'fudic.runCriterion';

/**
 * The command behind every "Explain FUDnnnn" bulb: the server sends the path of the code's
 * explanation and this opens it in the markdown preview. Not contributed either — it only makes
 * sense with a path, which only the server has. It exists because a command sent by the server
 * carries plain JSON, and the preview wants a `Uri`.
 */
const EXPLAIN = 'fudic.explain';

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
  // Held by name, because they have to be disposed by hand later: the client disposes the
  // listeners it attaches to a watcher, never the watcher, which belongs to whoever made it.
  // Left to the client, every restart registered three more with the editor.
  const watchers = launch.fileEvents.map((glob) => vscode.workspace.createFileSystemWatcher(glob));

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
      synchronize: { fileEvents: watchers },
      outputChannel: output,
    },
  );

  // Narrowed to the port rather than passed through: the rest of the package should not be
  // able to reach for the client's other four hundred members.
  return {
    start: () => client.start(),
    stop: () => client.stop(),
    sendRequest: (method, params) => client.sendRequest(method, params),
    dispose: () => {
      for (const watcher of watchers) watcher.dispose();
    },
  };
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Fudic');
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  bar.command = SHOW_OUTPUT;
  const virtuals = createVirtualDocStore();

  context.subscriptions.push(
    output,
    bar,
    vscode.commands.registerCommand(SHOW_OUTPUT, () => output.show()),
    vscode.commands.registerCommand(EXPLAIN, (path: string) =>
      vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path)),
    ),
    vscode.window.onDidChangeActiveTextEditor((editor) =>
      session?.status.setActiveLanguage(languageOf(editor)),
    ),
    vscode.workspace.registerTextDocumentContentProvider(VIRTUAL_SCHEME, {
      // `uri.path`, not `uri.toString()`: the path is what `Uri.parse` decoded back into the
      // name the store was keyed on. The full text is re-encoded by VS Code's own table, which
      // does not agree with `encodeURIComponent` about `/`.
      provideTextDocumentContent: (uri) => virtuals.get(uri.path),
    }),
  );

  session = await activateFudic({
    config: { get: (id) => vscode.workspace.getConfiguration().get(id) },
    fs: { exists: existsSync },
    workspace: { folders: folderPaths(vscode.workspace.workspaceFolders) },
    notifications: { warn: (message) => void vscode.window.showWarningMessage(message) },
    logger: { info: (message) => output.appendLine(message) },
    createClient: (launch) => createClient(launch, output),
    statusBar: {
      setText: (text) => {
        bar.text = text;
      },
      setTooltip: (tooltip) => {
        bar.tooltip = tooltip;
      },
      show: () => bar.show(),
      hide: () => bar.hide(),
    },
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    bundledServerPath: bundledServerPath(context.extensionPath),
    vscodeTsdk: vscodeTsdkPath(vscode.env.appRoot),
  });

  const results = createWorkbenchResults();
  const benchBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  benchBar.command = 'fudic.openWorkbench';
  const opened = createWorkbenches({
    fs: { exists: existsSync },
    workspace: { folders: folderPaths(vscode.workspace.workspaceFolders) },
    config: { get: (id) => vscode.workspace.getConfiguration().get(id) },
    processes: nodeProcesses,
    panels: { open: openWorkbenchPanel },
    notifications: { warn: (message) => void vscode.window.showWarningMessage(message) },
    results,
    status: {
      show: (text, tooltip) => {
        benchBar.text = text;
        benchBar.tooltip = tooltip;
        benchBar.show();
      },
      hide: () => benchBar.hide(),
    },
    progress: {
      begin: (title) => {
        let end!: () => void;
        void vscode.window.withProgress(
          { location: vscode.ProgressLocation.Window, title },
          () => new Promise<void>((resolve) => (end = resolve)),
        );
        return () => end();
      },
    },
  });
  workbenches = opened;
  const lensesChanged = new vscode.EventEmitter<void>();
  opened.onLensesChanged(() => lensesChanged.fire());
  context.subscriptions.push(
    results,
    benchBar,
    lensesChanged,
    vscode.window.onDidChangeActiveTextEditor((editor) => opened.focus(workbenchFileOf(editor))),
    vscode.window.onDidChangeVisibleTextEditors(() => results.repaint()),
    // Over the `component` line, what is about the whole spec; «▶ Run» over each criterion.
    // A lens with nothing to do (a spinner) has an empty command: VS Code draws it as text.
    vscode.languages.registerCodeLensProvider(
      { language: 'fudspec' },
      {
        onDidChangeCodeLenses: lensesChanged.event,
        provideCodeLenses: (document) => {
          const file = document.uri.fsPath.replaceAll('\\', '/');
          return specLenses(document.getText(), opened.lensState(file)).map(
            (lens) =>
              new vscode.CodeLens(new vscode.Range(lens.line, 0, lens.line, 0), {
                title: lens.title,
                command: lens.action === null ? '' : RUN_CRITERION,
                arguments: lens.action === null ? [] : [file, lens.action],
              }),
          );
        },
      },
    ),
    vscode.commands.registerCommand(RUN_CRITERION, (file: string, action: LensAction) => opened.act(file, action)),
  );
  opened.focus(workbenchFileOf(vscode.window.activeTextEditor));

  registerCommands(
    {
      register: (id, handler) =>
        context.subscriptions.push(vscode.commands.registerCommand(id, handler)),
    },
    {
      session,
      editor: {
        activeFudUri: () => fudUriOf(vscode.window.activeTextEditor),
        activeWorkbenchFile: () => workbenchFileOf(vscode.window.activeTextEditor),
      },
      documents: {
        openReadOnly: async (name, languageId, text) => {
          const document = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(virtuals.put(name, text)),
          );
          await vscode.languages.setTextDocumentLanguage(document, languageId);
          await vscode.window.showTextDocument(document, { preview: false });
        },
      },
      // Through the editor rather than straight to the server: that is what routes to the
      // default formatter the `[fudic]` defaults set, and from there to SDD-26.
      formatter: {
        formatActiveDocument: async () => {
          await vscode.commands.executeCommand('editor.action.formatDocument');
        },
      },
      notifications: { warn: (message) => void vscode.window.showWarningMessage(message) },
      logger: { info: (message) => output.appendLine(message) },
      workbenches,
      selection: {
        current: () => commentSelectionOf(vscode.window.activeTextEditor),
        replaceLines: (replacement) =>
          replaceLines(
            vscode.window.activeTextEditor,
            replacement,
            (startLine, startChar, endLine, endChar) =>
              new vscode.Range(startLine, startChar, endLine, endChar),
          ),
      },
    },
  );

  // Bound to the session rather than to the client: a restart replaces the client, and this
  // listener has to keep working across one.
  watchTypedTags(
    {
      onTyped: (listener) => {
        context.subscriptions.push(
          vscode.workspace.onDidChangeTextDocument((event) => listener(typedTextOf(event))),
        );
      },
      insert: (target) =>
        insertClosingTag(
          vscode.window.activeTextEditor,
          target,
          (text) => new vscode.SnippetString(text),
        ),
    },
    session,
  );

  watchEmptyValues({
    onMoved: (listener) => {
      context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((event) => listener(caretAtOf(event))),
      );
    },
    triggerSuggest: () => {
      void vscode.commands.executeCommand('editor.action.triggerSuggest');
    },
    hideSuggest: () => {
      void vscode.commands.executeCommand('hideSuggestWidget');
    },
  });

  // The editor that is already open when the extension activates never fires the change
  // event, so the first state has to be pushed by hand — otherwise opening a `.fud` from a
  // cold start shows nothing at all in the status bar.
  session.status.setActiveLanguage(languageOf(vscode.window.activeTextEditor));
}

export async function deactivate(): Promise<void> {
  // No workbench process outlives the editor: each one cleans up when its stdin closes.
  workbenches?.closeAll();
  workbenches = undefined;
  const stopping = session?.client.stop();
  session = undefined;
  await stopping;
}
