/**
 * The workbench as the extension sees it (SDD-32 §4.10, BUG-48 §4.9 and criterion 14): one process
 * per project, launched from the project's own `@fudic/workbench`, a tab per component, and the
 * `.fudspec` painted from the process's messages. Every port is doubled: nothing here spawns or
 * opens anything.
 */

import { describe, expect, it } from 'vitest';
import {
  nodeNotFound,
  WORKBENCH_NOT_INSTALLED,
  workbenchFailed,
  workbenchStopped,
} from '../src/commands/messages.js';
import type { CriterionView, WorkbenchPanel, WorkbenchProcess } from '../src/ports.js';
import {
  BROWSER_SETTING,
  componentOf,
  createWorkbenches,
  IDLE,
  NODE_SETTING,
  samePath,
  specLenses,
  WORKBENCH_BIN,
  WORKERS_SETTING,
  type LensState,
} from '../src/workbench.js';

const ROOT = 'C:/work';
const APP = `${ROOT}/app`;
const CARD = `${APP}/src/components/app-card.fud`;
const CARD_SPEC = `${APP}/src/components/app-card.fudspec`;
const TABS = `${APP}/src/components/app-tabs.fud`;
const TABS_SPEC = `${APP}/src/components/app-tabs.fudspec`;
const URL_OF = (tag: string) => `http://127.0.0.1:5000/__bench/${tag}/`;
const LINE = (tag: string, component: string) => JSON.stringify({ url: URL_OF(tag), tag, component, criteria: 2, browser: 'chrome' });

/** A process whose lines, exit and stdin the test drives. */
interface FakeProcess extends WorkbenchProcess {
  readonly spawned: { command: string; args: readonly string[]; cwd: string };
  readonly sent: Record<string, unknown>[];
  stdinClosed: number;
  answer(line: string | undefined): Promise<void>;
  fail(error: unknown): Promise<void>;
  /** A later line of stdout: an object is written as JSON. */
  emit(message: object | string): Promise<void>;
  exit(stderr: string): void;
}

/** A tab that records what was done to it, and closes when the test says. */
interface FakePanel extends WorkbenchPanel {
  readonly view: { readonly title: string };
  /** Every shell it loaded, with the title it took. */
  readonly loaded: { url: string; title: string }[];
  revealed: number;
  stopped: string[];
  close(): void;
}

const settled = () => new Promise((done) => setTimeout(done, 0));

function world(options: { installed?: readonly string[]; folders?: readonly string[]; settings?: Record<string, unknown> } = {}) {
  const installed = new Set((options.installed ?? [APP]).map((dir) => `${dir}/${WORKBENCH_BIN}`));
  const processes: FakeProcess[] = [];
  const panels: FakePanel[] = [];
  const warnings: string[] = [];
  /** What each `.fudspec` shows: its last views, or gone when cleared. */
  const shown = new Map<string, readonly CriterionView[]>();
  const cleared: string[] = [];
  const status: (string | null)[] = [];
  /** Every progress shown, and whether it ended. */
  const progress: { title: string; ended: boolean }[] = [];

  const workbenches = createWorkbenches({
    fs: { exists: (path) => installed.has(path) },
    workspace: { folders: options.folders ?? [ROOT] },
    config: { get: (id) => options.settings?.[id] },
    processes: {
      spawn(command, args, cwd) {
        let resolve: (line: string | undefined) => void = () => undefined;
        let reject: (error: unknown) => void = () => undefined;
        const exits: ((stderr: string) => void)[] = [];
        const lines: ((line: string) => void)[] = [];
        const process: FakeProcess = {
          spawned: { command, args, cwd },
          sent: [],
          stdinClosed: 0,
          firstLine: new Promise((ok, no) => {
            resolve = ok;
            reject = no;
          }),
          onLine: (listener) => lines.push(listener),
          send: (line) => process.sent.push(JSON.parse(line) as Record<string, unknown>),
          closeStdin() {
            process.stdinClosed += 1;
          },
          onExit: (listener) => exits.push(listener),
          async answer(line) {
            resolve(line);
            await settled();
          },
          async fail(error) {
            reject(error);
            await settled();
          },
          async emit(message) {
            for (const listener of lines) listener(typeof message === 'string' ? message : JSON.stringify(message));
            await settled();
          },
          exit: (stderr) => {
            for (const listener of exits) listener(stderr);
          },
        };
        processes.push(process);
        return process;
      },
    },
    panels: {
      open(view) {
        const closed: (() => void)[] = [];
        const panel: FakePanel = {
          view,
          loaded: [],
          revealed: 0,
          stopped: [],
          load: (url, title) => void panel.loaded.push({ url, title }),
          reveal() {
            panel.revealed += 1;
          },
          showStopped: (message) => panel.stopped.push(message),
          onClosed: (listener) => void closed.push(listener),
          close: () => closed.forEach((listener) => listener()),
        };
        panels.push(panel);
        return panel;
      },
    },
    notifications: { warn: (message) => warnings.push(message) },
    results: {
      show: (spec, views) => void shown.set(spec, views),
      clear: (spec) => {
        shown.delete(spec);
        cleared.push(spec);
      },
    },
    status: {
      show: (text) => void status.push(text),
      hide: () => void status.push(null),
    },
    progress: {
      begin(title) {
        const shown = { title, ended: false };
        progress.push(shown);
        return () => {
          shown.ended = true;
        };
      },
    },
  });
  let lensChanges = 0;
  workbenches.onLensesChanged(() => (lensChanges += 1));
  return {
    workbenches,
    processes,
    panels,
    warnings,
    shown,
    cleared,
    status,
    progress,
    /** How many times the lenses were told to redraw. */
    lensChanges: () => lensChanges,
  };
}

