/**
 * The adapter (SDD-25 §4.1, §5).
 *
 * The one file that imports `vscode`, so the one file a test can only reach through a
 * double — which is precisely why it is required to have no branches. What is checked here
 * is the wiring: that the ports are built from the right places, that the client is
 * registered under the id `fudic.trace.server` depends on, and that deactivation is safe
 * whether or not activation ever got anywhere.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, createClient, createWorkbenchResults, deactivate, openWorkbenchPanel } from '../src/extension.js';
import { startingHtml } from '../src/workbench-panel.js';
import { LanguageClient } from './_languageclient-stub.js';
import {
  caretEvent,
  changeTheme,
  DiagnosticSeverity,
  editorFor,
  focusEditor,
  moveCaret,
  Range,
  reset,
  showEditors,
  state,
  ThemeColor,
  typeInto,
  visibleEditor,
} from './_vscode-stub.js';
import type { ExtensionContext, OutputChannel } from 'vscode';
import type { ClientLaunch, CriterionView } from '../src/ports.js';

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

  it('closes a tag through the real adapter: keystroke, request, snippet', async () => {
    LanguageClient.answers['fudic/autoCloseTag'] = '</div>';
    await activate(context());
    focusEditor(editorFor('fudic', 'file:///x.fud', 7));

    typeInto({
      document: { languageId: 'fudic', version: 7, uri: { toString: () => 'file:///x.fud' } },
      contentChanges: [{ rangeOffset: 13, text: '>' }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // `$0` first, at the offset just past the `>`: the caret ends up between the two tags.
    expect(state.snippets).toEqual([['$0</div>', 14]]);
  });

  it('opens the value list through the real adapter: caret move, command', async () => {
    // The tabstop a Tab lands on is not a keystroke, so nothing else in the editor opens a
    // list there and the second prop of an expanded tag stayed as blank as before the
    // snippet existed (BUG-23 task 25).
    await activate(context());

    moveCaret(caretEvent('fudic', '<app-input .id=0 .name=>', 23));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.executed).toEqual(['editor.action.triggerSuggest']);
  });

  it('closes it through the real adapter once a literal is typed', async () => {
    // `.id=0`: the server answers nothing there, but the list was opened by command and VS
    // Code keeps an explicitly invoked one up showing «No suggestions». Closing it is the
    // client's job, or reaching `.name` costs an Esc or a second Tab.
    await activate(context());

    moveCaret(caretEvent('fudic', '<app-input .id=0 .name=>', 16));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.executed).toEqual(['hideSuggestWidget']);
  });

  it('does neither where the caret is on no value at all', async () => {
    await activate(context());

    moveCaret(caretEvent('fudic', '<app-input .id=0 .name=>', 10));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.executed).toEqual([]);
  });

  it('toggles a comment through the real adapter: selection, request, edit', async () => {
    LanguageClient.answers['fudic/commentSyntax'] = {
      block: ['@*', '*@'],
      removes: [['@*', '*@']],
    };
    await activate(context());
    focusEditor(
      editorFor('fudic', 'file:///x.fud', 1, '<app-x>\n  <p>hola</p>\n</app-x>', {
        start: { line: 1 },
        end: { line: 1 },
      }),
    );

    await state.commandHandlers.get('fudic.toggleComment')?.();

    const [range, text] = state.edits[0] ?? [];
    // Whole lines, and the offset the server was asked about is the `<` rather than the indent.
    expect(text).toBe('  @* <p>hola</p> *@');
    expect(range).toMatchObject({ startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 13 });
    expect(LanguageClient.created[0]?.requests).toEqual([
      { method: 'fudic/commentSyntax', params: { uri: 'file:///x.fud', offset: 10 } },
    ]);
  });

  it('points the server at the bundled bundle and watches the seven globs', async () => {
    await activate(context());

    const options = LanguageClient.created[0]?.serverOptions as { run: { module: string } };
    expect(options.run.module).toBe(join('/ext', 'dist', 'server.mjs'));
    expect(state.watchers).toEqual([
      '**/*.fud',
      '**/tsconfig*.json',
      '**/package.json',
      '**/fudic.json',
      '**/fudic/terms/**/*.js',
      '**/*.fixture.ts',
      '**/src/locales/**/*.json',
    ]);
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

  it('opens a code’s explanation in the markdown preview (SDD-50 criterion 11)', async () => {
    await activate(context());
    const explain = state.commandHandlers.get('fudic.explain') as ((path: string) => unknown) | undefined;

    // The server sends a path, as JSON; the preview wants a `Uri` of the file.
    await explain?.('/ext/dist/codes/FUD0056.md');
    expect(state.executed).toEqual(['markdown.showPreview']);
    const [uri] = state.executedArgs[0] as [{ scheme: string; path: string }];
    expect(uri.scheme).toBe('file');
    expect(uri.path).toBe('/ext/dist/codes/FUD0056.md');
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

describe('the workbench, through the adapter (SDD-32)', () => {
  const fileEditor = (languageId: string, fsPath: string) =>
    ({ ...editorFor(languageId), document: { ...editorFor(languageId).document, uri: { fsPath, toString: () => fsPath } } }) as never;

  it('opens a webview beside the editor that says it is starting, then frames the shell in the editor\'s theme', () => {
    state.themeKind = 2;
    const tab = openWorkbenchPanel({ title: 'Workbench · app-card' });
    const panel = state.panels[0]!;
    expect(panel).toMatchObject({
      viewType: 'fudic.workbench',
      title: 'Workbench · app-card',
      column: -2,
      options: { enableScripts: true, retainContextWhenHidden: true },
    });
    expect(panel.webview.html).toBe(startingHtml());
    // Nothing to open outside before the shell is there.
    panel.receive('openInBrowser');
    expect(state.external).toEqual([]);

    tab.load('http://127.0.0.1:5000/__bench/app-card/', 'Workbench · app-card-x');
    expect(panel.title).toBe('Workbench · app-card-x');
    expect(panel.webview.html).toContain('src="http://127.0.0.1:5000/__bench/app-card/?host=vscode&amp;theme=dark"');

    // Criterion 26: the button opens the same URL outside.
    panel.receive('openInBrowser');
    expect(state.external).toEqual(['http://127.0.0.1:5000/__bench/app-card/']);

    tab.reveal();
    expect(panel.revealed).toBe(1);
    tab.showStopped('The workbench stopped.');
    expect(panel.webview.posted).toEqual([{ type: 'stopped', message: 'The workbench stopped.' }]);
    let closed = 0;
    tab.onClosed(() => (closed += 1));
    panel.dispose();
    expect(closed).toBe(1);
    // A closed tab has nobody to tell.
    tab.showStopped('The workbench stopped again.');
    expect(panel.webview.posted).toHaveLength(1);
  });

  it('opens the file the shell asks for at its line, and tells the shell when the theme changes', () => {
    openWorkbenchPanel({ title: 'Workbench · app-card' });
    const panel = state.panels[0]!;
    panel.receive({ type: 'open', file: '/work/app/app-card.fudspec', line: 8 });
    expect(state.shownDocuments).toHaveLength(1);
    const [uri, options] = state.shownDocuments[0] as [{ fsPath: string }, { viewColumn: number; selection: unknown }];
    expect(uri.fsPath.replaceAll('\\', '/')).toBe('/work/app/app-card.fudspec');
    expect(options).toEqual({ viewColumn: 1, selection: new Range(7, 0, 7, 0) });

    changeTheme(1);
    changeTheme(3);
    expect(panel.webview.posted).toEqual([
      { type: 'theme', theme: 'light' },
      { type: 'theme', theme: 'dark' },
    ]);
    // Closed, it listens no more.
    panel.dispose();
    changeTheme(2);
    expect(panel.webview.posted).toHaveLength(2);
  });

  it('lights the whole line of the step under the pointer in the editors of its file, and puts it out', () => {
    openWorkbenchPanel({ title: 'Workbench · app-card' });
    const panel = state.panels[0]!;
    const spec = visibleEditor('c:\\work\\app\\app-card.fudspec');
    const other = visibleEditor('C:\\work\\app\\app-card.fud');
    state.visibleEditors = [spec, other];
    const lit = (editor: ReturnType<typeof visibleEditor>) => [...editor.painted.values()].map((ranges) => ranges.map((r) => r.startLine));

    panel.receive({ type: 'hover', file: 'C:/work/app/app-card.fudspec', line: 5 });
    expect([lit(spec), lit(other)]).toEqual([[[4]], [[]]]);
    const [type] = [...spec.painted.keys()] as [{ type: { options: unknown } }];
    expect(type.type.options).toEqual({ isWholeLine: true, backgroundColor: new ThemeColor('editor.rangeHighlightBackground') });

    panel.receive({ type: 'hover', file: 'C:/work/app/app-card.fudspec', line: null });
    expect([lit(spec), lit(other)]).toEqual([[[]], [[]]]);
    // One decoration, whatever the times it lights.
    panel.receive({ type: 'hover', file: 'C:/work/app/app-card.fudspec', line: 2 });
    expect(spec.painted.size).toBe(1);
  });

  it('registers fudic.openWorkbench, and warns when the workspace has no @fudic/workbench', async () => {
    state.folders = [{ uri: { fsPath: join('/nowhere', 'app') } }];
    state.activeEditor = fileEditor('fudspec', join('/nowhere', 'app', 'app-card.fudspec'));
    await activate(context());

    await (state.commandHandlers.get('fudic.openWorkbench') as () => Promise<void>)();

    expect(state.warnings.some((m) => m.includes('`@fudic/workbench` is not installed'))).toBe(true);
    expect(state.panels).toEqual([]);
  });

  it('refuses it without a .fud or a .fudspec active', async () => {
    state.activeEditor = editorFor('typescript');
    await activate(context());

    await (state.commandHandlers.get('fudic.openWorkbench') as () => Promise<void>)();

    expect(state.warnings.some((message) => message.includes('active .fud'))).toBe(true);
  });

  it('launches the installed workbench, opens its tab, and deactivate closes its stdin (criterion 25)', async () => {
    // A stand-in for the real binary, at the path a project that installed it has: it prints
    // its line, and leaves a mark when its stdin closes — which is how it is told to clean up.
    const root = mkdtempSync(join(tmpdir(), 'fudic-ext-'));
    try {
      const bin = join(root, 'node_modules', '@fudic', 'workbench', 'dist');
      mkdirSync(bin, { recursive: true });
      const mark = join(root, 'closed.txt');
      writeFileSync(
        join(bin, 'bin.js'),
        `process.stdout.write(JSON.stringify({ url: 'http://127.0.0.1:5000/__bench/app-card/', tag: 'app-card', component: ${JSON.stringify(join(root, 'app-card.fud'))}, criteria: 1 }) + '\\n');\n` +
          `process.stdin.on('end', () => { require('fs').writeFileSync(${JSON.stringify(mark)}, 'closed'); process.exit(0); });\n` +
          'process.stdin.resume();\n',
      );
      state.folders = [{ uri: { fsPath: root } }];
      state.settings['fudic.workbench.node'] = process.execPath;
      state.activeEditor = fileEditor('fudic', join(root, 'app-card.fud'));
      await activate(context());

      const opening = (state.commandHandlers.get('fudic.openWorkbench') as () => Promise<void>)();
      // At the click: the tab is open, saying it is starting, and the window shows progress.
      expect(state.panels.map((p) => p.webview.html)).toEqual([startingHtml()]);
      expect(state.progress).toEqual([{ options: { location: 10, title: 'Workbench · app-card: starting…' }, ended: false }]);
      await opening;

      expect(state.panels.map((p) => p.title)).toEqual(['Workbench · app-card']);
      expect(state.panels[0]!.webview.html).toContain('src="http://127.0.0.1:5000/__bench/app-card/');
      await vi.waitFor(() => expect(state.progress[0]!.ended).toBe(true));
      expect(existsSync(mark)).toBe(false);
      await deactivate();
      await vi.waitFor(() => expect(existsSync(mark)).toBe(true), { timeout: 5000 });
      await expect(deactivate()).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the .fudspec, through the adapter — criterion 14 (BUG-48)', () => {
  const SPEC = '/work/app/app-card.fudspec';
  const views: CriterionView[] = [
    { id: 'a', line: 2, state: 'pass' },
    { id: 'b', line: 7, state: 'fail', problem: 'b: app-card says "A title" — expected "A title", got "A tilte"' },
    { id: 'c', line: 12, state: 'error', problem: 'c: the page answered 500' },
    { id: 'd', line: 17, state: 'running' },
    { id: 'e', line: 22, state: 'waiting' },
  ];

  it('puts each criterion that did not pass in Problems at its line, and paints the margin of the editors in view', () => {
    const results = createWorkbenchResults();
    const spec = visibleEditor(SPEC);
    const other = visibleEditor('/work/app/app-tabs.fudspec');
    state.visibleEditors = [spec, other];
    results.show('\\work\\app\\app-card.fudspec', views);

    const problems = state.problems.get('fudic-workbench')!.byPath.get(SPEC)!;
    expect(problems.map((d) => [d.range.startLine, d.message, d.severity, d.source])).toEqual([
      [7, views[1]!.problem, DiagnosticSeverity.Error, 'fudic workbench'],
      [12, views[2]!.problem, DiagnosticSeverity.Error, 'fudic workbench'],
    ]);

    const [pass, fail, running] = state.decorationTypes.map((_, i) => i);
    const painted = (editor: ReturnType<typeof visibleEditor>, index: number) =>
      [...editor.painted.entries()].find(([type]) => (type as { type: unknown }).type === state.decorationTypes[index])![1].map(
        (range) => range.startLine,
      );
    expect([painted(spec, pass!), painted(spec, fail!), painted(spec, running!)]).toEqual([[2], [7, 12], [17]]);
    expect([painted(other, pass!), painted(other, fail!), painted(other, running!)]).toEqual([[], [], []]);
    expect(state.decorationTypes.map((t) => (t.options as { gutterIconPath: { toString(): string } }).gutterIconPath.toString())).toEqual(
      ['#2ea043', '#e5534b', '#8e8e93'].map((color) => expect.stringContaining(encodeURIComponent(color).replace('#', '%23').slice(3)) as unknown),
    );

    // An editor that comes into view later is painted on the next repaint.
    const late = visibleEditor(SPEC);
    state.visibleEditors = [late];
    results.repaint();
    expect(painted(late, fail!)).toEqual([7, 12]);

    results.clear(SPEC);
    expect(state.problems.get('fudic-workbench')!.byPath.has(SPEC)).toBe(false);
    expect(painted(late, fail!)).toEqual([]);

    results.dispose();
    expect(state.problems.get('fudic-workbench')!.disposed).toBe(true);
    expect(state.decorationTypes.every((t) => t.disposed)).toBe(true);
  });

  it('offers Run all and Run failing over the component line and Run over each criterion, running fudic.runCriterion', async () => {
    await activate(context());
    const lenses = state.codeLensProviders[0]!;
    expect(lenses.selector).toEqual({ language: 'fudspec' });
    const document = { getText: () => 'component app-card\n\ncriterion a\n\ncriterion b\n', uri: { fsPath: 'C:\\work\\app-card.fudspec' } };
    const file = 'C:/work/app-card.fudspec';
    expect(lenses.provider.provideCodeLenses(document).map((l) => [l.range.startLine, l.command])).toEqual([
      [0, { title: '▶ Run all', command: 'fudic.runCriterion', arguments: [file, { type: 'run', all: true }] }],
      [0, { title: '▶ Run failing', command: 'fudic.runCriterion', arguments: [file, { type: 'run', failing: true }] }],
      [2, { title: '▶ Run', command: 'fudic.runCriterion', arguments: [file, { type: 'run', id: 'a' }] }],
      [4, { title: '▶ Run', command: 'fudic.runCriterion', arguments: [file, { type: 'run', id: 'b' }] }],
    ]);
    expect(state.commandHandlers.has('fudic.runCriterion')).toBe(true);
    expect(state.benchBar).toMatchObject({ command: 'fudic.openWorkbench', visible: false });
  });

  it('end to end with a stand-in binary: Problems, margin and status follow its lines, and a lens sends run on its stdin', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-ext-'));
    try {
      const bin = join(root, 'node_modules', '@fudic', 'workbench', 'dist');
      mkdirSync(bin, { recursive: true });
      const spec = join(root, 'app-card.fudspec').replaceAll('\\', '/');
      const stdin = join(root, 'stdin.txt');
      const line = (value: object) => `process.stdout.write(${JSON.stringify(JSON.stringify(value))} + '\\n');\n`;
      writeFileSync(
        join(bin, 'bin.js'),
        line({ url: 'http://127.0.0.1:5000/__bench/app-card/', tag: 'app-card', component: join(root, 'app-card.fud'), criteria: 1 }) +
          line({
            v: 2,
            type: 'session',
            tag: 'app-card',
            spec,
            diagnostics: [],
            criteria: [{ id: 'a', route: '/app-card/a', line: 3, steps: [{ block: 'then', text: 'app-card says "x"', file: null }] }],
          }) +
          line({
            v: 2,
            type: 'result',
            tag: 'app-card',
            id: 'a',
            verdict: 'fail',
            ms: 1,
            steps: [{ block: 'then', term: 'text', pass: false, evidence: { expected: 'x', actual: 'y' } }],
            shots: {},
            marks: [],
            pageErrors: [],
          }) +
          `process.stdin.on('data', (d) => require('fs').appendFileSync(${JSON.stringify(stdin)}, d));\n` +
          `process.stdin.on('end', () => { require('fs').writeFileSync(${JSON.stringify(join(root, 'closed.txt'))}, 'closed'); process.exit(0); });\n`,
      );
      state.folders = [{ uri: { fsPath: root } }];
      state.settings['fudic.workbench.node'] = process.execPath;
      state.activeEditor = { ...editorFor('fudspec'), document: { ...editorFor('fudspec').document, uri: { fsPath: spec, toString: () => spec } } } as never;
      const editor = visibleEditor(spec);
      await activate(context());
      showEditors([editor]);

      const run = state.commandHandlers.get('fudic.runCriterion') as (file: string, action: unknown) => Promise<void>;
      const lenses = state.codeLensProviders[0]!.provider;
      let changed = 0;
      lenses.onDidChangeCodeLenses!(() => (changed += 1));
      const document = { getText: () => 'component app-card\n\ncriterion a\n', uri: { fsPath: spec } };
      const titles = () => lenses.provideCodeLenses(document).map((l) => [l.command.title, l.command.command, l.command.arguments]);

      const opening = run(spec, { type: 'run', id: 'a' });
      // While it starts, one lens says so and does nothing: VS Code draws it as text.
      expect(changed).toBeGreaterThan(0);
      expect(titles()[0]).toEqual(['$(sync~spin) Starting workbench…', '', []]);
      await opening;
      await vi.waitFor(() => expect(state.problems.get('fudic-workbench')!.byPath.get(spec)?.map((d) => d.message)).toEqual([
        'a: app-card says "x" — expected "x", got "y"',
      ]));
      expect([...editor.painted.values()].map((ranges) => ranges.map((r) => r.startLine))).toEqual([[], [2], []]);
      expect(state.benchBar).toMatchObject({ text: '$(beaker) app-card 0/1', visible: true });

      // Open now: the lens runs that criterion on the process's stdin.
      await run(spec, { type: 'run', id: 'a' });
      await vi.waitFor(() => expect(existsSync(stdin) && readFileSync(stdin, 'utf8')).toBe('{"v":2,"type":"run","tag":"app-card","ids":["a"]}\n'));
      // Shown running at once, before the process says anything.
      expect(titles()).toEqual([
        ['$(sync~spin) Running all…', 'fudic.runCriterion', [spec, { type: 'run', all: true }]],
        ['▶ Run failing', 'fudic.runCriterion', [spec, { type: 'run', failing: true }]],
        ['⏸ Pause', 'fudic.runCriterion', [spec, { type: 'pause', paused: true }]],
        ['■ Cancel', 'fudic.runCriterion', [spec, { type: 'cancel' }]],
        ['$(sync~spin) Running…', '', []],
      ]);
      expect(state.benchBar.text).toBe('$(sync~spin) app-card 0/1');

      // Another editor in focus: the status bar has nothing to say of it.
      focusEditor(editorFor('typescript'));
      expect(state.benchBar.visible).toBe(false);
      await deactivate();
      await vi.waitFor(() => expect(existsSync(join(root, 'closed.txt'))).toBe(true), { timeout: 5000 });
    } finally {
      // Windows holds the folder while the stand-in is still going away.
      await vi.waitFor(() => rmSync(root, { recursive: true, force: true }), { timeout: 10_000 });
    }
  }, 30_000);
});
