/**
 * The workbench as the extension sees it (SDD-32 §4.10, criteria 24–27): a process per
 * component, launched from the project's own `@fudic/workbench`, and a tab per process. Every
 * port is doubled: nothing here spawns or opens anything.
 */

import { describe, expect, it } from 'vitest';
import {
  nodeNotFound,
  WORKBENCH_NOT_INSTALLED,
  workbenchFailed,
  workbenchStopped,
} from '../src/commands/messages.js';
import { componentOf, createWorkbenches, NODE_SETTING, WORKBENCH_BIN } from '../src/workbench.js';
import type { WorkbenchPanel, WorkbenchProcess } from '../src/ports.js';

const ROOT = 'C:/work';
const APP = `${ROOT}/app`;
const CARD = `${APP}/src/components/app-card.fud`;
const CARD_SPEC = `${APP}/src/components/app-card.fudspec`;
const TABS = `${APP}/src/components/app-tabs.fud`;
const LINE = (tag: string, port = 5000) => JSON.stringify({ url: `http://127.0.0.1:${port}/__bench/`, tag, component: '', criteria: 1 });

/** A process whose first line, exit and stdin the test drives. */
interface FakeProcess extends WorkbenchProcess {
  readonly spawned: { command: string; args: readonly string[]; cwd: string };
  stdinClosed: number;
  answer(line: string | undefined): Promise<void>;
  fail(error: unknown): Promise<void>;
  exit(stderr: string): void;
}

/** A tab that records what was done to it, and closes when the test says. */
interface FakePanel extends WorkbenchPanel {
  readonly view: { title: string; url: string };
  revealed: number;
  stopped: string[];
  close(): void;
}