type World = ReturnType<typeof world>;

/** Opens a file in a new process and answers it with the JSON line of its component. */
async function launched(w: World, file: string, tag: string) {
  const opening = w.workbenches.open(file);
  const process = w.processes.at(-1)!;
  await process.answer(LINE(tag, componentOf(file)));
  await opening;
  return process;
}

const SESSION = (tag: string, spec: string) => ({
  v: 2,
  type: 'session',
  tag,
  spec,
  diagnostics: [],
  criteria: [
    { id: 'alto', route: `/${tag}/alto`, line: 3, steps: [{ block: 'then', text: `${tag} is at least 44 px tall`, file: null }] },
    {
      id: 'titulo',
      route: `/${tag}/titulo`,
      line: 8,
      steps: [
        { block: 'when', text: 'click role:link', file: null },
        { block: 'then', text: `${tag} says "A title"`, file: null },
      ],
    },
  ],
});

function result(tag: string, id: string, verdict: string, extra: Record<string, unknown> = {}) {
  return { v: 2, type: 'result', tag, id, verdict, ms: 1, steps: [], shots: {}, marks: [], pageErrors: [], ...extra };
}

describe('the helpers', () => {
  it('componentOf is the .fud of a .fudspec, and the .fud itself', () => {
    expect(componentOf(CARD_SPEC)).toBe(CARD);
    expect(componentOf(CARD)).toBe(CARD);
  });

  it('samePath writes a path one way: forward slashes and an upper-case drive', () => {
    expect(samePath('c:\\work\\app\\a.fud')).toBe('C:/work/app/a.fud');
    expect(samePath('/home/me/a.fud')).toBe('/home/me/a.fud');
  });

});

describe('specLenses — what the lenses of a .fudspec show', () => {
  const TEXT = '\ncomponent app-card\n\ncriterion alto\n  then\n    visible app-card\n\ncriterion  titulo\ncriterion\n';
  const state = (over: Partial<LensState>): LensState => ({ ...IDLE, ...over });
  const RUN_ALL = { line: 1, title: '▶ Run all', action: { type: 'run', all: true } };
  const RUN_FAILING = { line: 1, title: '▶ Run failing', action: { type: 'run', failing: true } };
  const CRITERIA = [
    { line: 3, title: '▶ Run', action: { type: 'run', id: 'alto' } },
    { line: 7, title: '▶ Run', action: { type: 'run', id: 'titulo' } },
  ];

  it('closed: Run all and Run failing over the component line, Run over each criterion', () => {
    expect(IDLE).toEqual({ starting: false, open: false, paused: false, pending: 0, pinned: null, running: new Set() });
    expect(specLenses(TEXT, IDLE)).toEqual([RUN_ALL, RUN_FAILING, ...CRITERIA]);
  });

  it('without a component line they go over the first criterion; with neither there are none', () => {
    expect(specLenses('\ncriterion alto\n', IDLE).map((l) => [l.line, l.title])).toEqual([
      [1, '▶ Run all'],
      [1, '▶ Run failing'],
      [1, '▶ Run'],
    ]);
    expect(specLenses('component\n\n', IDLE)).toEqual([]);
    // A component without criteria: nothing is running, however the state says it.
    expect(specLenses('component app-card', state({ running: new Set(['x']) })).map((l) => l.title)).toEqual(['▶ Run all', '▶ Run failing']);
  });

  it('starting: one lens that says so and does nothing, and the criteria as they are', () => {
    expect(specLenses(TEXT, state({ starting: true }))).toEqual([
      { line: 1, title: '$(sync~spin) Starting workbench…', action: null },
      ...CRITERIA,
    ]);
  });

  it('open: Pause and Cancel too; paused, Resume with the saves waiting', () => {
    const open = specLenses(TEXT, state({ open: true }));
    expect(open.slice(0, 4)).toEqual([
      RUN_ALL,
      RUN_FAILING,
      { line: 1, title: '⏸ Pause', action: { type: 'pause', paused: true } },
      { line: 1, title: '■ Cancel', action: { type: 'cancel' } },
    ]);
    expect(specLenses(TEXT, state({ open: true, paused: true }))[2]).toEqual({ line: 1, title: '▶ Resume', action: { type: 'pause', paused: false } });
    expect(specLenses(TEXT, state({ open: true, paused: true, pending: 3 }))[2]).toMatchObject({ title: '▶ Resume (3)' });
  });

  it('pinned, Run all says Run pinned, and spins as soon as the pinned one runs', () => {
    const pinned = specLenses(TEXT, state({ open: true, pinned: 'titulo' }));
    expect(pinned[0]).toEqual({ ...RUN_ALL, title: '▶ Run pinned' });
    // The other criterion running is not what Run pinned runs.
    expect(specLenses(TEXT, state({ open: true, pinned: 'titulo', running: new Set(['alto']) }))[0]!.title).toBe('▶ Run pinned');
    expect(specLenses(TEXT, state({ open: true, pinned: 'titulo', running: new Set(['titulo']) }))[0]).toEqual({
      ...RUN_ALL,
      title: '$(sync~spin) Running pinned…',
    });
    // A pin the text no longer has: nothing it reaches is running.
    expect(specLenses(TEXT, state({ open: true, pinned: 'gone', running: new Set(['alto', 'titulo']) }))[0]!.title).toBe('▶ Run pinned');
  });

  it('a criterion running spins and does nothing; all of them running, Run all spins too', () => {
    const one = specLenses(TEXT, state({ open: true, running: new Set(['titulo']) }));
    expect(one[0]!.title).toBe('▶ Run all');
    expect(one.slice(4)).toEqual([CRITERIA[0], { line: 7, title: '$(sync~spin) Running…', action: null }]);
    const all = specLenses(TEXT, state({ open: true, running: new Set(['alto', 'titulo']) }));
    expect(all[0]).toEqual({ ...RUN_ALL, title: '$(sync~spin) Running all…' });
    expect(all.slice(4).map((l) => l.action)).toEqual([null, null]);
  });
});

