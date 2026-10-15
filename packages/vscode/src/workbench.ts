/**
 * The workbench, as the extension sees it (SDD-32 §4.10, BUG-48 §4.9): one process per project,
 * launched from the project's own `@fudic/workbench`, and one tab per component open in it.
 *
 * The extension does not import the workbench nor Playwright: the boundary is JSON lines. The
 * first line of a process says where its first component's shell is; later lines are the
 * messages of its components (what the margin, Problems and the status bar show) and the answers
 * to `open`. Commands go down its stdin. Everything here runs over ports, so none of it needs an
 * editor or a browser.
 *
 * Lifecycle: closing a tab closes its component; closing the last one closes the process's
 * stdin, and it cleans up after itself. A process that dies on its own says so in its tabs.
 * `closeAll` closes every one. A browser that outlives the editor is the worst defect this
 * feature can have.
 *
 * Nothing waits in silence: the tab opens at the click, saying it is starting, and the lenses
 * and the margin show what was asked for as running before the process confirms it.
 */

import { nodeNotFound, WORKBENCH_NOT_INSTALLED, workbenchFailed, workbenchStopped } from './commands/messages.js';
import type {
  ConfigurationPort,
  CriterionView,
  FileSystemPort,
  NotificationPort,
  ProcessPort,
  ProgressPort,
  WorkbenchPanel,
  WorkbenchPanelPort,
  WorkbenchProcess,
  WorkbenchResultsPort,
  WorkbenchStatusPort,
  WorkspacePort,
} from './ports.js';

/** Where a project that installed the workbench has its binary, from the folder holding `node_modules`. */
export const WORKBENCH_BIN = 'node_modules/@fudic/workbench/dist/bin.js';

/** The setting with the Node executable; empty means the one on the PATH. */
export const NODE_SETTING = 'fudic.workbench.node';
/** The browser the criteria run in: `auto` or a name, passed as `--browser`. */
export const BROWSER_SETTING = 'fudic.workbench.browser';
/** How many criteria run at once, passed as `--workers`. */
export const WORKERS_SETTING = 'fudic.workbench.workers';

export interface WorkbenchDeps {
  readonly fs: FileSystemPort;
  readonly workspace: WorkspacePort;
  readonly config: ConfigurationPort;
  readonly processes: ProcessPort;
  readonly panels: WorkbenchPanelPort;
  readonly notifications: NotificationPort;
  readonly results: WorkbenchResultsPort;
  readonly status: WorkbenchStatusPort;
  readonly progress: ProgressPort;
}

/** What a CodeLens of a `.fudspec` asks for. */
export type LensAction =
  | { readonly type: 'run'; readonly all: true }
  | { readonly type: 'run'; readonly failing: true }
  | { readonly type: 'run'; readonly id: string }
  | { readonly type: 'pause'; readonly paused: boolean }
  | { readonly type: 'cancel' };

/** A CodeLens: its 0-based line, its title, and what it does; null when it only says something. */
export interface SpecLens {
  readonly line: number;
  readonly title: string;
  readonly action: LensAction | null;
}

/** What the lenses of a `.fudspec` show: whether its workbench is starting, open, and doing what. */
export interface LensState {
  readonly starting: boolean;
  readonly open: boolean;
  readonly paused: boolean;
  /** Saves waiting while paused. */
  readonly pending: number;
  /** The criterion Run all, Run failing and a save are limited to; null when none is pinned. */
  readonly pinned: string | null;
  readonly running: ReadonlySet<string>;
}

export interface Workbenches {
  /** Opens the workbench of the `.fud` or `.fudspec` at `file`, or reveals the one already open. */
  open(file: string): Promise<void>;
  /** What a lens asks: runs, pauses or cancels; running opens the workbench when it is not. */
  act(file: string, action: LensAction): Promise<void>;
  /** What the lenses of `file` show now. */
  lensState(file: string): LensState;
  /** Called whenever what some lens shows changes. */
  onLensesChanged(listener: () => void): void;
  /** The active editor changed: the status bar shows its component, if it is open. */
  focus(file: string | undefined): void;
  /** Closes every process: the extension is going away. */
  closeAll(): void;
}

/** What a component's last messages said, kept to paint its `.fudspec`. */
interface Component {
  readonly tag: string;
  readonly path: string;
  readonly panel: WorkbenchPanel;
  spec: string | null;
  criteria: readonly { readonly id: string; readonly line: number; readonly steps: readonly string[] }[];
  readonly results: Map<string, Result>;
  readonly running: Set<string>;
  paused: boolean;
  pending: number;
  pinned: string | null;
}

