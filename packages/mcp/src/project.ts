/**
 * The project the server works on: the folder it was started in, and nothing above or beside it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

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

/** Whether a folder of `root`'s folders has a `fudic.json`: `apps/web`, `libs/ui`. */
function holdsProjects(root: string): boolean {
  return readdirSync(root, { withFileTypes: true }).some(
    (group) =>
      group.isDirectory() &&
      group.name !== 'node_modules' &&
      readdirSync(join(root, group.name), { withFileTypes: true }).some(
        (entry) => entry.isDirectory() && existsSync(join(root, group.name, entry.name, 'fudic.json')),
      ),
  );
}

/**
 * Whether `root` is a fudic project: a `fudic.json` in it or above it, or the root of a
 * workspace of fudic projects — which carries no `fudic.json` of its own, and where the CLI
 * aims each command with `--project`. Asked on every call, since the chat may have just
 * created it.
 */
export function isFudicProject(root: string): boolean {
  if (existsSync(join(root, WORKSPACE_FILE)) && holdsProjects(root)) return true;
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