describe('the tab opens at the click', () => {
  it('under the file\'s name, with the window progress, both until the process answers', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD_SPEC);
    expect(w.panels.map((p) => p.view)).toEqual([{ title: 'Workbench · app-card' }]);
    expect(w.progress).toEqual([{ title: 'Workbench · app-card: starting…', ended: false }]);
    expect(w.workbenches.lensState(CARD)).toEqual({ ...IDLE, starting: true });
    expect(w.workbenches.lensState(CARD_SPEC).starting).toBe(true);
    expect(w.lensChanges()).toBe(1);
    await w.processes[0]!.answer(LINE('app-card-x', CARD));
    await opening;
    expect(w.panels[0]!.loaded).toEqual([{ url: URL_OF('app-card-x'), title: 'Workbench · app-card-x' }]);
    expect(w.progress[0]!.ended).toBe(true);
    expect(w.workbenches.lensState(CARD_SPEC)).toMatchObject({ starting: false, open: true });
    expect(w.lensChanges()).toBe(2);
  });

  it('a second click while it starts reveals the same tab and waits for it', async () => {
    const w = world();
    const first = w.workbenches.open(CARD);
    let second = false;
    void w.workbenches.open(CARD_SPEC).then(() => (second = true));
    await settled();
    expect(w.panels).toHaveLength(1);
    expect(w.panels[0]!.revealed).toBe(1);
    expect(w.processes).toHaveLength(1);
    expect(second).toBe(false);
    await w.processes[0]!.answer(LINE('app-card', CARD));
    await first;
    await settled();
    expect(second).toBe(true);
  });

  it('closed before the process answered, the only component closes the process at once', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    w.panels[0]!.close();
    await w.processes[0]!.answer(LINE('app-card', CARD));
    await opening;
    expect(w.panels[0]!.loaded).toEqual([]);
    expect(w.processes[0]!.stdinClosed).toBe(1);
    expect(w.workbenches.lensState(CARD)).toBe(IDLE);
  });

  it('closed before its open was answered, a second component is closed in the process', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    const opening = w.workbenches.open(TABS);
    await settled();
    w.panels[1]!.close();
    await process.emit({ v: 2, type: 'opened', url: URL_OF('app-tabs'), tag: 'app-tabs', component: TABS, criteria: 2, file: TABS });
    await opening;
    expect(w.panels[1]!.loaded).toEqual([]);
    expect(process.sent.at(-1)).toEqual({ v: 2, type: 'close', tag: 'app-tabs' });
    expect(process.stdinClosed).toBe(0);
  });
});