/** A tab opened at the click, before its process answered: what its answer attaches to. */
interface Opening {
  readonly panel: WorkbenchPanel;
  /** The user closed the tab before the answer came. */
  closed: boolean;
  readonly done: Promise<void>;
}

/** A process: one project, its components, and the `open`s waiting for an answer. */
interface Project {
  readonly process: WorkbenchProcess;
  /** Resolves once the first line arrived: true when the process is up. */
  readonly ready: Promise<boolean>;
  readonly components: Map<string, Component>;
  readonly waiting: Map<string, (answer: Message) => void>;
  /**
   * Messages of a component not attached yet, by tag: its first session is published before the
   * line that says it opened, so it arrives first and waits here.
   */
  readonly early: Map<string, Message[]>;
}

/** The fields of the protocol's messages the extension reads. */
interface Result {
  readonly verdict: 'pass' | 'fail' | 'error';
  readonly error?: string;
  readonly steps: readonly ({ readonly block: string; readonly error: string } | { readonly block: string; readonly pass: boolean; readonly evidence?: unknown })[];
  readonly pageErrors: readonly string[];
}
type Message = { readonly type?: unknown; readonly [key: string]: unknown };

/** The component a file opens: a `.fudspec` and its `.fud` are one workbench. */
export function componentOf(file: string): string {
  return file.replace(/\.fudspec$/u, '.fud');
}

/** One spelling of a path: forward slashes, and the drive letter as Windows does not care. */
export function samePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^[a-z]:/u, (drive) => drive.toUpperCase());
}

/** The parent folder; a root is its own parent. */
function dirOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? path : path.slice(0, cut);
}

/** The spinning icon VS Code draws in a lens title. */
const SPIN = '$(sync~spin)';

/** A `.fudspec` before anything was opened: nothing starting, nothing running. */
export const IDLE: LensState = { starting: false, open: false, paused: false, pending: 0, pinned: null, running: new Set() };

/**
 * The CodeLenses of a `.fudspec`. Over its `component` line (the first criterion's without one),
 * what is about the whole spec: Run all · Run failing, and Pause · Cancel once it is open; over
 * each criterion, «▶ Run». Whatever is under way says so at once, with a spinner: the click
 * must show something before the process answers.
 */
export function specLenses(text: string, state: LensState): SpecLens[] {
  const lines = text.split('\n');
  const criteria: { line: number; id: string }[] = [];
  lines.forEach((source, line) => {
    const id = /^criterion\s+(\S+)/u.exec(source)?.[1];
    if (id !== undefined) criteria.push({ line, id });
  });
  const component = lines.findIndex((source) => /^component\s+\S/u.test(source));
  const top = component >= 0 ? component : criteria[0]?.line;
  const lenses: SpecLens[] = [];
  // Pinned, Run all reaches the pinned criterion alone: «all» running means that one.
  const reached = state.pinned === null ? criteria : criteria.filter((c) => c.id === state.pinned);
  if (top !== undefined) lenses.push(...globalLenses(top, state, reached.length > 0 && reached.every((c) => state.running.has(c.id))));
  for (const { line, id } of criteria) {
    lenses.push(
      state.running.has(id)
        ? { line, title: `${SPIN} Running…`, action: null }
        : { line, title: '▶ Run', action: { type: 'run', id } },
    );
  }
  return lenses;
}

function globalLenses(line: number, state: LensState, allRunning: boolean): SpecLens[] {
  if (state.starting) return [{ line, title: `${SPIN} Starting workbench…`, action: null }];
  const which = state.pinned === null ? 'all' : 'pinned';
  const lenses: SpecLens[] = [
    { line, title: allRunning ? `${SPIN} Running ${which}…` : `▶ Run ${which}`, action: { type: 'run', all: true } },
    { line, title: '▶ Run failing', action: { type: 'run', failing: true } },
  ];
  if (!state.open) return lenses;
  const resume = `▶ Resume${state.pending > 0 ? ` (${state.pending})` : ''}`;
  lenses.push(
    { line, title: state.paused ? resume : '⏸ Pause', action: { type: 'pause', paused: !state.paused } },
    { line, title: '■ Cancel', action: { type: 'cancel' } },
  );
  return lenses;
}

/** The tab's title before the process names the component: the file's name. */
function provisionalTitle(file: string): string {
  const name = componentOf(file).split('/').pop()!;
  return `Workbench · ${name.replace(/\.fud$/u, '')}`;
}

