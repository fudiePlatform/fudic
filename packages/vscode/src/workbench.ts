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
 */

import { nodeNotFound, WORKBENCH_NOT_INSTALLED, workbenchFailed, workbenchStopped } from './commands/messages.js';
import type {
  ConfigurationPort,
  CriterionView,
  FileSystemPort,
  NotificationPort,
  ProcessPort,
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
}

export interface Workbenches {
  /** Opens the workbench of the `.fud` or `.fudspec` at `file`, or reveals the one already open. */
  open(file: string): Promise<void>;
  /** Runs one criterion, or the failing ones (`id` null); opens the workbench when it is not. */
  run(file: string, id: string | null): Promise<void>;
  /** The active editor changed: the status bar shows its component, if it is open. */
  focus(file: string | undefined): void;
  /** Closes every process: the extension is going away. */
  closeAll(): void;
}

/** What a component's last messages said, kept to paint its `.fudspec`. */
interface Component {
  readonly tag: string;
  readonly path: string;
  panel?: WorkbenchPanel;
  spec: string | null;
  criteria: readonly { readonly id: string; readonly line: number; readonly steps: readonly string[] }[];
  readonly results: Map<string, Result>;
  readonly running: Set<string>;
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

/** The CodeLenses of a `.fudspec`: «▶ Run» over each criterion, «▶ Run failing» over the first. */
export function criterionLenses(text: string): { readonly line: number; readonly title: string; readonly id: string | null }[] {
  const lenses: { line: number; title: string; id: string | null }[] = [];
  text.split('\n').forEach((source, line) => {
    const id = /^criterion\s+(\S+)/u.exec(source)?.[1];
    if (id === undefined) return;
    if (lenses.length === 0) lenses.push({ line, title: '▶ Run failing', id: null });
    lenses.push({ line, title: '▶ Run', id });
  });
  return lenses;
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
  let focused: string | undefined;

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
  };

  const showStatus = (): void => {
    const found = focused === undefined ? undefined : find(componentOf(focused));
    if (found === undefined) {
      deps.status.hide();
      return;
    }
    const all = found.component.criteria.length;
    const pass = found.component.criteria.filter((c) => found.component.results.get(c.id)?.verdict === 'pass').length;
    deps.status.show(`$(beaker) ${found.component.tag} ${pass}/${all}`, `Workbench · ${found.component.tag}: ${pass} of ${all} pass`);
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
    } else {
      return;
    }
    paint(component);
  };

  /** A component the process answered with: its tab, and what closing it does. */
  const attach = (folder: string, project: Project, answer: Message): void => {
    const tag = answer['tag'] as string;
    const path = samePath(answer['component'] as string);
    const component: Component = { tag, path, spec: null, criteria: [], results: new Map(), running: new Set() };
    project.components.set(path, component);
    const panel = deps.panels.open({ title: `Workbench · ${tag}`, url: answer['url'] as string });
    component.panel = panel;
    panel.onClosed(() => {
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
    });
    const early = project.early.get(tag) ?? [];
    project.early.delete(tag);
    for (const message of early) receive(project, message);
    showStatus();
  };

  const launch = (folder: string, file: string): Project => {
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
        component.panel?.showStopped(workbenchStopped(stderr));
        if (component.spec !== null) deps.results.clear(component.spec);
      }
      project.components.clear();
      up(false);
      showStatus();
    });

    void process.firstLine.then(
      (line) => {
        const answer = parse(line);
        const failure = errorOf(answer);
        if (answer === undefined || failure !== undefined || !opensComponent(answer)) {
          projects.delete(folder);
          process.closeStdin();
          deps.notifications.warn(workbenchFailed(failure ?? workbenchStopped('')));
          up(false);
          return;
        }
        // The process died between its line and here: its exit already said why.
        if (projects.get(folder) !== project) return;
        attach(folder, project, answer);
        up(true);
      },
      (error: unknown) => {
        projects.delete(folder);
        const missing = (error as { code?: unknown }).code === 'ENOENT';
        deps.notifications.warn(missing ? nodeNotFound(command) : workbenchFailed(String(error)));
        up(false);
      },
    );
    return project;
  };

  /** Another component into a process that is up: `open`, and wait for its answer. */
  const openInto = (folder: string, project: Project, file: string): Promise<void> =>
    new Promise((resolve) => {
      project.waiting.set(file, (answer) => {
        project.waiting.delete(file);
        const failure = errorOf(answer);
        if (failure !== undefined) deps.notifications.warn(workbenchFailed(failure));
        else attach(folder, project, answer);
        resolve();
      });
      project.process.send(JSON.stringify({ v: 2, type: 'open', file }));
    });

  const open = async (file: string): Promise<void> => {
    const known = find(componentOf(file));
    if (known !== undefined) {
      // Saving already runs it again: there is nothing to relaunch.
      known.component.panel?.reveal();
      return;
    }
    const folder = installedAt(file);
    if (folder === undefined) {
      deps.notifications.warn(WORKBENCH_NOT_INSTALLED);
      return;
    }
    const running = projects.get(folder);
    if (running === undefined) {
      await launch(folder, file).ready;
      return;
    }
    if (await running.ready) await openInto(folder, running, file);
  };

  return {
    open,

    async run(file, id) {
      const known = find(componentOf(file));
      if (known === undefined) {
        // Opening runs every criterion: the one asked for among them.
        await open(file);
        return;
      }
      const command = id === null ? { failing: true } : { ids: [id] };
      known.project.process.send(JSON.stringify({ v: 2, type: 'run', tag: known.component.tag, ...command }));
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