describe('launching — criterion 24', () => {
  it('runs the project\'s binary on the file, with Node from the PATH by default', async () => {
    const w = world();
    await launched(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned).toEqual({ command: 'node', args: [`${APP}/${WORKBENCH_BIN}`, CARD], cwd: APP });
  });

  it('runs the Node of the setting, and passes the browser and the workers of the settings', async () => {
    const w = world({ settings: { [NODE_SETTING]: 'C:/tools/node22/node.exe', [BROWSER_SETTING]: ' msedge ', [WORKERS_SETTING]: 2 } });
    await launched(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned.command).toBe('C:/tools/node22/node.exe');
    expect(w.processes[0]!.spawned.args).toEqual([`${APP}/${WORKBENCH_BIN}`, CARD, '--browser', 'msedge', '--workers', '2']);
  });

  it('takes an empty or non-string setting as unset', async () => {
    for (const value of ['', '   ', null, true]) {
      const w = world({ settings: { [NODE_SETTING]: value, [BROWSER_SETTING]: value, [WORKERS_SETTING]: value } });
      await launched(w, CARD, 'app-card');
      expect(w.processes[0]!.spawned).toMatchObject({ command: 'node', args: [`${APP}/${WORKBENCH_BIN}`, CARD] });
    }
  });

  it('finds the nearest install above the file, inside its workspace folder', async () => {
    // A monorepo: the editor opens the repository, the workbench is a devDependency of the app.
    const w = world({ installed: [ROOT, APP] });
    await launched(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned.cwd).toBe(APP);
    const root = world({ installed: [ROOT] });
    await launched(root, CARD, 'app-card');
    expect(root.processes[0]!.spawned.cwd).toBe(ROOT);
  });

  it('picks the deepest workspace folder holding the file, with any slashes', async () => {
    const w = world({ installed: [ROOT], folders: ['C:\\work', 'C:\\work\\app'] });
    await w.workbenches.open(CARD);
    // The install is above the app's folder: the app's folder is the limit.
    expect(w.processes).toEqual([]);
    expect(w.warnings).toEqual([WORKBENCH_NOT_INSTALLED]);
  });

  it('keeps the deepest folder whatever the order the workspace lists them in', async () => {
    const w = world({ installed: [ROOT], folders: ['C:/work/app', 'C:/work'] });
    await w.workbenches.open(CARD);
    expect(w.warnings).toEqual([WORKBENCH_NOT_INSTALLED]);
  });

  it('gives up at the filesystem root, on Windows and on POSIX', async () => {
    const windows = world({ installed: [], folders: [] });
    await windows.workbenches.open(CARD);
    expect(windows.warnings).toEqual([WORKBENCH_NOT_INSTALLED]);
    const posix = world({ installed: [], folders: [] });
    await posix.workbenches.open('/home/me/app/src/app-card.fud');
    expect(posix.warnings).toEqual([WORKBENCH_NOT_INSTALLED]);
    expect([...windows.processes, ...posix.processes]).toEqual([]);
  });

  it('walks up to the filesystem root for a file outside every workspace folder', async () => {
    const w = world({ installed: ['C:'], folders: ['D:/elsewhere'] });
    await launched(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned.cwd).toBe('C:');
  });
});

