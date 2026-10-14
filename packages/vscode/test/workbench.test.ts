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
  criterionLenses,
  NODE_SETTING,
  samePath,
  WORKBENCH_BIN,
  WORKERS_SETTING,
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
  readonly view: { title: string; url: string };
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
        let closed: () => void = () => undefined;
        const panel: FakePanel = {
          view,
          revealed: 0,
          stopped: [],
          reveal() {
            panel.revealed += 1;
          },
          showStopped: (message) => panel.stopped.push(message),
          onClosed: (listener) => {
            closed = listener;
          },
          close: () => closed(),
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
  });
  return { workbenches, processes, panels, warnings, shown, cleared, status };
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

  it('criterionLenses puts Run over each criterion, and Run failing once over the first', () => {
    const text = 'component app-card\n\ncriterion alto\n  then\n    visible app-card\n\ncriterion  titulo\ncriterion\n';
    expect(criterionLenses(text)).toEqual([
      { line: 2, title: '▶ Run failing', id: null },
      { line: 2, title: '▶ Run', id: 'alto' },
      { line: 6, title: '▶ Run', id: 'titulo' },
    ]);
    expect(criterionLenses('component app-card\n')).toEqual([]);
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

  it('a second component of the same project is an open on the stdin of the process, and its tab opens on the answer', async () => {
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
    expect(w.panels.map((p) => p.view)).toEqual([
      { title: 'Workbench · app-card', url: URL_OF('app-card') },
      { title: 'Workbench · app-tabs', url: URL_OF('app-tabs') },
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

  it('a second component of a process that never came up opens nothing', async () => {
    const w = world();
    const first = w.workbenches.open(CARD);
    const second = w.workbenches.open(TABS);
    await w.processes[0]!.answer(undefined);
    await Promise.all([first, second]);
    expect(w.processes[0]!.sent).toEqual([]);
    expect(w.panels).toEqual([]);
  });

  it('an open the process refuses is a warning, and no tab', async () => {
    const w = world();
    const process = await launched(w, CARD, 'app-card');
    const opening = w.workbenches.open(TABS);
    await settled();
    await process.emit({ v: 2, type: 'error', file: TABS, error: { code: 'FUD0977', message: 'not this project' } });
    await opening;
    expect(w.warnings).toEqual([workbenchFailed('not this project')]);
    expect(w.panels).toHaveLength(1);
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
    await p.emit({ v: 2, type: 'state', tag: 'app-card', paused: true, pinned: null, pending: 0 });
    await p.emit({ v: 2, type: 'opened', url: URL_OF('x'), tag: 'x' });
    expect(w.shown.get(CARD_SPEC)).toBe(before);
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

describe('the CodeLens runs — criterion 14', () => {
  it('runs that id, or the failing ones, on the stdin of the open process', async () => {
    const w = world();
    const p = await launched(w, CARD, 'app-card');
    await w.workbenches.run(CARD_SPEC, 'titulo');
    await w.workbenches.run(CARD_SPEC, null);
    expect(p.sent).toEqual([
      { v: 2, type: 'run', tag: 'app-card', ids: ['titulo'] },
      { v: 2, type: 'run', tag: 'app-card', failing: true },
    ]);
  });

  it('without the workbench open, opens it, and that run is the one asked for', async () => {
    const w = world();
    const running = w.workbenches.run(CARD_SPEC, 'titulo');
    await w.processes[0]!.answer(LINE('app-card', CARD));
    await running;
    expect(w.panels).toHaveLength(1);
    expect(w.processes[0]!.sent).toEqual([]);
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

  it('opens no tab when it dies between its line and the tab', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    process.exit('');
    await process.answer(LINE('app-card', CARD));
    await opening;
    expect(w.panels).toEqual([]);
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
    expect(w.panels).toEqual([]);
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
  });

  it('an {error} line shows its message, closes the process and opens no tab', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    await process.answer(JSON.stringify({ error: { code: 'FUD0970', message: 'C:/x.fud is not a component with a tag' } }));
    await opening;
    expect(w.warnings).toEqual(['Fudic: C:/x.fud is not a component with a tag']);
    expect(process.stdinClosed).toBe(1);
    expect(w.panels).toEqual([]);
  });

  it.each([
    ['no line at all', undefined],
    ['a line that is not JSON', 'Segmentation fault'],
    ['JSON that is not an object', '42'],
    ['JSON that is not an answer', '{"hello":1}'],
    ['an error without a message', '{"error":{"code":"FUD0970"}}'],
    ['a url without a tag', JSON.stringify({ url: URL_OF('app-card'), component: CARD })],
    ['a url without a component', JSON.stringify({ url: URL_OF('app-card'), tag: 'app-card' })],
  ])('%s: closes the process, says it stopped, opens no tab', async (_name, line) => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    await process.answer(line);
    await opening;
    expect(w.warnings).toEqual([workbenchFailed(workbenchStopped(''))]);
    expect(process.stdinClosed).toBe(1);
    expect(w.panels).toEqual([]);
  });
});
