/**
 * The project the server works on: the folder it was started in, and nothing above or beside it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { within } from './locate.js';

/** What an answer says when the project is not a git repository, or has no commit yet. */
export const NO_COMMIT = 'none';

/** Reads the project: the server only ever reads, writes and runs inside `root`. */
export interface Project {
  /** Absolute; the folder the server was started in. */
  readonly root: string;
  /** The `name` of its `package.json`, or the folder's name. */
  readonly name: string;
  /** The short `HEAD` of its repository, read on every call: the agent commits between calls. */
  commit(): string;
  /** How git is run in it. */
  readonly git: Git;
}

/** Runs `git` in `root` and returns its trimmed output; throws when git fails or is missing. */
export type Git = (root: string, args: readonly string[]) => string;

const nodeGit: Git = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function nameOf(root: string): string {
  const file = join(root, 'package.json');
  if (existsSync(file)) {
    try {
      const { name } = JSON.parse(readFileSync(file, 'utf8')) as { readonly name?: unknown };
      if (typeof name === 'string' && name !== '') return name;
    } catch {
      // A package.json that does not parse names nothing: the folder does.
    }
  }
  return basename(root);
}

/** The file that makes a folder the root of a workspace, as the CLI finds it. */
const WORKSPACE_FILE = 'pnpm-workspace.yaml';

/** The folders of `root`'s folders that have a `fudic.json` — `apps/web`, `libs/ui` —, in path order. */
function projectFolders(root: string): readonly string[] {
  const groups = readdirSync(root, { withFileTypes: true }).filter((group) => group.isDirectory() && group.name !== 'node_modules');
  return groups
    .flatMap((group) =>
      readdirSync(join(root, group.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, group.name, entry.name, 'fudic.json')))
        .map((entry) => `${group.name}/${entry.name}`),
    )
    .sort()
    .map((folder) => join(root, folder));
}

/** Whether `root` is the root of a workspace of fudic projects, which has no `fudic.json` of its own. */
export function isWorkspace(root: string): boolean {
  return existsSync(join(root, WORKSPACE_FILE)) && !existsSync(join(root, 'fudic.json')) && projectFolders(root).length > 0;
}

/**
 * The fudic projects the server works on: each project of the workspace `root` is the root of,
 * in path order; or `root` itself. A workspace is checked, run and read project by project, as
 * its build does.
 */
export function projectsOf(root: string): readonly string[] {
  return isWorkspace(root) ? projectFolders(root) : [root];
}

/** The project of `projects` that holds `file`: the deepest; `root` when none does. */
export function projectOf(projects: readonly string[], root: string, file: string): string {
  const holding = projects.filter((project) => within(project, file));
  return holding.sort((a, b) => b.length - a.length)[0] ?? root;
}

/**
 * Whether `root` is a fudic project: a `fudic.json` in it or above it, or the root of a
 * workspace of fudic projects — which carries no `fudic.json` of its own, and where the CLI
 * aims each command with `--project`. Asked on every call, since the chat may have just
 * created it.
 */
export function isFudicProject(root: string): boolean {
  if (isWorkspace(root)) return true;
  for (let dir = root; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'fudic.json'))) return true;
    if (dirname(dir) === dir) return false;
  }
}

export function openProject(folder: string, git: Git = nodeGit): Project {
  // Absolute, whatever it was given: every path a tool answers is relative to it.
  const root = resolve(folder);
  return {
    root,
    name: nameOf(root),
    git,
    commit: () => {
      try {
        return git(root, ['rev-parse', '--short', 'HEAD']);
      } catch {
        return NO_COMMIT;
      }
    },
  };
}