describe('one process per project — criterion 14', () => {
  it('Ctrl+K V on the .fud and then on its .fudspec reveals the same tab and launches nothing', async () => {
    const w = world();
    await launched(w, CARD, 'app-card');
    await w.workbenches.open(CARD_SPEC);
    await w.workbenches.open(CARD);
    expect(w.processes).toHaveLength(1);
    expect(w.panels).toHaveLength(1);
    expect(w.panels[0]!.revealed).toBe(2);
    expect(w.processes[0]!.sent).toEqual([]);
  });

  it('a second component of the same project is an open on the stdin of the process, and its tab loads on the answer', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    const opening = w.workbenches.open(TABS_SPEC);
    await settled();
    expect(w.processes).toHaveLength(1);
    expect(process.sent).toEqual([{ v: 2, type: 'open', file: TABS_SPEC }]);
    // An answer for another file is not this one's.
    await process.emit({ v: 2, type: 'opened', url: URL_OF('x'), tag: 'x', component: 'C:/x.fud', criteria: 0, file: 'C:/x.fud' });
    await process.emit({ v: 2, type: 'opened', url: URL_OF('app-tabs'), tag: 'app-tabs', component: TABS, criteria: 2, file: TABS_SPEC });
    await opening;
    expect(w.panels.map((p) => p.loaded)).toEqual([
      [{ title: 'Workbench · app-card', url: URL_OF('app-card') }],
      [{ title: 'Workbench · app-tabs', url: URL_OF('app-tabs') }],
    ]);
  });

  it('a second component while the process is still starting waits for it, then opens', async () => {
    const w = world();
    const first = w.workbenches.open(CARD);
    const second = w.workbenches.open(TABS);
    expect(w.processes).toHaveLength(1);
    const process = w.processes[0]!;
    await process.answer(LINE('app-card', CARD));
    await first;
    expect(process.sent).toEqual([{ v: 2, type: 'open', file: TABS }]);
    await process.emit({ v: 2, type: 'opened', url: URL_OF('app-tabs'), tag: 'app-tabs', component: TABS, criteria: 2, file: TABS });
    await second;
    expect(w.panels).toHaveLength(2);
  });

  it('a second component of a process that never came up loads nothing, and its tab says it stopped', async () => {
    const w = world();
    const first = w.workbenches.open(CARD);
    const second = w.workbenches.open(TABS);
    await w.processes[0]!.answer(undefined);
    await Promise.all([first, second]);
    expect(w.processes[0]!.sent).toEqual([]);
    expect(w.panels.map((p) => [p.loaded, p.stopped])).toEqual([
      [[], [workbenchFailed(workbenchStopped(''))]],
      [[], [workbenchStopped('')]],
    ]);
  });

  it('an open the process refuses is a warning, said in its tab too', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    const opening = w.workbenches.open(TABS);
    await settled();
    await process.emit({ v: 2, type: 'error', file: TABS, error: { code: 'FUD0977', message: 'not this project' } });
    await opening;
    expect(w.warnings).toEqual([workbenchFailed('not this project')]);
    expect(w.panels[1]).toMatchObject({ loaded: [], stopped: [workbenchFailed('not this project')] });
  });

  it('an open waiting when the process dies is answered: its tab says the process stopped', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    const opening = w.workbenches.open(TABS);
    await settled();
    process.exit('Error: Chrome crashed\n');
    await opening;
    expect(w.panels.map((p) => p.stopped)).toEqual([
      [workbenchStopped('Error: Chrome crashed\n')],
      [workbenchFailed(workbenchStopped('Error: Chrome crashed\n'))],
    ]);
    expect(w.warnings).toEqual([workbenchFailed(workbenchStopped('Error: Chrome crashed\n'))]);
  });

  it('closing one of two tabs sends close; closing the last closes stdin; the next Ctrl+K V launches again', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    const opening = w.workbenches.open(TABS);
    await settled();
    await process.emit({ v: 2, type: 'opened', url: URL_OF('app-tabs'), tag: 'app-tabs', component: TABS, criteria: 2, file: TABS });
    await opening;
    w.panels[1]!.close();
    expect(process.sent.at(-1)).toEqual({ v: 2, type: 'close', tag: 'app-tabs' });
    expect(process.stdinClosed).toBe(0);
    w.panels[0]!.close();
    expect(process.stdinClosed).toBe(1);
    // Its exit, after the tabs are gone, says nothing anywhere.
    process.exit('');
    expect(w.panels[0]!.stopped).toEqual([]);
    await launched(w, CARD_SPEC, 'app-card');
    expect(w.processes).toHaveLength(2);
  });

  it('a tab closed after its component was opened again leaves the new session alone', async () => {
    const w = world();
    const first = await launched(w, CARD, 'app-card');
    first.exit('crashed');
    const second = await launched(w, CARD, 'app-card');
    w.panels[0]!.close();
    expect(first.stdinClosed).toBe(0);
    await w.workbenches.open(CARD);
    expect(w.panels[1]!.revealed).toBe(1);
    expect(second.stdinClosed).toBe(0);
  });

  it('two projects are two processes, and closeAll closes the stdin of every one', async () => {
    const other = 'C:/work/site/src/app-card.fud';
    const w = world({ installed: [APP, 'C:/work/site'] });
    const card = await launched(w, CARD, 'app-card');
    const site = await launched(w, other, 'app-card');
    expect(w.processes).toHaveLength(2);
    w.workbenches.closeAll();
    expect([card.stdinClosed, site.stdinClosed]).toEqual([1, 1]);
    await launched(w, CARD, 'app-card');
    expect(w.processes).toHaveLength(3);
  });
});