/** Why a criterion did not pass, in one line: the step that failed and what it got. */
function problemOf(id: string, result: Result, steps: readonly string[]): string {
  if (result.error !== undefined) return `${id}: ${result.error}`;
  const index = result.steps.findIndex((s) => 'error' in s || (s.block === 'then' && !s.pass));
  const step = result.steps[index];
  const said = step === undefined ? (result.pageErrors[0] ?? result.verdict) : evidenceOf(step);
  return `${id}: ${step === undefined ? '' : `${steps[index] ?? step.block} — `}${said}`;
}

function evidenceOf(step: Result['steps'][number]): string {
  if ('error' in step) return step.error;
  const value = step.evidence;
  if (typeof value === 'object' && value !== null && 'expected' in value && 'actual' in value) {
    return `expected ${JSON.stringify(value.expected)}, got ${JSON.stringify(value.actual)}`;
  }
  return `got ${typeof value === 'string' ? value : JSON.stringify(value)}`;
}

function parse(line: string | undefined): Message | undefined {
  if (line === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null ? (value as Message) : undefined;
  } catch {
    return undefined;
  }
}

/** A line that says where a component's shell is: what `attach` reads, all of it there. */
function opensComponent(message: Message): boolean {
  return ['url', 'tag', 'component'].every((key) => typeof message[key] === 'string');
}

/** A message's error, as the binary and the protocol write it. */
function errorOf(message: Message | undefined): string | undefined {
  const error = message?.['error'] as { message?: unknown } | undefined;
  return typeof error?.message === 'string' ? error.message : undefined;
}