function world(options: { installed?: readonly string[]; folders?: readonly string[]; node?: unknown } = {}) {
  const installed = new Set((options.installed ?? [APP]).map((dir) => `${dir}/${WORKBENCH_BIN}`));
  const processes: FakeProcess[] = [];
  const panels: FakePanel[] = [];
  const warnings: string[] = [];
  const settled = () => new Promise((done) => setTimeout(done, 0));

  const workbenches = createWorkbenches({
    fs: { exists: (path) => installed.has(path) },
    workspace: { folders: options.folders ?? [ROOT] },
    config: { get: (id) => (id === NODE_SETTING ? options.node : undefined) },
    processes: {
      spawn(command, args, cwd) {
        let resolve: (line: string | undefined) => void = () => undefined;
        let reject: (error: unknown) => void = () => undefined;
        const exits: ((stderr: string) => void)[] = [];
        const process: FakeProcess = {
          spawned: { command, args, cwd },
          stdinClosed: 0,
          firstLine: new Promise((ok, no) => {
            resolve = ok;
            reject = no;
          }),
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
  });
  return { workbenches, processes, panels, warnings };
}

/** Opens a file and answers its process with a JSON line. */
async function opened(w: ReturnType<typeof world>, file: string, tag: string, port?: number) {
  const opening = w.workbenches.open(file);
  const process = w.processes.at(-1)!;
  await process.answer(LINE(tag, port));
  await opening;
  return process;
}

describe('componentOf', () => {
  it('is the .fud of a .fudspec, and the .fud itself', () => {
    expect(componentOf(CARD_SPEC)).toBe(CARD);
    expect(componentOf(CARD)).toBe(CARD);
  });
});

describe('launching — criterion 24', () => {
  it('runs the project\'s binary on the file, with Node from the PATH by default', async () => {
    const w = world();
    await opened(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned).toEqual({ command: 'node', args: [`${APP}/${WORKBENCH_BIN}`, CARD], cwd: APP });
  });

  it('runs the Node of the setting', async () => {
    const w = world({ node: 'C:/tools/node22/node.exe' });
    await opened(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned.command).toBe('C:/tools/node22/node.exe');
  });

  it('takes an empty or non-string setting as the PATH\'s Node', async () => {
    for (const node of ['', '   ', null, 42]) {
      const w = world({ node });
      await opened(w, CARD, 'app-card');
      expect(w.processes[0]!.spawned.command).toBe('node');
    }
  });

  it('finds the nearest install above the file, inside its workspace folder', async () => {
    // A monorepo: the editor opens the repository, the workbench is a devDependency of the app.
    const w = world({ installed: [ROOT, APP] });
    await opened(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned.cwd).toBe(APP);
    const root = world({ installed: [ROOT] });
    await opened(root, CARD, 'app-card');
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
    await opened(w, CARD, 'app-card');
    expect(w.processes[0]!.spawned.cwd).toBe('C:');
  });
});

describe('one process per component — criterion 25', () => {
  it('Ctrl+K V on the .fud and then on its .fudspec reveals the same tab and launches nothing', async () => {
    const w = world();
    await opened(w, CARD, 'app-card');
    await w.workbenches.open(CARD_SPEC);
    await w.workbenches.open(CARD);
    expect(w.processes).toHaveLength(1);
    expect(w.panels).toHaveLength(1);
    expect(w.panels[0]!.revealed).toBe(2);
  });

  it('a second Ctrl+K V while the first is still starting launches nothing', async () => {
    const w = world();
    const first = w.workbenches.open(CARD);
    await w.workbenches.open(CARD_SPEC);
    expect(w.processes).toHaveLength(1);
    await w.processes[0]!.answer(LINE('app-card'));
    await first;
    expect(w.panels).toHaveLength(1);
  });

  it('two components live side by side', async () => {
    const w = world();
    await opened(w, CARD, 'app-card', 5000);
    await opened(w, TABS, 'app-tabs', 5001);
    expect(w.panels.map((p) => p.view)).toEqual([
      { title: 'Workbench · app-card', url: 'http://127.0.0.1:5000/__bench/' },
      { title: 'Workbench · app-tabs', url: 'http://127.0.0.1:5001/__bench/' },
    ]);
  });

  it('closing the tab closes the stdin of its process, and the next Ctrl+K V launches again', async () => {
    const w = world();
    const process = await opened(w, CARD, 'app-card');
    w.panels[0]!.close();
    expect(process.stdinClosed).toBe(1);
    // Its exit, after the tab is gone, says nothing anywhere.
    process.exit('');
    expect(w.panels[0]!.stopped).toEqual([]);
    await opened(w, CARD_SPEC, 'app-card');
    expect(w.processes).toHaveLength(2);
  });

  it('a tab closed after its component was opened again leaves the new session alone', async () => {
    const w = world();
    const first = await opened(w, CARD, 'app-card');
    first.exit('crashed');
    const second = await opened(w, CARD, 'app-card');
    w.panels[0]!.close();
    expect(first.stdinClosed).toBe(1);
    await w.workbenches.open(CARD);
    expect(w.panels[1]!.revealed).toBe(1);
    expect(second.stdinClosed).toBe(0);
  });

  it('closeAll closes the stdin of every process', async () => {
    const w = world();
    const card = await opened(w, CARD, 'app-card');
    const tabs = await opened(w, TABS, 'app-tabs');
    w.workbenches.closeAll();
    expect([card.stdinClosed, tabs.stdinClosed]).toEqual([1, 1]);
    await opened(w, CARD, 'app-card');
    expect(w.processes).toHaveLength(3);
  });
});

describe('a process that dies on its own', () => {
  it('says so in its tab, with the end of its stderr', async () => {
    const w = world();
    const process = await opened(w, CARD, 'app-card');
    process.exit('Error: Chrome crashed\n');
    expect(w.panels[0]!.stopped).toEqual([workbenchStopped('Error: Chrome crashed\n')]);
    expect(workbenchStopped('Error: Chrome crashed\n')).toBe('The workbench stopped: Error: Chrome crashed');
    expect(workbenchStopped('  ')).toBe('The workbench stopped.');
    // Gone from the map: the next Ctrl+K V launches a new one.
    await opened(w, CARD, 'app-card');
    expect(w.processes).toHaveLength(2);
  });

  it('opens no tab when it dies between its line and the tab', async () => {
    const w = world();
    const opening = w.workbenches.open(CARD);
    const process = w.processes[0]!;
    process.exit('');
    await process.answer(LINE('app-card'));
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
    const w = world({ node: 'nodo' });
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
    ['JSON that is not an answer', '{"hello":1}'],
    ['an error without a message', '{"error":{"code":"FUD0970"}}'],
    ['a url without a tag', '{"url":"http://127.0.0.1:1/__bench/"}'],
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