describe('the .fudspec follows the results — criterion 14', () => {
  async function painted() {
    const w = world();
    const process = w.workbenches.open(CARD);
    const p = w.processes[0]!;
    // The first session comes before the line that says it opened: it waits for the tab.
    await p.emit(SESSION('app-card', CARD_SPEC));
    await p.answer(LINE('app-card', CARD));
    await process;
    return { w, p };
  }

  it('a session paints every criterion waiting, at its 0-based line', async () => {
    const { w } = await painted();
    expect(w.shown.get(CARD_SPEC)).toEqual([
      { id: 'alto', line: 2, state: 'waiting' },
      { id: 'titulo', line: 7, state: 'waiting' },
    ]);
  });

  it('running, then a fail puts the criterion in Problems at its line, with the step and its evidence', async () => {
    const { w, p } = await painted();
    await p.emit({ v: 2, type: 'running', tag: 'app-card', ids: ['alto', 'titulo'], trigger: { file: null, at: 0 } });
    expect(w.shown.get(CARD_SPEC)!.map((v) => v.state)).toEqual(['running', 'running']);
    await p.emit(result('app-card', 'alto', 'pass'));
    await p.emit(
      result('app-card', 'titulo', 'fail', {
        steps: [
          { block: 'when', term: 'click', pass: false, evidence: 'missed' },
          { block: 'then', term: 'text', pass: false, evidence: { expected: 'A title', actual: 'A tilte' } },
        ],
      }),
    );
    expect(w.shown.get(CARD_SPEC)).toEqual([
      { id: 'alto', line: 2, state: 'pass' },
      { id: 'titulo', line: 7, state: 'fail', problem: 'titulo: app-card says "A title" — expected "A title", got "A tilte"' },
    ]);
  });

  it.each([
    ['an error of the criterion', { error: 'the page answered 500' }, 'titulo: the page answered 500'],
    ['a step in error', { steps: [{ block: 'when', term: 'click', error: 'matches 2 elements' }] }, 'titulo: click role:link — matches 2 elements'],
    ['other evidence', { steps: [{ block: 'when', pass: true, evidence: 'ok' }, { block: 'then', pass: false, evidence: { px: 20 } }] }, 'titulo: app-card says "A title" — got {"px":20}'],
    ['text evidence', { steps: [{ block: 'when', pass: true, evidence: 'ok' }, { block: 'then', pass: false, evidence: 'short' }] }, 'titulo: app-card says "A title" — got short'],
    ['a step past the described ones', { steps: [{}, {}, { block: 'then', pass: false, evidence: 'x' }] }, 'titulo: then — got x'],
    ['a page error', { pageErrors: ['TypeError: boom'] }, 'titulo: TypeError: boom'],
    ['nothing to say', {}, 'titulo: error'],
  ])('the problem of %s', async (_name, extra, problem) => {
    const { w, p } = await painted();
    const steps = (extra as { steps?: object[] }).steps?.map((s) => ({ block: 'then', pass: true, ...s }));
    await p.emit(result('app-card', 'titulo', 'error', { ...extra, ...(steps === undefined ? {} : { steps }) }));
    expect(w.shown.get(CARD_SPEC)![1]).toEqual({ id: 'titulo', line: 7, state: 'error', problem });
  });

  it('a pass takes it out of Problems; cancelled puts it back to its last state', async () => {
    const { w, p } = await painted();
    await p.emit(result('app-card', 'alto', 'fail'));
    await p.emit({ v: 2, type: 'running', tag: 'app-card', ids: ['alto'], trigger: { file: null, at: 0 } });
    await p.emit({ v: 2, type: 'cancelled', tag: 'app-card', ids: ['alto'] });
    expect(w.shown.get(CARD_SPEC)![0]).toMatchObject({ state: 'fail' });
    await p.emit(result('app-card', 'alto', 'pass'));
    expect(w.shown.get(CARD_SPEC)![0]).toEqual({ id: 'alto', line: 2, state: 'pass' });
  });

  it('a new session forgets the results; a component without .fudspec paints nothing', async () => {
    const { w, p } = await painted();
    await p.emit(result('app-card', 'alto', 'pass'));
    await p.emit(SESSION('app-card', CARD_SPEC));
    expect(w.shown.get(CARD_SPEC)!.map((v) => v.state)).toEqual(['waiting', 'waiting']);
    w.shown.clear();
    await p.emit({ ...SESSION('app-card', CARD_SPEC), spec: null });
    await p.emit(result('app-card', 'alto', 'pass'));
    expect(w.shown.size).toBe(0);
  });

  it('ignores lines that are not JSON, messages without a tag, and types it does not read', async () => {
    const { w, p } = await painted();
    const before = w.shown.get(CARD_SPEC);
    await p.emit('not json');
    await p.emit('42');
    await p.emit({ v: 2, type: 'problem', message: 'gone' });
    await p.emit({ v: 2, type: 'pinned', tag: 'app-card', id: 'alto' });
    await p.emit({ v: 2, type: 'opened', url: URL_OF('x'), tag: 'x' });
    expect(w.shown.get(CARD_SPEC)).toBe(before);
  });

  it('a state message says whether it is paused and how many saves wait, for the lenses', async () => {
    const { w, p } = await painted();
    expect(w.workbenches.lensState(CARD_SPEC)).toEqual({ starting: false, open: true, paused: false, pending: 0, pinned: null, running: new Set() });
    const before = w.lensChanges();
    await p.emit({ v: 2, type: 'state', tag: 'app-card', paused: true, pinned: 'alto', pending: 2 });
    expect(w.workbenches.lensState(CARD_SPEC)).toMatchObject({ paused: true, pending: 2, pinned: 'alto' });
    expect(w.lensChanges()).toBe(before + 1);
    await p.emit({ v: 2, type: 'state', tag: 'app-card', paused: 'yes', pending: '2', pinned: 3 });
    expect(w.workbenches.lensState(CARD_SPEC)).toMatchObject({ paused: false, pending: 0, pinned: null });
  });

  it('closing the tab, or the process dying, clears the .fudspec', async () => {
    const { w, p } = await painted();
    w.panels[0]!.close();
    expect(w.cleared).toEqual([CARD_SPEC]);
    const again = await painted();
    again.p.exit('Error: Chrome crashed\n');
    expect(again.w.cleared).toEqual([CARD_SPEC]);
    expect(p.stdinClosed).toBe(1);
  });
});

describe('the status bar — criterion 14', () => {
  it('shows the component of the active editor with its count, and hides for any other file', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const p = w.processes[0]!;
    await p.emit(SESSION('app-card', CARD_SPEC));
    await p.answer(LINE('app-card', CARD));
    await opening;
    w.workbenches.focus(CARD_SPEC);
    expect(w.status.at(-1)).toBe('$(beaker) app-card 0/2');
    // A spinner while anything runs.
    await p.emit({ v: 2, type: 'running', tag: 'app-card', ids: ['alto'], trigger: { file: null, at: 0 } });
    expect(w.status.at(-1)).toBe('$(sync~spin) app-card 0/2');
    await p.emit(result('app-card', 'alto', 'pass'));
    expect(w.status.at(-1)).toBe('$(beaker) app-card 1/2');
    w.workbenches.focus(TABS);
    expect(w.status.at(-1)).toBeNull();
    w.workbenches.focus(undefined);
    expect(w.status.at(-1)).toBeNull();
    w.workbenches.focus('c:\\work\\app\\src\\components\\app-card.fud');
    expect(w.status.at(-1)).toBe('$(beaker) app-card 1/2');
    w.panels[0]!.close();
    expect(w.status.at(-1)).toBeNull();
  });
});

