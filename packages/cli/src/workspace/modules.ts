/**
 * What `fudic add` and the generators that need a module share (BUG-50 §4.6): the optional
 * modules of fudic, the edit that makes a project depend on one, and the install that follows.
 */

import { FUDIC_VERSION } from '../project.js';
import { joinPosix, relativeTo } from '../paths.js';
import { declareDependency } from './link.js';
import { workspaceRoot } from './discover.js';
import type { ReadIo } from '../io.js';
import type { FileChange, PlanCommand } from '../types.js';
import type { Target } from './target.js';

/** The optional modules `fudic add` knows, by the name it takes. */
export const MODULES: Readonly<Record<string, string>> = {
  di: '@fudic/di',
  forms: '@fudic/forms',
  http: '@fudic/http',
  i18n: '@fudic/i18n',
};

/** The folder name of a project: how `--project` names it, and how the reports do. */
export function projectName(target: Target): string {
  return target.path.slice(target.path.lastIndexOf('/') + 1);
}

/** The edit that makes `target` depend on `pkg` at `version`; nothing when it already does. */
export function dependOn(target: Target, pkg: string, version: string, io: ReadIo): FileChange | undefined {
  return declareDependency(joinPosix(target.path, 'package.json'), joinPosix(target.dir, 'package.json'), pkg, version, io);
}

/** `dependOn` a module of fudic, at the version this CLI pins. */
export function dependOnModule(target: Target, pkg: string, io: ReadIo): FileChange | undefined {
  return dependOn(target, pkg, FUDIC_VERSION, io);
}

/** The install after it: the workspace's, from its root, or the project's own. */
export function installFor(target: Target, cwd: string, io: ReadIo): PlanCommand {
  const root = workspaceRoot(target.path, io) ?? target.path;
  return { command: 'pnpm', args: ['install'], dir: relativeTo(cwd, root) || '.', quiet: true };
}

/** The line a generator adds when it had to add the module it needs (BUG-50 §6.11, §6.12). */
export function addedLine(pkg: string, project: string): string {
  return `  Added ${pkg} ${FUDIC_VERSION} to ${project} (it was not there)`;
}