export function createWorkbenches(deps: WorkbenchDeps): Workbenches {
  /** By the folder the binary was found in: one process per project. */
  const projects = new Map<string, Project>();
  /** Tabs opened at the click whose process has not answered yet, by component. */
  const openings = new Map<string, Opening>();
  const lensListeners: (() => void)[] = [];
  let focused: string | undefined;

  const lensesChanged = (): void => {
    for (const listener of lensListeners) listener();
  };

  /**
   * The nearest folder above the file with the workbench installed, without leaving its
   * workspace folder. In a monorepo the editor opens the repository and the workbench is a
   * devDependency of the app, next to the app's `package.json`, not the repository's.
   */
  const installedAt = (file: string): string | undefined => {
    const owner = deps.workspace.folders
      .map((folder) => folder.replaceAll('\\', '/'))
      .filter((folder) => file.startsWith(`${folder}/`))
      .reduce((best, folder) => (folder.length > best.length ? folder : best), '');
    for (let dir = dirOf(file); dir.length >= owner.length; ) {
      if (deps.fs.exists(`${dir}/${WORKBENCH_BIN}`)) return dir;
      const up = dirOf(dir);
      if (up === dir) return undefined;
      dir = up;
    }
    return undefined;
  };

  const setting = (id: string): string | undefined => {
    const value = deps.config.get(id);
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  const find = (path: string): { project: Project; component: Component } | undefined => {
    const key = samePath(path);
    for (const project of projects.values()) {
      const component = project.components.get(key);
      if (component !== undefined) return { project, component };
    }
    return undefined;
  };

  const views = (component: Component): CriterionView[] =>
    component.criteria.map((criterion) => {
      const result = component.results.get(criterion.id);
      if (component.running.has(criterion.id)) return { id: criterion.id, line: criterion.line, state: 'running' };
      if (result === undefined) return { id: criterion.id, line: criterion.line, state: 'waiting' };
      if (result.verdict === 'pass') return { id: criterion.id, line: criterion.line, state: 'pass' };
      return { id: criterion.id, line: criterion.line, state: result.verdict, problem: problemOf(criterion.id, result, criterion.steps) };
    });

  const paint = (component: Component): void => {
    if (component.spec !== null) deps.results.show(component.spec, views(component));
    showStatus();
    lensesChanged();
  };

  const showStatus = (): void => {
    const found = focused === undefined ? undefined : find(componentOf(focused));
    if (found === undefined) {
      deps.status.hide();
      return;
    }
    const all = found.component.criteria.length;
    const pass = found.component.criteria.filter((c) => found.component.results.get(c.id)?.verdict === 'pass').length;
    const icon = found.component.running.size > 0 ? '$(sync~spin)' : '$(beaker)';
    deps.status.show(`${icon} ${found.component.tag} ${pass}/${all}`, `Workbench · ${found.component.tag}: ${pass} of ${all} pass`);
  };

  /** A message of the process: about one of its components, or the answer to an `open`. */
  const receive = (project: Project, message: Message): void => {
    if (message.type === 'opened' || message.type === 'error') {
      const file = message['file'];
      if (typeof file === 'string') project.waiting.get(file)?.(message);
      return;
    }
    const tag = message['tag'];
    if (typeof tag !== 'string') return;
    const component = [...project.components.values()].find((c) => c.tag === tag);
    if (component === undefined) {
      project.early.set(tag, [...(project.early.get(tag) ?? []), message]);
      return;
    }
    if (message.type === 'session') {
      component.spec = typeof message['spec'] === 'string' ? message['spec'] : null;
      const criteria = message['criteria'] as readonly { id: string; line: number; steps: readonly { text: string }[] }[];
      component.criteria = criteria.map((c) => ({ id: c.id, line: c.line - 1, steps: c.steps.map((s) => s.text) }));
      component.results.clear();
      component.running.clear();
    } else if (message.type === 'running') {
      for (const id of message['ids'] as readonly string[]) component.running.add(id);
    } else if (message.type === 'result') {
      const id = message['id'] as string;
      component.running.delete(id);
      component.results.set(id, message as unknown as Result);
    } else if (message.type === 'cancelled') {
      for (const id of message['ids'] as readonly string[]) component.running.delete(id);
    } else if (message.type === 'state') {
      component.paused = message['paused'] === true;
      component.pending = typeof message['pending'] === 'number' ? message['pending'] : 0;
      component.pinned = typeof message['pinned'] === 'string' ? message['pinned'] : null;
    } else {
      return;
    }
    paint(component);
  };

  /**
   * A component the process answered with: its tab, already open, loads the shell, and closing
   * it closes the component — at once, when the user closed it while it was starting.
   */
  const attach = (folder: string, project: Project, answer: Message, opening: Opening): void => {
    const tag = answer['tag'] as string;
    const path = samePath(answer['component'] as string);
    const { panel } = opening;
    const component: Component = { tag, path, panel, spec: null, criteria: [], results: new Map(), running: new Set(), paused: false, pending: 0, pinned: null };
    project.components.set(path, component);
    const close = (): void => {
      if (project.components.get(path) !== component) return;
      project.components.delete(path);
      if (component.spec !== null) deps.results.clear(component.spec);
      if (project.components.size === 0) {
        projects.delete(folder);
        project.process.closeStdin();
      } else {
        project.process.send(JSON.stringify({ v: 2, type: 'close', tag }));
      }
      showStatus();
      lensesChanged();
    };
    if (opening.closed) {
      close();
      return;
    }
    panel.load(answer['url'] as string, `Workbench · ${tag}`);
    panel.onClosed(close);
    const early = project.early.get(tag) ?? [];
    project.early.delete(tag);
    for (const message of early) receive(project, message);
    showStatus();
  };

  const launch = (folder: string, file: string, opening: Opening): Project => {
    const command = setting(NODE_SETTING) ?? 'node';
    const args = [`${folder}/${WORKBENCH_BIN}`, file];
    const browser = setting(BROWSER_SETTING);
    const workers = setting(WORKERS_SETTING);
    if (browser !== undefined) args.push('--browser', browser);
    if (workers !== undefined) args.push('--workers', workers);
    const process = deps.processes.spawn(command, args, folder);

    // Assigned by the Promise constructor below, synchronously, before anything can call it.
    let up!: (ok: boolean) => void;
    const project: Project = {
      process,
      ready: new Promise<boolean>((resolve) => (up = resolve)),
      components: new Map(),
      waiting: new Map(),
      early: new Map(),
    };
    projects.set(folder, project);
    // Lines arrive in order and the first one is consumed before this listener sees any.
    process.onLine((line) => {
      const message = parse(line);
      if (message !== undefined) receive(project, message);
    });
    process.onExit((stderr) => {
      if (projects.get(folder) === project) projects.delete(folder);
      for (const component of project.components.values()) {
        component.panel.showStopped(workbenchStopped(stderr));
        if (component.spec !== null) deps.results.clear(component.spec);
      }
      project.components.clear();
      // The `open`s it will never answer.
      for (const [waiting, answer] of [...project.waiting]) {
        answer({ type: 'error', file: waiting, error: { message: workbenchStopped(stderr) } });
      }
      up(false);
      showStatus();
      lensesChanged();
    });

    const failed = (message: string): void => {
      projects.delete(folder);
      deps.notifications.warn(message);
      opening.panel.showStopped(message);
      up(false);
    };
    void process.firstLine.then(
      (line) => {
        const answer = parse(line);
        const failure = errorOf(answer);
        if (answer === undefined || failure !== undefined || !opensComponent(answer)) {
          process.closeStdin();
          failed(workbenchFailed(failure ?? workbenchStopped('')));
          return;
        }
        // The process died between its line and here: its exit already said why.
        if (projects.get(folder) !== project) {
          opening.panel.showStopped(workbenchStopped(''));
          return;
        }
        attach(folder, project, answer, opening);
        up(true);
      },
      (error: unknown) => {
        const missing = (error as { code?: unknown }).code === 'ENOENT';
        failed(missing ? nodeNotFound(command) : workbenchFailed(String(error)));
      },
    );
    return project;
  };

  /** Another component into a process that is up: `open`, and wait for its answer. */
  const openInto = (folder: string, project: Project, file: string, opening: Opening): Promise<void> =>
    new Promise((resolve) => {
      project.waiting.set(file, (answer) => {
        project.waiting.delete(file);
        const failure = errorOf(answer);
        if (failure !== undefined) {
          deps.notifications.warn(workbenchFailed(failure));
          opening.panel.showStopped(workbenchFailed(failure));
        } else {
          attach(folder, project, answer, opening);
        }
        resolve();
      });
      project.process.send(JSON.stringify({ v: 2, type: 'open', file }));
    });

  const open = async (file: string): Promise<void> => {
    const known = find(componentOf(file));
    if (known !== undefined) {
      // Saving already runs it again: there is nothing to relaunch.
      known.component.panel.reveal();
      return;
    }
    const key = samePath(componentOf(file));
    const starting = openings.get(key);
    if (starting !== undefined) {
      starting.panel.reveal();
      await starting.done;
      return;
    }
    const folder = installedAt(file);
    if (folder === undefined) {
      deps.notifications.warn(WORKBENCH_NOT_INSTALLED);
      return;
    }
    // The tab opens now, saying it is starting: launching Vite and a browser takes seconds.
    const title = provisionalTitle(file);
    let finish!: () => void;
    const opening: Opening = {
      panel: deps.panels.open({ title }),
      closed: false,
      done: new Promise<void>((resolve) => (finish = resolve)),
    };
    opening.panel.onClosed(() => {
      opening.closed = true;
    });
    openings.set(key, opening);
    const end = deps.progress.begin(`${title}: starting…`);
    lensesChanged();
    try {
      const running = projects.get(folder);
      if (running === undefined) await launch(folder, file, opening).ready;
      else if (await running.ready) await openInto(folder, running, file, opening);
      else opening.panel.showStopped(workbenchStopped(''));
    } finally {
      openings.delete(key);
      end();
      finish();
      lensesChanged();
    }
  };

  /** The ids a run asks for, as far as the extension knows them: what shows as running at once. */
  const asked = (component: Component, action: Extract<LensAction, { type: 'run' }>): string[] => {
    if ('id' in action) return component.criteria.some((c) => c.id === action.id) ? [action.id] : [];
    // Pinned, Run all and Run failing reach the pinned criterion alone.
    const reached = component.criteria.filter((c) => component.pinned === null || c.id === component.pinned);
    if ('all' in action) return reached.map((c) => c.id);
    // Only the ones known red: the process runs those for sure, so a spinner never stays up.
    return reached.filter((c) => {
      const verdict = component.results.get(c.id)?.verdict;
      return verdict === 'fail' || verdict === 'error';
    }).map((c) => c.id);
  };

  return {
    open,

    async act(file, action) {
      const known = find(componentOf(file));
      if (known === undefined) {
        // Opening runs every criterion: the ones asked for among them. Pause and cancel have
        // nothing to act on yet.
        if (action.type === 'run') await open(file);
        return;
      }
      const { project, component } = known;
      const tag = component.tag;
      if (action.type === 'pause') {
        project.process.send(JSON.stringify({ v: 2, type: 'pause', tag, paused: action.paused }));
        return;
      }
      if (action.type === 'cancel') {
        project.process.send(JSON.stringify({ v: 2, type: 'cancel', tag }));
        return;
      }
      for (const id of asked(component, action)) component.running.add(id);
      paint(component);
      const which = 'id' in action ? { ids: [action.id] } : 'failing' in action ? { failing: true } : {};
      project.process.send(JSON.stringify({ v: 2, type: 'run', tag, ...which }));
    },

    lensState(file) {
      if (openings.has(samePath(componentOf(file)))) return { ...IDLE, starting: true };
      const known = find(componentOf(file));
      if (known === undefined) return IDLE;
      const { paused, pending, pinned, running } = known.component;
      return { starting: false, open: true, paused, pending, pinned, running };
    },

    onLensesChanged(listener) {
      lensListeners.push(listener);
    },

    focus(file) {
      focused = file;
      showStatus();
    },

    closeAll() {
      for (const project of projects.values()) project.process.closeStdin();
      projects.clear();
    },
  };
}