describe('the CodeLens actions — criterion 14', () => {
  async function painted() {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const p = w.processes[0]!;
    await p.emit(SESSION('app-card', CARD_SPEC));
    await p.answer(LINE('app-card', CARD));
    await opening;
    return { w, p };
  }
  const states = (w: World) => w.shown.get(CARD_SPEC)!.map((v) => v.state);

  it('Run sends that id, and shows it running before the process says so', async () => {
    const { w, p } = await painted();
    const before = w.lensChanges();
    await w.workbenches.act(CARD_SPEC, { type: 'run', id: 'titulo' });
    expect(p.sent).toEqual([{ v: 2, type: 'run', tag: 'app-card', ids: ['titulo'] }]);
    expect(states(w)).toEqual(['waiting', 'running']);
    expect(w.workbenches.lensState(CARD_SPEC).running).toEqual(new Set(['titulo']));
    expect(w.lensChanges()).toBe(before + 1);
  });

  it('an id the session does not know is sent, and nothing shows running', async () => {
    const { w, p } = await painted();
    await w.workbenches.act(CARD_SPEC, { type: 'run', id: 'gone' });
    expect(p.sent).toEqual([{ v: 2, type: 'run', tag: 'app-card', ids: ['gone'] }]);
    expect(states(w)).toEqual(['waiting', 'waiting']);
  });

  it('Run all sends a run without ids, and shows every criterion running', async () => {
    const { w, p } = await painted();
    await w.workbenches.act(CARD, { type: 'run', all: true });
    expect(p.sent).toEqual([{ v: 2, type: 'run', tag: 'app-card' }]);
    expect(states(w)).toEqual(['running', 'running']);
  });

  it('Run failing shows running only the ones last seen failing or in error', async () => {
    const { w, p } = await painted();
    await w.workbenches.act(CARD_SPEC, { type: 'run', failing: true });
    expect(states(w)).toEqual(['waiting', 'waiting']);
    await p.emit(result('app-card', 'alto', 'pass'));
    await p.emit(result('app-card', 'titulo', 'fail'));
    await w.workbenches.act(CARD_SPEC, { type: 'run', failing: true });
    expect(states(w)).toEqual(['pass', 'running']);
    await p.emit(result('app-card', 'alto', 'error'));
    await p.emit(result('app-card', 'titulo', 'pass'));
    await w.workbenches.act(CARD_SPEC, { type: 'run', failing: true });
    expect(states(w)).toEqual(['running', 'pass']);
    expect(p.sent).toEqual(Array.from({ length: 3 }, () => ({ v: 2, type: 'run', tag: 'app-card', failing: true })));
  });

  it('pinned, Run all and Run failing show running only the pinned one, failing only if it is red', async () => {
    const { w, p } = await painted();
    await p.emit({ v: 2, type: 'state', tag: 'app-card', paused: false, pinned: 'titulo', pending: 0 });
    await w.workbenches.act(CARD_SPEC, { type: 'run', all: true });
    expect(states(w)).toEqual(['waiting', 'running']);
    await p.emit(result('app-card', 'titulo', 'pass'));
    await p.emit(result('app-card', 'alto', 'fail'));
    // Red, but not the pinned one: failing reaches nothing.
    await w.workbenches.act(CARD_SPEC, { type: 'run', failing: true });
    expect(states(w)).toEqual(['fail', 'pass']);
    await p.emit(result('app-card', 'titulo', 'error'));
    await w.workbenches.act(CARD_SPEC, { type: 'run', failing: true });
    expect(states(w)).toEqual(['fail', 'running']);
    // Naming an id runs it, pinned or not.
    await w.workbenches.act(CARD_SPEC, { type: 'run', id: 'alto' });
    expect(states(w)).toEqual(['running', 'running']);
  });

  it('Pause, Resume and Cancel go to the process as they are', async () => {
    const { w, p } = await painted();
    await w.workbenches.act(CARD_SPEC, { type: 'pause', paused: true });
    await w.workbenches.act(CARD_SPEC, { type: 'pause', paused: false });
    await w.workbenches.act(CARD_SPEC, { type: 'cancel' });
    expect(p.sent).toEqual([
      { v: 2, type: 'pause', tag: 'app-card', paused: true },
      { v: 2, type: 'pause', tag: 'app-card', paused: false },
      { v: 2, type: 'cancel', tag: 'app-card' },
    ]);
  });

  it('without the workbench open, a run opens it; pause and cancel do nothing', async () => {
    const w = world();
    await w.workbenches.act(CARD_SPEC, { type: 'pause', paused: true });
    await w.workbenches.act(CARD_SPEC, { type: 'cancel' });
    expect(w.processes).toEqual([]);
    expect(w.workbenches.lensState(CARD_SPEC)).toBe(IDLE);
    const running = w.workbenches.act(CARD_SPEC, { type: 'run', id: 'titulo' });
    await w.processes[0]!.answer(LINE('app-card', CARD));
    await running;
    expect(w.panels).toHaveLength(1);
    // Opening runs every criterion: nothing more to send.
    expect(w.processes[0]!.sent).toEqual([]);
  });

  it('closing the tab, or the process dying, tells the lenses', async () => {
    const closing = await painted();
    const before = closing.w.lensChanges();
    closing.w.panels[0]!.close();
    expect(closing.w.lensChanges()).toBe(before + 1);
    expect(closing.w.workbenches.lensState(CARD_SPEC)).toBe(IDLE);
    const dying = await painted();
    const was = dying.w.lensChanges();
    dying.p.exit('');
    expect(dying.w.lensChanges()).toBe(was + 1);
    expect(dying.w.workbenches.lensState(CARD_SPEC)).toBe(IDLE);
  });
});

