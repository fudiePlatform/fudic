/**
 * The workbench, as the extension sees it: a process per component, launched from the
 * project's own `@fudic/workbench`, and a tab per process (SDD-32 §4.10).
 *
 * The extension does not import the workbench nor Playwright: the boundary is the JSON line the
 * process prints. Everything here runs over ports, so none of it needs an editor or a Chrome.
 *
 * Lifecycle: closing the tab closes the process's stdin, and it cleans up after itself; a process
 * that dies on its own says so in its tab; `closeAll` closes every one. A Chrome that outlives the
 * editor is the worst defect this feature can have.
 */

import { nodeNotFound, WORKBENCH_NOT_INSTALLED, workbenchFailed, workbenchStopped } from './commands/messages.js';
import type {
  ConfigurationPort,
  FileSystemPort,
  NotificationPort,
  ProcessPort,
  WorkbenchPanel,
  WorkbenchPanelPort,
  WorkbenchProcess,
  WorkspacePort,
} from './ports.js';

/** Where a project that installed the workbench has its binary, from the folder holding `node_modules`. */
export const WORKBENCH_BIN = 'node_modules/@fudic/workbench/dist/bin.js';

/** The setting with the Node executable; empty means the one on the PATH. */
export const NODE_SETTING = 'fudic.workbench.node';

export interface WorkbenchDeps {
  readonly fs: FileSystemPort;
  readonly workspace: WorkspacePort;
  readonly config: ConfigurationPort;
  readonly processes: ProcessPort;
  readonly panels: WorkbenchPanelPort;
  readonly notifications: NotificationPort;
}

export interface Workbenches {
  /** Opens the workbench of the `.fud` or `.fudspec` at `file`, or reveals the one already open. */
  open(file: string): Promise<void>;
  /** Closes every process: the extension is going away. */
  closeAll(): void;
}

/** What the process answers on its first line. */
type Answer =
  | { readonly url: string; readonly tag: string }
  | { readonly error: { readonly message: string } };

interface Session {
  readonly process: WorkbenchProcess;
  /** Absent until the process answered with a URL. */
  panel?: WorkbenchPanel;
}

/** The component a file opens: a `.fudspec` and its `.fud` are one workbench. */
export function componentOf(file: string): string {
  return file.replace(/\.fudspec$/u, '.fud');
}

/** The parent folder; a root is its own parent. */
function dirOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? path : path.slice(0, cut);
}

export function createWorkbenches(deps: WorkbenchDeps): Workbenches {
  const sessions = new Map<string, Session>();

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

  const node = (): string => {
    const value = deps.config.get(NODE_SETTING);
    return typeof value === 'string' && value.trim() !== '' ? value : 'node';
  };

  return {
    async open(file) {
      const component = componentOf(file);
      const known = sessions.get(component);
      if (known !== undefined) {
        // Saving already runs it again: there is nothing to relaunch.
        known.panel?.reveal();
        return;
      }

      const folder = installedAt(file);
      if (folder === undefined) {
        deps.notifications.warn(WORKBENCH_NOT_INSTALLED);
        return;
      }

      const command = node();
      const process = deps.processes.spawn(command, [`${folder}/${WORKBENCH_BIN}`, file], folder);
      const session: Session = { process };
      sessions.set(component, session);
      process.onExit((stderr) => {
        if (sessions.get(component) !== session) return;
        sessions.delete(component);
        session.panel?.showStopped(workbenchStopped(stderr));
      });

      let line: string | undefined;
      try {
        line = await process.firstLine;
      } catch (error) {
        sessions.delete(component);
        const missing = (error as { code?: unknown }).code === 'ENOENT';
        deps.notifications.warn(missing ? nodeNotFound(command) : workbenchFailed(String(error)));
        return;
      }

      const answer = parse(line);
      if (answer === undefined || 'error' in answer) {
        sessions.delete(component);
        process.closeStdin();
        deps.notifications.warn(workbenchFailed(answer?.error.message ?? workbenchStopped('')));
        return;
      }

      // The process died between its line and here: its exit already said why.
      if (sessions.get(component) !== session) return;
      const panel = deps.panels.open({ title: `Workbench · ${answer.tag}`, url: answer.url });
      session.panel = panel;
      panel.onClosed(() => {
        if (sessions.get(component) === session) sessions.delete(component);
        process.closeStdin();
      });
    },

    closeAll() {
      for (const session of sessions.values()) session.process.closeStdin();
      sessions.clear();
    },
  };
}

/** The first line as an answer; undefined when there was none or it is not one. */
function parse(line: string | undefined): Answer | undefined {
  if (line === undefined) return undefined;
  try {
    const value = JSON.parse(line) as Partial<{ url: unknown; tag: unknown; error: { message?: unknown } }>;
    if (typeof value.url === 'string' && typeof value.tag === 'string') return { url: value.url, tag: value.tag };
    if (typeof value.error?.message === 'string') return { error: { message: value.error.message } };
    return undefined;
  } catch {
    return undefined;
  }
}