describe('a process that dies on its own', () => {
  it('says so in its tabs, with the end of its stderr', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    process.exit('Error: Chrome crashed\n');
    expect(w.panels[0]!.stopped).toEqual([workbenchStopped('Error: Chrome crashed\n')]);
    expect(workbenchStopped('Error: Chrome crashed\n')).toBe('The workbench stopped: Error: Chrome crashed');
    expect(workbenchStopped('  ')).toBe('The workbench stopped.');
    // Gone from the map: the next Ctrl+K V launches a new one.
    await launched(w, CARD, 'app-card');
    expect(w.processes).toHaveLength(2);
  });

  it('loads no shell when it dies between its line and the tab: the tab says it stopped', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    process.exit('');
    await process.answer(LINE('app-card', CARD));
    await opening;
    expect(w.panels.map((p) => [p.loaded, p.stopped])).toEqual([[[], [workbenchStopped('')]]]);
  });
});

describe('when it cannot open — criterion 27', () => {
  it('without the package installed, warns and spawns nothing', async () => {
    const w = world({ installed: [] });
    await w.workbenches.open(CARD);
    expect(w.warnings).toEqual([WORKBENCH_NOT_INSTALLED]);
    expect(w.processes).toEqual([]);
  });

  it('a spawn that fails with ENOENT says Node was not found, naming it', async () => {
    const w = world({ settings: { [NODE_SETTING]: 'nodo' } });
    const opening = w.workbenches.open(CARD);
    await w.processes[0]!.fail(Object.assign(new Error('spawn nodo ENOENT'), { code: 'ENOENT' }));
    await opening;
    expect(w.warnings).toEqual([nodeNotFound('nodo')]);
    expect(nodeNotFound('nodo')).toBe('Fudic: could not run Node (`nodo`). Set "fudic.workbench.node" to your Node executable.');
    expect(w.panels[0]).toMatchObject({ loaded: [], stopped: [nodeNotFound('nodo')] });
    expect(w.progress[0]!.ended).toBe(true);
    // And it is not remembered: the next Ctrl+K V tries again.
    void w.workbenches.open(CARD);
    expect(w.processes).toHaveLength(2);
  });

  it('any other spawn failure is shown as it is', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    await w.processes[0]!.fail(new Error('spawn EACCES'));
    await opening;
    expect(w.warnings).toEqual([workbenchFailed('Error: spawn EACCES')]);
    expect(w.panels[0]!.stopped).toEqual([workbenchFailed('Error: spawn EACCES')]);
  });

  it('an {error} line shows its message, in the tab too, and closes the process', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    await process.answer(JSON.stringify({ error: { code: 'FUD0970', message: 'C:/x.fud is not a component with a tag' } }));
    await opening;
    expect(w.warnings).toEqual(['Fudic: C:/x.fud is not a component with a tag']);
    expect(process.stdinClosed).toBe(1);
    expect(w.panels[0]).toMatchObject({ loaded: [], stopped: ['Fudic: C:/x.fud is not a component with a tag'] });
  });

  it.each([
    ['no line at all', undefined],
    ['a line that is not JSON', 'Segmentation fault'],
    ['JSON that is not an object', '42'],
    ['JSON that is not an answer', '{"hello":1}'],
    ['an error without a message', '{"error":{"code":"FUD0970"}}'],
    ['a url without a tag', JSON.stringify({ url: URL_OF('app-card'), component: CARD })],
    ['a url without a component', JSON.stringify({ url: URL_OF('app-card'), tag: 'app-card' })],
  ])('%s: closes the process, says it stopped, loads no shell', async (_name, line) => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    await process.answer(line);
    await opening;
    expect(w.warnings).toEqual([workbenchFailed(workbenchStopped(''))]);
    expect(process.stdinClosed).toBe(1);
    expect(w.panels[0]).toMatchObject({ loaded: [], stopped: [workbenchFailed(workbenchStopped(''))] });
  });
});
